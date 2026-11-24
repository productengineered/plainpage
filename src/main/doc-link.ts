import { dirname, extname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OPENABLE, parseOpenLink } from './open-link'

/* What a click on a link inside a document does. Web and mail links go to
 * the system; a link to a markdown or text file — relative to the document,
 * absolute, file://, or plainpage://open — opens it in a Plainpage tab; any
 * other local file opens in its own app when it is a document type, and is
 * shown in Finder otherwise, so a link in a file can never launch a program.
 * `probe` is injected so tests stay hermetic. */

export const WEB_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/* Files a link may hand to their default app. Anything else — scripts,
 * apps, installers, unknown types — is only revealed. */
const DOCUMENTS = new Set([
  '.pdf', '.doc', '.docx', '.rtf', '.odt', '.pages',
  '.xls', '.xlsx', '.csv', '.tsv', '.ods', '.numbers',
  '.ppt', '.pptx', '.odp', '.key',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.tif', '.tiff', '.bmp',
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.mp4', '.mov', '.m4v', '.webm',
  '.json', '.yaml', '.yml', '.log'
])

export type DocLink =
  | { kind: 'web'; url: string }
  | { kind: 'tab'; path: string }
  | { kind: 'file'; path: string }
  | { kind: 'folder'; path: string }
  | { kind: 'reveal'; path: string }
  | { kind: 'error'; message: string }
  | { kind: 'ignore' }

export interface PathProbe {
  /* 'missing' for anything absent or unreadable. */
  kind(path: string): 'file' | 'dir' | 'missing'
}

const SCHEME = /^([a-z][a-z0-9+.-]*):/i
const WINDOWS_DRIVE = /^[a-z]:[\\/]/i

export function resolveDocLink(href: string, docPath: string | null, probe: PathProbe): DocLink {
  // The editor hands over a <bracketed> destination with its brackets.
  const raw = href.trim().replace(/^<(.*)>$/, '$1')
  // In-page anchors are the renderer's; protocol-relative URLs aren't files.
  if (raw === '' || raw.startsWith('#') || raw.startsWith('//')) return { kind: 'ignore' }

  let path: string
  const scheme = WINDOWS_DRIVE.test(raw) ? null : SCHEME.exec(raw)?.[1]?.toLowerCase()
  if (scheme) {
    if (WEB_SCHEMES.has(`${scheme}:`)) return { kind: 'web', url: raw }
    if (scheme === 'plainpage') {
      const result = parseOpenLink(raw, (p) => probe.kind(p) === 'file')
      return result.ok ? { kind: 'tab', path: result.path } : { kind: 'error', message: result.error }
    }
    if (scheme !== 'file') return { kind: 'ignore' }
    try {
      path = fileURLToPath(new URL(raw))
    } catch {
      return { kind: 'error', message: `Couldn’t read that file link: ${raw}` }
    }
  } else {
    // A relative link is a URL path: drop ?query and #fragment, decode %20.
    const bare = raw.replace(/[?#].*$/, '')
    let decoded: string
    try {
      decoded = decodeURIComponent(bare)
    } catch {
      decoded = bare
    }
    if (isAbsolute(decoded) || WINDOWS_DRIVE.test(decoded)) {
      path = decoded
    } else if (docPath) {
      path = resolve(dirname(docPath), decoded)
    } else {
      return { kind: 'error', message: 'Save this document first, so its links know where to look.' }
    }
  }
  path = resolve(path)

  const found = probe.kind(path)
  if (found === 'missing') return { kind: 'error', message: `No file at ${path}` }
  const ext = extname(path).toLowerCase()
  // A folder with an extension may be an app bundle: show it, don't open it.
  if (found === 'dir') return ext === '' ? { kind: 'folder', path } : { kind: 'reveal', path }
  if (OPENABLE.has(ext)) return { kind: 'tab', path }
  if (DOCUMENTS.has(ext)) return { kind: 'file', path }
  return { kind: 'reveal', path }
}
