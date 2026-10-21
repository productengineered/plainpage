import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyEol, assetName, atomicWriteFile, detectEol, renameOver, tempName, timestampName } from './files'

describe('tempName', () => {
  it('never repeats for the same target', () => {
    const names = new Set(Array.from({ length: 500 }, () => tempName('/docs/notes.md')))
    expect(names.size).toBe(500)
  })

  it('stays hidden, stays beside the target, and keeps the .tmp suffix', () => {
    const name = tempName('/docs/notes.md')
    expect(name.startsWith('.notes.md.foolscap-')).toBe(true)
    expect(name.endsWith('.tmp')).toBe(true)
    expect(name).not.toContain('/')
  })
})

describe('assetName', () => {
  const now = new Date(2026, 6, 28, 9, 5, 3)

  it('keeps a dropped file\'s name with the verified extension', () => {
    expect(assetName('Screenshot 2026-07-28.PNG', 'png', now)).toBe('Screenshot-2026-07-28.png')
    expect(assetName('photo.jpeg', 'jpg', now)).toBe('photo.jpg')
  })

  it('folds accents, strips traversal and hidden-file prefixes, caps the length', () => {
    expect(assetName('Café au lait.png', 'png', now)).toBe('Cafe-au-lait.png')
    expect(assetName('../../.secret.png', 'png', now)).toBe('secret.png')
    expect(assetName('x'.repeat(100) + '.png', 'png', now)).toBe('x'.repeat(64) + '.png')
  })

  it('falls back to the timestamp when nothing usable is offered', () => {
    expect(assetName(null, 'png', now)).toBe('pasted-20260728-090503.png')
    expect(assetName('....png', 'png', now)).toBe('pasted-20260728-090503.png')
    expect(assetName('日本語.png', 'png', now)).toBe('pasted-20260728-090503.png')
  })
})

describe('timestampName', () => {
  it('formats a sortable pasted-asset name', () => {
    expect(timestampName('pasted', 'png', new Date(2026, 6, 28, 9, 5, 3))).toBe(
      'pasted-20260728-090503.png'
    )
  })
})

describe('atomicWriteFile', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'foolscap-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes new files', async () => {
    const target = join(dir, 'doc.md')
    await atomicWriteFile(target, '# hello\n')
    expect(await readFile(target, 'utf8')).toBe('# hello\n')
  })

  it('replaces existing content completely', async () => {
    const target = join(dir, 'doc.md')
    await writeFile(target, 'a much longer original manuscript body\n')
    await atomicWriteFile(target, 'short\n')
    expect(await readFile(target, 'utf8')).toBe('short\n')
  })

  it('leaves no temp file behind on success', async () => {
    const target = join(dir, 'doc.md')
    await atomicWriteFile(target, 'content\n')
    expect(await readdir(dir)).toEqual(['doc.md'])
  })

  it('throws and leaves nothing behind when the temp file cannot be created', async () => {
    // Nonexistent parent directory: open() fails before anything is written.
    await expect(atomicWriteFile(join(dir, 'missing', 'doc.md'), 'x')).rejects.toThrow()
    expect(await readdir(dir)).toEqual([])
  })

  it('cleans up the temp file when the final rename fails', async () => {
    // A directory at the target path lets the temp write succeed but makes
    // the rename over it fail — the catch path after a successful open.
    const target = join(dir, 'doc.md')
    await mkdir(target)
    await expect(atomicWriteFile(target, 'x')).rejects.toThrow()
    expect(await readdir(dir)).toEqual(['doc.md'])
    expect(await readdir(target)).toEqual([])
  })

  it('preserves exact bytes including trailing whitespace and unicode', async () => {
    const target = join(dir, 'doc.md')
    const content = '# Tîtle — “quotes”\n\ntrailing spaces  \n\tand a tab\n\n'
    await atomicWriteFile(target, content)
    expect(await readFile(target, 'utf8')).toBe(content)
  })
})

describe('line endings', () => {
  it('reads \\r\\n files as \\r\\n and everything else as \\n', () => {
    expect(detectEol('a\r\nb\r\n')).toBe('\r\n')
    expect(detectEol('a\nb\n')).toBe('\n')
    expect(detectEol('no newline at all')).toBe('\n')
    expect(detectEol('')).toBe('\n')
  })

  it('lets the majority decide a mixed file, ties going to \\n', () => {
    expect(detectEol('a\r\nb\r\nc\n')).toBe('\r\n')
    expect(detectEol('a\r\nb\nc\n')).toBe('\n')
    expect(detectEol('a\r\nb\n')).toBe('\n')
  })

  it('writes \\r\\n back over the editor\'s \\n, never doubling an existing \\r', () => {
    expect(applyEol('a\nb\n', '\r\n')).toBe('a\r\nb\r\n')
    expect(applyEol('a\r\nb\n', '\r\n')).toBe('a\r\nb\r\n')
    expect(applyEol('a\nb\n', '\n')).toBe('a\nb\n')
  })

  it('round-trips a Windows file byte for byte through the editor\'s view of it', () => {
    const disk = '# Title\r\n\r\nBody line\r\n'
    const editor = disk.replace(/\r\n/g, '\n')
    expect(applyEol(editor, detectEol(disk))).toBe(disk)
  })
})

describe('renameOver', () => {
  const locked = (code: string, failures: number) => {
    let calls = 0
    const doRename = async (): Promise<void> => {
      calls++
      if (calls <= failures) throw Object.assign(new Error(code), { code })
    }
    return { doRename, calls: () => calls }
  }

  it('retries a briefly locked target on Windows', async () => {
    const r = locked('EPERM', 3)
    await renameOver('a', 'b', 'win32', r.doRename)
    expect(r.calls()).toBe(4)
  })

  it('gives up once the lock outlasts the backoff', async () => {
    const r = locked('EBUSY', 100)
    await expect(renameOver('a', 'b', 'win32', r.doRename)).rejects.toThrow('EBUSY')
    expect(r.calls()).toBe(8)
  })

  it('never retries off Windows, or for a real error', async () => {
    const mac = locked('EPERM', 1)
    await expect(renameOver('a', 'b', 'darwin', mac.doRename)).rejects.toThrow('EPERM')
    expect(mac.calls()).toBe(1)
    const missing = locked('ENOENT', 1)
    await expect(renameOver('a', 'b', 'win32', missing.doRename)).rejects.toThrow('ENOENT')
    expect(missing.calls()).toBe(1)
  })
})
