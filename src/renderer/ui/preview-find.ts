import { button, chip, pressed } from './find'

/* Find in preview. The editor's find is a CodeMirror panel and lives with
 * the editor; reading a page shouldn't mean leaving it, so the preview has
 * its own bar — the same look and the same chips (case, regex, whole word),
 * no replace, because the page is read-only. Matches are painted with the
 * CSS Custom Highlight API: ranges over the rendered text, nothing written
 * into the DOM, so links, copy buttons, and source positions are untouched.
 * Enter finds next, Shift+Enter previous, Escape closes the bar and stays
 * in preview. */

export interface FindOptions {
  caseSensitive: boolean
  regexp: boolean
  wholeWord: boolean
}

export interface TextMatch {
  from: number
  to: number
}

const MATCH_CAP = 1000
const WORD = /[\p{L}\p{N}_]/u

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* Every match of query in text, in order, at most MATCH_CAP. An invalid
 * regex, or one that only matches the empty string, finds nothing. */
export function findTextMatches(text: string, query: string, options: FindOptions): TextMatch[] {
  if (query === '') return []
  let re: RegExp
  try {
    re = new RegExp(options.regexp ? query : escapeRegExp(query), options.caseSensitive ? 'gu' : 'giu')
  } catch {
    return []
  }
  const found: TextMatch[] = []
  for (const m of text.matchAll(re)) {
    const from = m.index
    const to = from + m[0].length
    if (to === from) continue
    if (options.wholeWord && (WORD.test(text[from - 1] ?? '') || WORD.test(text[to] ?? ''))) continue
    found.push({ from, to })
    if (found.length >= MATCH_CAP) break
  }
  return found
}

const ALL = 'fs-find'
const CURRENT = 'fs-find-current'

export class PreviewFind {
  readonly dom: HTMLElement
  private readonly input: HTMLInputElement
  private readonly count: HTMLElement
  private readonly caseChip: HTMLButtonElement
  private readonly reChip: HTMLButtonElement
  private readonly wordChip: HTMLButtonElement
  private ranges: Range[] = []
  private current = -1
  open = false

  constructor(
    /* The rendered page to search, and the pane that scrolls it. */
    private readonly page: () => HTMLElement | null,
    private readonly scroller: HTMLElement,
    private readonly onClose: () => void,
    /* Each query as typed — main.ts hands it to the editor's find. */
    private readonly onQuery?: (query: string, options: FindOptions) => void
  ) {
    this.dom = document.createElement('div')
    this.dom.className = 'find-panel preview-find'
    this.dom.hidden = true

    this.input = document.createElement('input')
    this.input.className = 'find-input'
    this.input.placeholder = 'Find'
    this.input.setAttribute('aria-label', 'Find in page')

    this.count = document.createElement('span')
    this.count.className = 'find-count'

    this.caseChip = chip('Aa', 'Match case', false, () => this.search())
    this.reChip = chip('.*', 'Regular expression', false, () => this.search())
    this.wordChip = chip('ab', 'Whole word', false, () => this.search())

    this.input.addEventListener('input', () => this.search())
    this.dom.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        // The pane's own Escape leaves preview; this one only closes the bar.
        e.stopPropagation()
        this.close()
        this.onClose()
      } else if (e.key === 'Enter' && e.target === this.input) {
        e.preventDefault()
        this.step(e.shiftKey ? -1 : 1)
      }
    })
    // The bar sits inside the pane: a double-click here is not a request
    // to edit the document, and a press here starts no table drag.
    this.dom.addEventListener('dblclick', (e) => e.stopPropagation())
    this.dom.addEventListener('mousedown', (e) => e.stopPropagation())

    const row = document.createElement('div')
    row.className = 'find-row'
    const chips = document.createElement('span')
    chips.className = 'find-chips'
    chips.append(this.caseChip, this.reChip, this.wordChip)
    row.append(
      this.input,
      button('‹', 'Previous match', () => this.step(-1)),
      button('›', 'Next match', () => this.step(1)),
      chips,
      this.count,
      button('×', 'Close', () => {
        this.close()
        this.onClose()
      })
    )
    this.dom.append(row)
  }

  get query(): string {
    return this.input.value
  }

  /* Show the bar and select its text; a seed (the selection, or the
   * editor's query) replaces the text first. A second ⌘F just refocuses. */
  show(seed?: string): void {
    const seeded = seed !== undefined && seed !== '' && seed !== this.input.value
    if (seeded) this.input.value = seed
    const wasOpen = this.open
    this.dom.hidden = false
    this.open = true
    this.input.focus()
    this.input.select()
    // Refocusing an open bar keeps the place in its matches.
    if (!wasOpen || seeded) this.search()
  }

  close(): void {
    if (!this.open) return
    this.dom.hidden = true
    this.open = false
    this.ranges = []
    this.current = -1
    this.paint()
  }

  /* The page was re-rendered under an open bar: search the new text. */
  refresh(): void {
    if (this.open) this.search(false)
  }

  next(): void {
    this.step(1)
  }

  previous(): void {
    this.step(-1)
  }

  private options(): FindOptions {
    return { caseSensitive: pressed(this.caseChip), regexp: pressed(this.reChip), wholeWord: pressed(this.wordChip) }
  }

  private search(report = true): void {
    const options = this.options()
    if (report) this.onQuery?.(this.input.value, options)
    const page = this.page()
    this.ranges = page ? this.collect(page, this.input.value, options) : []
    // Start at the first match on screen or below it, like a browser.
    const top = this.scroller.getBoundingClientRect().top + this.dom.offsetHeight
    const visible = this.ranges.findIndex((r) => r.getBoundingClientRect().bottom > top)
    this.current = this.ranges.length === 0 ? -1 : visible === -1 ? 0 : visible
    this.paint()
    this.reveal()
  }

  private collect(page: HTMLElement, query: string, options: FindOptions): Range[] {
    const nodes: Text[] = []
    const starts: number[] = []
    let text = ''
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      nodes.push(node as Text)
      starts.push(text.length)
      text += node.nodeValue ?? ''
    }
    // Offset in the joined text → (node, offset); an end lands at the end
    // of its node rather than the start of the next.
    const locate = (at: number, end: boolean): [Text, number] | null => {
      let lo = 0
      let hi = nodes.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        const start = starts[mid] ?? 0
        if (start < at || (!end && start === at)) lo = mid
        else hi = mid - 1
      }
      const node = nodes[lo]
      return node ? [node, at - (starts[lo] ?? 0)] : null
    }
    const ranges: Range[] = []
    for (const m of findTextMatches(text, query, options)) {
      const start = locate(m.from, false)
      const end = locate(m.to, true)
      if (!start || !end) continue
      const range = document.createRange()
      range.setStart(start[0], start[1])
      range.setEnd(end[0], end[1])
      ranges.push(range)
    }
    return ranges
  }

  private step(direction: 1 | -1): void {
    if (this.ranges.length === 0) return
    this.current = (this.current + direction + this.ranges.length) % this.ranges.length
    this.paint()
    this.reveal()
  }

  private paint(): void {
    CSS.highlights.delete(ALL)
    CSS.highlights.delete(CURRENT)
    if (this.ranges.length > 0) CSS.highlights.set(ALL, new Highlight(...this.ranges))
    const current = this.ranges[this.current]
    if (current) CSS.highlights.set(CURRENT, new Highlight(current))
    const n = this.ranges.length
    this.count.textContent =
      this.input.value === '' ? '' : n === 0 ? 'No matches' : `${this.current + 1} of ${n >= MATCH_CAP ? `${MATCH_CAP}+` : n}`
  }

  /* Bring the current match to the middle of the pane when it's out of
   * view, below the bar. */
  private reveal(): void {
    const range = this.ranges[this.current]
    if (!range) return
    const rect = range.getBoundingClientRect()
    const pane = this.scroller.getBoundingClientRect()
    const top = pane.top + this.dom.offsetHeight
    if (rect.top >= top && rect.bottom <= pane.bottom) return
    this.scroller.scrollTop += rect.top - (top + pane.bottom) / 2
  }
}
