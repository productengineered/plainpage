import { resolveImageSrc } from '../editor/live-preview/images'
import {
  columnDisplayWidth,
  commitCell,
  formatTable,
  hasLongToken,
  isResponseTable,
  parseTable,
  setColumnWidth,
  tableSourceAt
} from '../editor/table-model'
import { renderMarkdown } from '../../shared/markdown'
import { tokenMs } from './tokens'

/* Index of the stamp best covering pos: the largest one <= pos. DOM order is
 * not source order — remark-rehype hoists footnote definitions to the end of
 * the document while they keep their early source offsets — so a last-match
 * scan would land on the footnote block instead of the requested element. */
export function bestCoveringIndex(positions: readonly number[], pos: number): number {
  let best = -1
  let bestPos = -1
  positions.forEach((at, i) => {
    if (at <= pos && at > bestPos) {
      bestPos = at
      best = i
    }
  })
  return best
}

const isWordChar = (ch: string | undefined): boolean =>
  ch !== undefined && /[\p{L}\p{N}_']/u.test(ch)

/* Exact source offset of a click inside a rendered block. Rendered text and
 * markdown source disagree (mark syntax, link targets, escapes), so instead
 * of arithmetic the clicked word is re-found: expand the click to a word,
 * count which whole-word occurrence of it precedes the click in the rendered
 * text, and locate the same occurrence in the source after the block's
 * data-pos stamp. The search window is bounded so a word this block only has
 * inside syntax (e.g. split by marks: `win**ning**`) fails to a null — the
 * caller falls back to the block start — rather than matching text pages
 * away. */
export function sourceOffsetAt(
  source: string,
  blockPos: number,
  renderedText: string,
  renderedOffset: number
): number | null {
  let start = renderedOffset
  let end = renderedOffset
  while (start > 0 && isWordChar(renderedText[start - 1])) start--
  while (end < renderedText.length && isWordChar(renderedText[end])) end++
  if (start === end) return null
  const word = renderedText.slice(start, end)
  const wholeWordAt = (text: string, i: number): boolean =>
    !isWordChar(text[i - 1]) && !isWordChar(text[i + word.length])

  let skip = 0
  for (let i = renderedText.indexOf(word); i !== -1 && i < start; i = renderedText.indexOf(word, i + 1)) {
    if (wholeWordAt(renderedText, i)) skip++
  }
  const window = source.slice(blockPos, blockPos + renderedText.length * 2 + 500)
  for (let i = window.indexOf(word); i !== -1; i = window.indexOf(word, i + 1)) {
    if (!wholeWordAt(window, i)) continue
    if (skip === 0) return blockPos + i + (renderedOffset - start)
    skip--
  }
  return null
}

/* sourceOffsetAt, extended to clicks that touch no word: the gap between
 * words, a code line's indentation. The nearest word on the clicked line is
 * mapped instead, and the caret crosses back over the gap when the source
 * holds the same characters there (a code block's do, verbatim); otherwise
 * it settles at that word's edge. Null only for a line with no word. */
export function sourceOffsetNear(
  source: string,
  blockPos: number,
  renderedText: string,
  renderedOffset: number
): number | null {
  const exact = sourceOffsetAt(source, blockPos, renderedText, renderedOffset)
  if (exact !== null) return exact
  const lineStart = renderedText.lastIndexOf('\n', renderedOffset - 1) + 1
  const newline = renderedText.indexOf('\n', renderedOffset)
  const lineEnd = newline === -1 ? renderedText.length : newline

  let before = renderedOffset
  while (before > lineStart && !isWordChar(renderedText[before - 1])) before--
  const wordEnd = before > lineStart ? sourceOffsetAt(source, blockPos, renderedText, before) : null
  if (wordEnd !== null) {
    const gap = renderedText.slice(before, renderedOffset)
    return source.startsWith(gap, wordEnd) ? wordEnd + gap.length : wordEnd
  }

  let after = renderedOffset
  while (after < lineEnd && !isWordChar(renderedText[after])) after++
  const wordStart = after < lineEnd ? sourceOffsetAt(source, blockPos, renderedText, after) : null
  if (wordStart !== null) {
    const gap = renderedText.slice(renderedOffset, after)
    return source.slice(wordStart - gap.length, wordStart) === gap ? wordStart - gap.length : wordStart
  }
  return null
}

/* Caret position under a pointer event, constrained to an element.
 * caretPositionFromPoint is the standard; caretRangeFromPoint the WebKit
 * legacy — Chromium has both, but feature-detect anyway. */
function caretAt(event: MouseEvent, within: Element): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?(x: number, y: number): Range | null
  }
  const pos = doc.caretPositionFromPoint?.(event.clientX, event.clientY)
  if (pos && within.contains(pos.offsetNode)) return { node: pos.offsetNode, offset: pos.offset }
  const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY)
  if (range && within.contains(range.startContainer)) {
    return { node: range.startContainer, offset: range.startOffset }
  }
  return null
}

/* The caret's offset into the holder's rendered text — Range.toString()
 * concatenates the same text nodes textContent does. */
function renderedOffsetOf(holder: Element, caret: { node: Node; offset: number }): number {
  const range = document.createRange()
  range.selectNodeContents(holder)
  range.setEnd(caret.node, caret.offset)
  return range.toString().length
}

/* Viewport top of the text line the caret sits on. A collapsed range's rect
 * is the caret's own line box; some positions (element boundaries) have no
 * rect — callers fall back to the block. */
function caretLineTop(caret: { node: Node; offset: number }): number | null {
  const range = document.createRange()
  range.setStart(caret.node, caret.offset)
  range.setEnd(caret.node, caret.offset)
  const rect = range.getClientRects()[0]
  return rect !== undefined && rect.height > 0 ? rect.top : null
}

const SVG_NS = 'http://www.w3.org/2000/svg'
/* One stroke style for both faces of the copy button: two overlapping
 * sheets, and the check that stands in for them after a copy. */
const COPY_ICON = ['M5.5 5.5h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z', 'M2.5 10.5v-7a1 1 0 0 1 1-1h7']
const CHECK_ICON = ['M3 8.5l3 3 7-7']

function icon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

/* A code block's copy button: puts the block's text on the clipboard and
 * shows a check for a moment. It keeps focus on the pane (keyboard
 * scrolling lives there), and a double-click on it copies twice rather than
 * dropping into the editor. */
function copyButton(text: () => string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'code-copy'
  button.title = 'Copy'
  button.setAttribute('aria-label', 'Copy code')
  button.append(icon(COPY_ICON))
  let reset: number | undefined
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('dblclick', (event) => event.stopPropagation())
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    navigator.clipboard.writeText(text()).then(
      () => {
        button.classList.add('copied')
        button.setAttribute('aria-label', 'Copied')
        button.replaceChildren(icon(CHECK_ICON))
        window.clearTimeout(reset)
        reset = window.setTimeout(() => {
          button.classList.remove('copied')
          button.setAttribute('aria-label', 'Copy code')
          button.replaceChildren(icon(COPY_ICON))
        }, tokenMs('--dur-copied'))
      },
      (err: unknown) => console.error('code block copy failed', err)
    )
  })
  return button
}

/* Index of the span covering (or nearest to) a target line. Ties go to the
 * later span: document order puts children after their parents, so nested
 * elements resolve to the most specific one under the line. */
export function nearestSpanIndex(
  spans: readonly { top: number; bottom: number }[],
  target: number
): number {
  let best = -1
  let bestDist = Infinity
  spans.forEach((span, i) => {
    const dist =
      target < span.top ? span.top - target : target > span.bottom ? target - span.bottom : 0
    if (dist <= bestDist) {
      bestDist = dist
      best = i
    }
  })
  return best
}

/* Preview mode: the document rendered by THE export pipeline — what you
 * preview is exactly what HTML and PDF export produce. Read-only by nature;
 * double-clicking any element drops back into the editor at that element's
 * source position (the data-pos stamps). Links open externally instead of
 * navigating the window.
 *
 * The one interactive exception: table column edges. Tables render with
 * their columns proportioned by the model's display widths, and dragging a
 * boundary between two columns redistributes them — written back to the
 * markdown source through the applyEdit hook (absent for the help pane,
 * which is genuinely read-only).
 *
 * And response tables (table-model isResponseTable): their answer cells
 * take a click and typing right here, so a reviewer can write back to the
 * document while its links stay one plain click away. Every keystroke
 * writes through applyEdit; the pane re-renders when the answer is done. */

interface ColumnResize {
  cols: HTMLTableColElement[]
  left: number
  startX: number
  tablePx: number
  startPct: number[]
  totalChars: number
  from: number
  to: number
  lastDelta: number
  onMove: (e: MouseEvent) => void
  onUp: () => void
}

interface AnswerEdit {
  cell: HTMLElement
  /* The table's source offset — fixed while its own cells change. */
  from: number
  row: number
}

/* Enough for a working set of tabs; each entry is one document's HTML. */
const RENDER_CACHE_SIZE = 12

export class Preview {
  private readonly el: HTMLElement
  visible = false

  private markdown = ''
  private docDir: string | null = null
  private resize: ColumnResize | null = null
  private answer: AnswerEdit | null = null
  /* An answer clicked while another was open, by index among answers. */
  private pendingAnswer: number | null = null
  private pointerDown = false
  /* Renders are async and can overlap — two files opened at once, a tab
   * switch mid-render. Only the newest show may touch the pane; an older
   * one finishing later must not overwrite its HTML or its visibility. */
  private showGen = 0
  /* Rendered HTML by source, newest last — flipping back to a tab whose
   * text hasn't changed skips the pipeline and paints on the next frame. */
  private readonly rendered = new Map<string, string>()

  constructor(
    private readonly onEdit: (pos: number, screenTop?: number) => void,
    private readonly applyEdit?: (from: number, to: number, insert: string) => string | null
  ) {
    this.el = document.createElement('div')
    this.el.className = 'preview'
    /* The body scroll is locked (overflow: hidden) and hiding the editor
     * drops focus to <body> — the pane itself must hold focus or Space,
     * arrows, and PageDown scroll nothing. */
    this.el.tabIndex = -1
    this.el.hidden = true
    document.body.append(this.el)

    this.el.addEventListener('dblclick', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.fs-response-answer')) return
      // Off any stamped element — the margin, the gap between blocks — the
      // nearest block stands in, so the page still holds still.
      const holder = target?.closest<HTMLElement>('[data-pos]') ?? this.stampedNearest(event.clientY)?.el
      if (!holder) {
        this.onEdit(0)
        return
      }
      // The viewport top of what was clicked rides along so the editor can
      // land the cursor's line at the same height — the page holds still
      // under the click. When the click resolves to an exact source offset,
      // that's the clicked line's top; on fallback, the block's.
      const blockPos = Number(holder.dataset['pos'])
      const caret = caretAt(event, holder)
      const refined =
        caret === null
          ? null
          : sourceOffsetNear(
              this.markdown,
              blockPos,
              holder.textContent ?? '',
              renderedOffsetOf(holder, caret)
            )
      if (refined === null || caret === null) {
        this.onEdit(blockPos, holder.getBoundingClientRect().top)
      } else {
        this.onEdit(refined, caretLineTop(caret) ?? holder.getBoundingClientRect().top)
      }
    })

    this.el.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const link = target?.closest<HTMLAnchorElement>('a[href]')
      if (!link) return
      event.preventDefault()
      const href = link.getAttribute('href') ?? ''
      if (href.startsWith('#')) {
        // In-document link (GFM footnotes): navigate inside this pane.
        // link.href would resolve against the page URL — file:// (rejected
        // by main's scheme allowlist) or, in dev, the dev server's http URL
        // (which would open the dev server in the user's browser). Scoped to
        // this.el because help and preview panes share one document.
        const id = decodeURIComponent(href.slice(1))
        this.el.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' })
        return
      }
      window.foolscap.openExternal(link.href)
    })

    if (this.applyEdit) {
      this.el.addEventListener('mousemove', (event) => {
        if (this.resize) return
        this.el.style.cursor = this.boundaryUnder(event) ? 'col-resize' : ''
      })
      this.el.addEventListener('mousedown', (event) => this.startResize(event))
      this.el.addEventListener('mousedown', (event) => this.startAnswer(event))
      this.el.addEventListener('mousedown', () => (this.pointerDown = true), { capture: true })
      window.addEventListener('mouseup', () => (this.pointerDown = false), { capture: true })
    }
  }

  /* Resolves true once the pane shows this document; false when a newer
   * show superseded it mid-render, in which case nothing was touched. */
  async show(markdown: string, docDir: string | null, nearPos: number): Promise<boolean> {
    const gen = ++this.showGen
    const html = this.rendered.get(markdown) ?? (await renderMarkdown(markdown, { sourcePositions: true }))
    if (gen !== this.showGen) return false
    this.rendered.delete(markdown)
    this.rendered.set(markdown, html)
    for (const key of this.rendered.keys()) {
      if (this.rendered.size <= RENDER_CACHE_SIZE) break
      this.rendered.delete(key)
    }
    this.markdown = markdown
    this.docDir = docDir
    this.render(html)
    this.el.hidden = false
    this.visible = true
    this.focus()
    // Land near where the cursor was in the editor.
    if (nearPos > 0) this.scrollTo(nearPos, 'center')
    else this.el.scrollTop = 0
    return true
  }

  private render(html: string): void {
    // An answer still open in the old DOM is gone with it; its typing is
    // already in the source.
    this.answer = null
    this.el.innerHTML = `<main class="preview-doc">${html}</main>`
    // The pipeline escapes raw HTML, so this is our own output only.
    for (const img of this.el.querySelectorAll('img')) {
      const src = img.getAttribute('src')
      const resolved = src ? resolveImageSrc(src, this.docDir) : null
      if (resolved) img.src = resolved
      else img.removeAttribute('src')
    }
    this.sizeTables()
    this.addCopyButtons()
  }

  /* Every code block gets a copy button. It sits beside the <pre> in a
   * wrapper, not inside it, so the block's text stays exactly the code (a
   * double-click maps that text back to the source) and the button holds
   * its corner. Preview only: exports render without it. */
  private addCopyButtons(): void {
    for (const pre of this.el.querySelectorAll('pre')) {
      const code = pre.querySelector('code')
      if (!code) continue
      const block = document.createElement('div')
      block.className = 'code-block'
      pre.replaceWith(block)
      block.append(pre, copyButton(() => code.textContent ?? ''))
    }
  }

  /* Scroll the rendered pane to the element covering a source position —
   * outline jumps while previewing land here. */
  scrollTo(pos: number, block: ScrollLogicalPosition = 'start'): void {
    const candidates = [...this.el.querySelectorAll<HTMLElement>('[data-pos]')]
    const stamps = candidates.map((c) => Number(c.dataset['pos']))
    const best = candidates[bestCoveringIndex(stamps, pos)]
    best?.scrollIntoView({ block })
  }

  focus(): void {
    this.el.focus({ preventScroll: true })
  }

  hide(): void {
    this.el.hidden = true
    this.visible = false
  }

  /* Source position and viewport top of the content at the pane's center,
   * so leaving preview (⌘E, Escape) lands the editor where the reader was —
   * same block, same height on screen — not wherever the editor last sat.
   * Read before hide(): a hidden pane has no geometry. */
  visibleAnchor(): { pos: number; top: number } | null {
    const center = this.el.getBoundingClientRect().top + this.el.clientHeight / 2
    const nearest = this.stampedNearest(center)
    return nearest ? { pos: Number(nearest.el.dataset['pos']), top: nearest.top } : null
  }

  /* The stamped element covering (or nearest to) a viewport height. */
  private stampedNearest(y: number): { el: HTMLElement; top: number } | null {
    const candidates = [...this.el.querySelectorAll<HTMLElement>('[data-pos]')]
    const rects = candidates.map((c) => c.getBoundingClientRect())
    const best = nearestSpanIndex(
      rects.map((r) => ({ top: r.top, bottom: r.bottom })),
      y
    )
    const el = candidates[best]
    const rect = rects[best]
    return el && rect ? { el, top: rect.top } : null
  }

  /* ---- table columns: proportioned by the model, draggable at edges ---- */

  /* Give every table a colgroup whose percentages mirror the source
   * model's display widths, so a column resized in either mode renders at
   * its recorded proportion here — under auto layout, so the browser
   * still keeps each column at least as wide as its longest word. Fixed
   * layout honoured the percentages to the pixel and let a short ID
   * column collapse to one character per line beside long prose. */
  private sizeTables(): void {
    for (const table of this.el.querySelectorAll<HTMLTableElement>('table[data-pos]')) {
      const source = tableSourceAt(this.markdown, Number(table.dataset['pos']))
      if (!source) continue
      for (const cell of table.querySelectorAll('td, th')) {
        if (hasLongToken(cell.textContent ?? '')) cell.classList.add('fs-cell-breakable')
      }
      const model = parseTable(source.text)
      // A response table sizes itself in CSS (.fs-response-table).
      if (isResponseTable(model)) {
        table.classList.add('fs-response-table')
        if (this.applyEdit) {
          table.querySelectorAll('tr').forEach((tr, row) => {
            const cell = tr.lastElementChild
            if (!(cell instanceof HTMLElement) || tr.children.length !== 2) return
            cell.classList.add('fs-response-answer')
            cell.dataset['row'] = String(row)
          })
        }
        continue
      }
      const weights = model.header.map((_, i) => columnDisplayWidth(model, i))
      const total = weights.reduce((a, b) => a + b, 0)
      if (weights.length === 0 || total <= 0) continue
      const colgroup = document.createElement('colgroup')
      for (const weight of weights) {
        const col = document.createElement('col')
        col.style.width = `${((weight / total) * 100).toFixed(3)}%`
        colgroup.append(col)
      }
      table.prepend(colgroup)
      table.style.width = '100%'
    }
  }

  /* ---- response answers: typed in place ---- */

  private startAnswer(event: MouseEvent): void {
    if (event.button !== 0) return
    const target = event.target instanceof Element ? event.target : null
    // A link inside an answer still opens; the cell being edited keeps the
    // browser's own caret placement and selection.
    if (!target || target.closest('a[href]')) return
    const cell = target.closest<HTMLElement>('.fs-response-answer')
    if (!cell || this.answer?.cell === cell) return
    event.preventDefault()
    if (this.answer) {
      // Another answer is open, and finishing it re-renders the pane (every
      // later table may have moved): begin this one in the new DOM, found
      // again by its index.
      this.pendingAnswer = [...this.el.querySelectorAll('.fs-response-answer')].indexOf(cell)
      this.answer.cell.blur()
      return
    }
    this.beginAnswer(cell)
  }

  private beginAnswer(cell: HTMLElement): void {
    const from = Number(cell.closest<HTMLTableElement>('table[data-pos]')?.dataset['pos'])
    const source = Number.isNaN(from) ? null : tableSourceAt(this.markdown, from)
    if (!source) return
    const row = Number(cell.dataset['row'])
    const model = parseTable(source.text)
    const raw = (row === 0 ? model.header[1] : model.rows[row - 1]?.[1]) ?? ''
    // The source, not the rendering: the answer's markdown is what's edited.
    cell.textContent = raw.replace(/<br\s*\/?>/gi, '\n')
    cell.contentEditable = 'plaintext-only'
    cell.classList.add('fs-editing-cell')
    this.answer = { cell, from, row }
    cell.addEventListener('input', this.onAnswerInput)
    cell.addEventListener('compositionend', this.onAnswerInput)
    cell.addEventListener('keydown', this.onAnswerKey)
    cell.addEventListener('blur', this.onAnswerBlur)
    cell.focus()
    const caret = document.getSelection()
    caret?.selectAllChildren(cell)
    caret?.collapseToEnd()
  }

  /* The open answer's text into the source. Mid-composition input waits
   * for compositionend, which lands here too. */
  private writeAnswer(): void {
    const answer = this.answer
    if (!answer || !this.applyEdit) return
    const source = tableSourceAt(this.markdown, answer.from)
    if (!source) return
    const next = commitCell(source.text, answer.row, 1, answer.cell.textContent ?? '')
    if (next === null) return
    const updated = this.applyEdit(answer.from, source.to, next)
    // Later data-pos stamps go stale until the re-render on finish; the
    // table's own offset does not move.
    if (updated !== null) this.markdown = updated
  }

  private readonly onAnswerInput = (event: Event): void => {
    if (event instanceof InputEvent && event.isComposing) return
    this.writeAnswer()
  }

  /* Enter or Escape finishes the answer (Escape must not also leave
   * preview); Shift-Enter is a line break, the browser's own. An Enter
   * that confirms an IME composition is the composition's. */
  private readonly onAnswerKey = (event: KeyboardEvent): void => {
    if (event.isComposing) return
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.answer?.cell.blur()
    }
  }

  private readonly onAnswerBlur = (): void => this.finishAnswer()

  private finishAnswer(): void {
    const answer = this.answer
    if (!answer) return
    this.writeAnswer()
    this.answer = null
    answer.cell.removeEventListener('input', this.onAnswerInput)
    answer.cell.removeEventListener('compositionend', this.onAnswerInput)
    answer.cell.removeEventListener('keydown', this.onAnswerKey)
    answer.cell.removeEventListener('blur', this.onAnswerBlur)
    answer.cell.removeAttribute('contenteditable')
    answer.cell.classList.remove('fs-editing-cell')
    // A click elsewhere ended the answer: re-render only once it lands, so
    // a link clicked straight out of an answer still gets its click.
    if (this.pointerDown) {
      window.addEventListener('mouseup', () => setTimeout(() => void this.rerenderAfterAnswer()), { once: true })
    } else {
      void this.rerenderAfterAnswer()
    }
  }

  /* The answer shows as markdown again, and every later data-pos picks up
   * the table's new length; then any answer clicked meanwhile begins. */
  private async rerenderAfterAnswer(): Promise<void> {
    const scroll = this.el.scrollTop
    const gen = this.showGen
    const markdown = this.markdown
    const html = await renderMarkdown(markdown, { sourcePositions: true })
    // A newer show owns the pane, or the source moved on: that render wins.
    if (gen !== this.showGen || markdown !== this.markdown || this.answer) return
    this.render(html)
    this.el.scrollTop = scroll
    const pending = this.pendingAnswer
    this.pendingAnswer = null
    if (pending === null) return
    const cell = this.el.querySelectorAll<HTMLElement>('.fs-response-answer')[pending]
    if (cell) this.beginAnswer(cell)
  }

  /* The column boundary under the pointer: within a few px of the edge
   * between two cells. The table's outer edges are not boundaries. */
  private boundaryUnder(event: MouseEvent): { table: HTMLTableElement; left: number } | null {
    const target = event.target instanceof Element ? event.target : null
    const cell = target?.closest<HTMLTableCellElement>('td, th')
    const table = cell?.closest('table')
    if (!cell || !table || table.dataset['pos'] === undefined) return null
    // A response table's columns are fixed by CSS; nothing to drag.
    if (table.classList.contains('fs-response-table')) return null
    const row = cell.parentElement
    if (!(row instanceof HTMLTableRowElement)) return null
    const rect = cell.getBoundingClientRect()
    if (cell.cellIndex < row.cells.length - 1 && rect.right - event.clientX <= 5) {
      return { table, left: cell.cellIndex }
    }
    if (cell.cellIndex > 0 && event.clientX - rect.left <= 5) {
      return { table, left: cell.cellIndex - 1 }
    }
    return null
  }

  private startResize(event: MouseEvent): void {
    if (event.button !== 0 || this.resize || !this.applyEdit) return
    const boundary = this.boundaryUnder(event)
    if (!boundary) return
    const from = Number(boundary.table.dataset['pos'])
    const source = tableSourceAt(this.markdown, from)
    const cols = [...boundary.table.querySelectorAll<HTMLTableColElement>('col')]
    if (!source || cols.length === 0) return
    const model = parseTable(source.text)
    if (cols.length !== model.header.length || boundary.left >= model.header.length - 1) return
    event.preventDefault()
    const weights = model.header.map((_, i) => columnDisplayWidth(model, i))
    const total = weights.reduce((a, b) => a + b, 0)
    if (total <= 0) return
    const onMove = (e: MouseEvent): void => this.moveResize(e)
    const onUp = (): void => void this.endResize()
    this.resize = {
      cols,
      left: boundary.left,
      startX: event.clientX,
      tablePx: Math.max(1, boundary.table.getBoundingClientRect().width),
      startPct: weights.map((w) => (w / total) * 100),
      totalChars: total,
      from,
      to: source.to,
      lastDelta: 0,
      onMove,
      onUp
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
  }

  /* Width moves between the two neighbors; the table's own width holds. */
  private moveResize(e: MouseEvent): void {
    const resize = this.resize
    if (!resize) return
    const raw = ((e.clientX - resize.startX) / resize.tablePx) * 100
    const min = (6 / resize.totalChars) * 100
    const leftPct = resize.startPct[resize.left] ?? 0
    const rightPct = resize.startPct[resize.left + 1] ?? 0
    const delta = Math.max(min - leftPct, Math.min(rightPct - min, raw))
    resize.lastDelta = delta
    const colLeft = resize.cols[resize.left]
    const colRight = resize.cols[resize.left + 1]
    if (colLeft) colLeft.style.width = `${(leftPct + delta).toFixed(3)}%`
    if (colRight) colRight.style.width = `${(rightPct - delta).toFixed(3)}%`
  }

  private async endResize(): Promise<void> {
    const resize = this.resize
    if (!resize) return
    this.resize = null
    window.removeEventListener('mousemove', resize.onMove)
    window.removeEventListener('mouseup', resize.onUp)
    document.body.style.cursor = ''
    if (resize.lastDelta === 0 || !this.applyEdit) return
    const leftPct = (resize.startPct[resize.left] ?? 0) + resize.lastDelta
    const rightPct = (resize.startPct[resize.left + 1] ?? 0) - resize.lastDelta
    const source = tableSourceAt(this.markdown, resize.from)
    if (!source) return
    let model = parseTable(source.text)
    model = setColumnWidth(model, resize.left, (leftPct / 100) * resize.totalChars)
    model = setColumnWidth(model, resize.left + 1, (rightPct / 100) * resize.totalChars)
    const next = formatTable(model)
    if (next === source.text) return
    const updated = this.applyEdit(resize.from, resize.to, next)
    if (updated === null) return
    // Re-render: the table's new source length shifts every later data-pos.
    this.markdown = updated
    const scroll = this.el.scrollTop
    const gen = this.showGen
    const html = await renderMarkdown(updated, { sourcePositions: true })
    if (gen !== this.showGen) return // a newer show owns the pane now
    this.render(html)
    this.el.scrollTop = scroll
  }
}
