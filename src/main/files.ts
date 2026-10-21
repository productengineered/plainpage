import { watch, type FSWatcher } from 'chokidar'
import { randomBytes } from 'node:crypto'
import { open, readFile, rename, unlink } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { basename, dirname, join } from 'node:path'

export function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

/* Line endings, kept as found. The editor holds every document with \n
 * (CodeMirror splits on \r\n and joins with \n), so a file written on
 * Windows would come back from its first save with every line changed.
 * A file whose lines end \r\n is written back that way; anything else —
 * new documents included — stays \n. */
export type Eol = '\n' | '\r\n'

export function detectEol(text: string): Eol {
  const crlf = text.match(/\r\n/g)?.length ?? 0
  if (crlf === 0) return '\n'
  const lf = text.match(/\n/g)?.length ?? 0
  // Mixed files go with the majority; a tie keeps the platform-neutral \n.
  return crlf > lf - crlf ? '\r\n' : '\n'
}

export function applyEol(text: string, eol: Eol): string {
  return eol === '\n' ? text : text.replace(/\r?\n/g, '\r\n')
}

/* Atomic save per ULTRAPLAN §6: write a temp file in the same directory,
 * fsync, then rename over the target. A crash mid-write can lose the temp
 * file but can never truncate the manuscript. */
export function tempName(path: string): string {
  return `.${basename(path)}.foolscap-${process.pid}-${randomBytes(4).toString('hex')}.tmp`
}

export async function atomicWriteFile(path: string, data: string | Uint8Array): Promise<void> {
  const tmp = join(dirname(path), tempName(path))
  const fh = await open(tmp, 'w')
  let closed = false
  try {
    await fh.writeFile(data, typeof data === 'string' ? 'utf8' : undefined)
    await fh.sync()
    closed = true
    await fh.close()
    await renameOver(tmp, path)
  } catch (err) {
    if (!closed) await fh.close().catch(() => undefined)
    await unlink(tmp).catch(() => undefined)
    throw err
  }
}

/* On Windows a rename onto a file that another process holds open — an
 * antivirus scan, the search indexer, a sync client — fails with EPERM,
 * EBUSY, or EACCES for the few milliseconds the handle lives. Those retry
 * with a short backoff; anything else, or a lock that outlasts ~1.5s, is a
 * real failure. macOS and Linux never take the retry path. */
const TRANSIENT_RENAME = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_BACKOFF_MS = [10, 25, 50, 100, 200, 400, 700]

export async function renameOver(
  from: string,
  to: string,
  platform: NodeJS.Platform = process.platform,
  doRename: (from: string, to: string) => Promise<void> = rename
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await doRename(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      const wait = RENAME_BACKOFF_MS[attempt]
      if (platform !== 'win32' || !TRANSIENT_RENAME.has(code) || wait === undefined) throw err
      await sleep(wait)
    }
  }
}

/* A dropped file keeps its name, made safe for a relative markdown link
 * and for the disk: accents fold, anything outside letters, digits, dot,
 * dash, and underscore becomes a dash, leading dots and dashes go (no
 * hidden files, no traversal), and the extension is the one main
 * verified. Nothing usable — or nothing offered, as with a clipboard
 * paste — falls back to the timestamp. */
export function assetName(preferred: string | null, ext: string, now: Date): string {
  const stem = (preferred ?? '')
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64)
  return stem ? `${stem}.${ext}` : timestampName('pasted', ext, now)
}

/* Timestamped asset name: pasted-YYYYMMDD-HHMMSS.ext */
export function timestampName(prefix: string, ext: string, now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `${prefix}-${date}-${time}.${ext}`
}

/* Watch a single file for external changes. awaitWriteFinish debounces other
 * programs' in-progress writes so we read a settled file, not a half-write. */
export function watchFile(path: string, onChange: () => void): FSWatcher {
  const watcher = watch(path, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  })
  watcher.on('change', onChange)
  return watcher
}
