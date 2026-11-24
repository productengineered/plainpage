import { syntaxTree } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common'
import type { CollectCtx } from './index'

/* Construct 5: links. The text stays live (accent, via the highlighter);
 * the URL and the []() punctuation recede like any other mark. Bare
 * autolinks are exempt — their URL *is* the content, so ghosting it would
 * make it unreadable. */

export function collectLinks(node: SyntaxNodeRef, ctx: CollectCtx): void {
  if (node.name === 'LinkMark') {
    ctx.push({ kind: 'mark', from: node.from, to: node.to, class: 'fs-mark' })
  } else if (node.name === 'URL' && node.node.parent?.name === 'Link') {
    ctx.push({ kind: 'mark', from: node.from, to: node.to, class: 'fs-mark fs-url' })
  }
}

function urlAt(view: EditorView, pos: number): string | null {
  for (
    let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 0);
    node;
    node = node.parent
  ) {
    if (node.name === 'URL') {
      return view.state.doc.sliceString(node.from, node.to)
    }
    if (node.name === 'Link' || node.name === 'Autolink') {
      const url = node.getChild('URL')
      return url ? view.state.doc.sliceString(url.from, url.to) : null
    }
  }
  return null
}

/* Cmd-click (Ctrl-click off macOS) anywhere on a link — text or URL — opens
 * it: web links in the browser, file links in a tab or their own app.
 * Resolution and scheme validation happen in the main process. */
export function linkClickHandler(): Extension {
  return EditorView.domEventHandlers({
    mousedown: (event, view) => {
      if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos === null) return false
      const url = urlAt(view, pos)
      if (!url) return false
      window.foolscap.openExternal(url)
      event.preventDefault()
      return true
    }
  })
}
