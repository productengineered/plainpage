import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { createCssVariablesTheme, createBundledHighlighter, type HighlighterGeneric } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { unified } from 'unified'
import { GRAMMARS, type GrammarName } from './grammars'

/* THE one markdown pipeline (ULTRAPLAN §3.1 corollary, CLAUDE.md second
 * rule). HTML export and PDF export both render through here — never a
 * second parser, never a "just for export" alternative. GFM covers tables,
 * strikethrough, autolinks, task lists, and footnotes. Fences highlight via
 * the same css-variables Shiki theme as the editor, so every token color in
 * an export resolves from tokens.css exactly like on screen. */

export const shikiTheme = createCssVariablesTheme({
  name: 'foolscap-vars',
  variablePrefix: '--shiki-',
  fontStyle: true
})

export type Highlighter = HighlighterGeneric<GrammarName, string>

/* Shiki's bundle factory over Foolscap's own grammar set (grammars.ts)
 * rather than the full bundle: names resolve against that set, so the
 * build carries those grammars and no others. */
const createHighlighter = createBundledHighlighter<GrammarName, string>({
  langs: GRAMMARS,
  themes: {},
  engine: () => createJavaScriptRegexEngine({ forgiving: true })
})

let highlighterPromise: Promise<Highlighter> | null = null

/* One highlighter per process, shared by this pipeline and the editor's
 * fence decorations (code-fence.ts). The JavaScript regex engine, not
 * Oniguruma: the WASM engine plus the batteries-included rehype plugin
 * cost ~1.2s of first-render latency per window (measured), all spent
 * fetching WASM and registering ~220 grammars up front. Here nothing
 * loads until a fence actually names a language. */
export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) highlighterPromise = createHighlighter({ themes: [shikiTheme], langs: [] })
  return highlighterPromise
}

/* Minimal structural view of a hast node — enough to stamp positions
 * without pulling in @types/hast. */
interface HastNode {
  type?: string
  tagName?: string
  position?: { start?: { offset?: number } }
  properties?: Record<string, unknown>
  children?: HastNode[]
}

/* Every <pre> in document order. */
function preElements(tree: HastNode): HastNode[] {
  const found: HastNode[] = []
  const walk = (node: HastNode): void => {
    if (node.type === 'element' && node.tagName === 'pre') found.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return found
}

/* Code-block stamps ride across the highlighter on the file being
 * processed, not in plugin state — the processor is shared, and renders
 * overlap. */
interface StampCarrier {
  data: object
}
const codeStamps = (file: StampCarrier): { codeStamps?: unknown[] } =>
  file.data as { codeStamps?: unknown[] }

/* Stamp each element with its source offset (data-pos). Preview mode uses
 * this to map a double-click back into the editor; exports never enable it,
 * so their output stays byte-identical. */
function rehypeSourcePositions() {
  return (tree: HastNode, file: StampCarrier): void => {
    const walk = (node: HastNode): void => {
      if (node.type === 'element' && node.position?.start?.offset !== undefined) {
        node.properties = { ...node.properties, dataPos: String(node.position.start.offset) }
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
    codeStamps(file).codeStamps = preElements(tree).map((pre) => pre.properties?.['dataPos'])
  }
}

/* Shiki swaps each <pre> it highlights for a fresh one, and the stamp goes
 * with the old node — so a double-click in a code block found no position
 * and dropped the editor at the top of the document. The swap is in place,
 * one <pre> for one, so the stamps go back on in document order. */
function rehypeRestoreCodeStamps() {
  return (tree: HastNode, file: StampCarrier): void => {
    const stamps = codeStamps(file).codeStamps ?? []
    preElements(tree).forEach((pre, i) => {
      const stamp = stamps[i]
      if (stamp !== undefined) pre.properties = { ...pre.properties, dataPos: stamp }
    })
  }
}

/* Minimal structural view of an mdast node — enough to retype one kind of
 * node without pulling in @types/mdast. */
interface MdastNode {
  type: string
  value?: string
  children?: MdastNode[]
  position?: { start: { offset?: number; column?: number }; end: { offset?: number } }
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

const BR_HTML = /^<br\s*\/?>$/i

/* A literal <br> is a line break. Raw HTML otherwise stays out of the
 * output (nothing here passes it through), but this one tag is the only
 * line break a pipe table can hold — a newline ends the row — so the
 * editor's grid types it on Shift-Enter, and GitHub reads it the same
 * way. The node is retyped in place: remark-rehype renders `break` as
 * <br>, exactly like a hard line break. */
function remarkBrTags() {
  return (tree: MdastNode): void => {
    const walk = (node: MdastNode): void => {
      for (const child of node.children ?? []) {
        if (child.type === 'html' && child.value !== undefined && BR_HTML.test(child.value)) {
          child.type = 'break'
          delete child.value
        }
        walk(child)
      }
    }
    walk(tree)
  }
}

const COPY_OPEN = /^<!--\s*copy\s*-->$/i
const COPY_CLOSE = /^<!--\s*\/copy\s*-->$/i

/* Containers whose children are blocks — the only places a marker can
 * stand on its own line. Inside a paragraph it is inline html, left out. */
const FLOW_PARENTS = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition'])

/* A copy section: the blocks between `<!-- copy -->` and `<!-- /copy -->`
 * (or the end of their container, when the closing marker is missing).
 * The markers are html comments, so GitHub and every other renderer hide
 * them, and the file stays plain markdown. The run is wrapped in one
 * <div class="copy-section">; the preview gives it a copy button. With
 * source positions, the div also records the markdown between the
 * markers (data-copy-from/to), which is what the button copies. Markers
 * don't nest — an opening marker inside an open section is dropped.
 * (Options ride in an object: unified reads a bare `false` as "plugin
 * off".) */
function remarkCopySections({ positions }: { positions: boolean }) {
  const marker = (node: MdastNode, re: RegExp): boolean =>
    node.type === 'html' && node.value !== undefined && re.test(node.value.trim())
  return (tree: MdastNode): void => {
    const walk = (node: MdastNode): void => {
      const children = node.children
      if (!children) return
      if (FLOW_PARENTS.has(node.type)) {
        const out: MdastNode[] = []
        let open: { start: MdastNode; inner: MdastNode[] } | null = null
        const close = (end: MdastNode | null): void => {
          if (!open) return
          const { start, inner } = open
          const last = inner[inner.length - 1]
          const from = start.position?.end.offset
          const to = end ? end.position?.start.offset : last?.position?.end.offset
          const props: Record<string, unknown> = { className: ['copy-section'] }
          if (positions && from !== undefined && to !== undefined) {
            props['dataCopyFrom'] = String(from)
            props['dataCopyTo'] = String(to)
            // Inside a list item every line carries the item's indent,
            // which alone would read as an indented code block.
            const column = inner[0]?.position?.start.column
            if (node.type === 'listItem' && column !== undefined && column > 1) {
              props['dataCopyIndent'] = String(column - 1)
            }
          }
          out.push({
            type: 'copySection',
            children: inner,
            data: { hName: 'div', hProperties: props },
            ...(start.position && (end ?? last)?.position
              ? { position: { start: start.position.start, end: (end ?? last)?.position?.end ?? start.position.end } }
              : {})
          })
          open = null
        }
        for (const child of children) {
          if (marker(child, COPY_OPEN)) {
            if (!open) open = { start: child, inner: [] }
          } else if (marker(child, COPY_CLOSE)) {
            close(child)
          } else if (open) {
            open.inner.push(child)
          } else {
            out.push(child)
          }
        }
        close(null)
        node.children = out
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
  }
}

async function buildProcessor(sourcePositions: boolean) {
  const highlighter = await getHighlighter()
  const base = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBrTags)
    .use(remarkCopySections, { positions: sourcePositions })
    .use(remarkRehype)
    .use(rehypeSlug)
  const positioned = sourcePositions ? base.use(rehypeSourcePositions) : base
  const highlighted = positioned.use(rehypeShikiFromHighlighter, highlighter, {
    theme: shikiTheme,
    defaultLanguage: 'text',
    fallbackLanguage: 'text',
    // Grammars load on demand per fence; unknown languages fall back.
    lazy: true
  })
  const restamped = sourcePositions ? highlighted.use(rehypeRestoreCodeStamps) : highlighted
  return restamped.use(rehypeStringify)
}

const processors = new Map<string, ReturnType<typeof buildProcessor>>()

function getProcessor(sourcePositions: boolean): ReturnType<typeof buildProcessor> {
  const key = sourcePositions ? 'positions' : 'plain'
  let cached = processors.get(key)
  if (!cached) {
    cached = buildProcessor(sourcePositions)
    processors.set(key, cached)
  }
  return cached
}

/* The document's link reference and footnote definitions, as written, in
 * document order, one per paragraph. A copy section renders on its own,
 * and a `[text][ref]` or `[^1]` whose definition lives elsewhere in the
 * document would lose its target; adding these keeps them in scope.
 * Parse only — the same remark front end as the pipeline. */
export function referenceDefinitions(markdown: string): { links: string; footnotes: string } {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdastNode
  const links: string[] = []
  const footnotes: string[] = []
  const walk = (node: MdastNode): void => {
    if (node.type === 'definition' || node.type === 'footnoteDefinition') {
      const from = node.position?.start.offset
      const to = node.position?.end.offset
      if (from !== undefined && to !== undefined) {
        ;(node.type === 'definition' ? links : footnotes).push(markdown.slice(from, to))
      }
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return { links: links.join('\n\n'), footnotes: footnotes.join('\n\n') }
}

export interface RenderOptions {
  sourcePositions?: boolean
}

/* Markdown → HTML body fragment.
 *
 * The explicit cwd matters: without one, vfile calls process.cwd() through a
 * default-import of node:process that rolldown (vite 8) bundles without CJS
 * interop in the Electron main build — `.default` comes back undefined and
 * the pipeline crashes. We never resolve paths through vfile, so any value
 * works. */
export async function renderMarkdown(
  markdown: string,
  options: RenderOptions = {}
): Promise<string> {
  const processor = await getProcessor(options.sourcePositions === true)
  const file = await processor.process({
    value: markdown,
    cwd: '/'
  })
  return String(file)
}
