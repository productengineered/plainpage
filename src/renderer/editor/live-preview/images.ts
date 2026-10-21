import type { SyntaxNodeRef } from '@lezer/common'
import type { ActiveCtx } from './index'
import { selectionTouches } from './marks'

/* Construct 7: images render as inline widgets when the cursor isn't inside
 * the construct; put the cursor in and the raw ![alt](path) comes back. This
 * is the adjacency predicate's real use — construct extent, not line. A
 * broken path renders a labeled fallback state instead of a layout ghost. */

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
/* C:\ or C:/ — a Windows drive path, which SCHEME alone would read as a
 * one-letter URL scheme. */
const DRIVE = /^[a-z]:[\\/]/i
/* \\server\share — a Windows network path. */
const UNC = /^\\\\[^\\]/

/* Per-segment, not encodeURI: the target is a literal path, and a legal
 * filename like photo#1.png must not read as a URL fragment. A drive
 * letter's colon stays as it is (file:///C:/…). */
const encodePath = (path: string): string =>
  path
    .split('/')
    .map((seg, i) => (i <= 1 && /^[a-z]:$/i.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/')

/* Absolute path → file URL. Windows paths turn their backslashes into URL
 * slashes; on macOS a backslash is an ordinary filename character, so a
 * POSIX path keeps it (encoded). */
function fileUrl(path: string): string {
  if (UNC.test(path)) return `file:${encodePath(path.replace(/\\/g, '/'))}`
  if (DRIVE.test(path)) return `file:///${encodePath(path.replace(/\\/g, '/'))}`
  return `file://${encodePath(path)}`
}

const isWindowsPath = (path: string): boolean => DRIVE.test(path) || UNC.test(path)

/* Resolve an image target against the document's directory. Returns null
 * when there's no way to resolve it (relative path, unsaved document). */
export function resolveImageSrc(target: string, docDir: string | null): string | null {
  if (target === '') return null
  if (isWindowsPath(target)) return fileUrl(target)
  if (SCHEME.test(target)) return target
  if (target.startsWith('/')) return fileUrl(target)
  if (!docDir) return null
  if (isWindowsPath(docDir)) return fileUrl(`${docDir.replace(/[\\/]+$/, '')}\\${target}`)
  return fileUrl(`${docDir}/${target}`)
}

export function collectImages(node: SyntaxNodeRef, ctx: ActiveCtx): void {
  if (node.name !== 'Image') return
  if (selectionTouches(ctx.selection, node.from, node.to)) return
  const url = node.node.getChild('URL')
  const target = url ? ctx.doc.sliceString(url.from, url.to) : ''
  // Alt text sits between the ![ and ] marks.
  const marks = node.node.getChildren('LinkMark')
  const altFrom = marks[0]?.to ?? node.from
  const altTo = marks[1]?.from ?? altFrom
  ctx.push({
    kind: 'replace',
    from: node.from,
    to: node.to,
    widget: {
      type: 'image',
      src: resolveImageSrc(target, ctx.docDir),
      alt: ctx.doc.sliceString(altFrom, altTo)
    }
  })
}
