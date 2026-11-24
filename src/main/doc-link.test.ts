import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../shared/markdown'
import { resolveDocLink, type PathProbe } from './doc-link'

const DOC = '/notes/course/status.md'

/* A pretend disk: these exist, nothing else does. */
const probe = (files: string[], dirs: string[] = []): PathProbe => ({
  kind: (path) => (files.includes(path) ? 'file' : dirs.includes(path) ? 'dir' : 'missing')
})
const disk = probe(
  [
    '/notes/course/review.md',
    '/notes/course/my notes.md',
    '/notes/shared/brief.markdown',
    '/notes/course/week 3.pdf',
    '/notes/course/run.command',
    '/notes/course/todo.txt'
  ],
  ['/notes/course/assets', '/Applications/Evil.app']
)
const at = (href: string, doc: string | null = DOC) => resolveDocLink(href, doc, disk)

describe('resolveDocLink', () => {
  it('web and mail links go to the system as written', () => {
    expect(at('https://example.com/a?b=1#c')).toEqual({ kind: 'web', url: 'https://example.com/a?b=1#c' })
    expect(at('mailto:a@example.com')).toEqual({ kind: 'web', url: 'mailto:a@example.com' })
  })

  it('a markdown or text file opens in a tab: relative, ../, absolute, file://', () => {
    expect(at('review.md')).toEqual({ kind: 'tab', path: '/notes/course/review.md' })
    expect(at('./review.md#feedback')).toEqual({ kind: 'tab', path: '/notes/course/review.md' })
    expect(at('../shared/brief.markdown')).toEqual({ kind: 'tab', path: '/notes/shared/brief.markdown' })
    expect(at('/notes/course/todo.txt')).toEqual({ kind: 'tab', path: '/notes/course/todo.txt' })
    expect(at('file:///notes/course/review.md')).toEqual({ kind: 'tab', path: '/notes/course/review.md' })
    expect(at('plainpage://open?path=%2Fnotes%2Fcourse%2Freview.md')).toEqual({ kind: 'tab', path: '/notes/course/review.md' })
  })

  it('spaces: %20, or a <bracketed> destination from the editor', () => {
    expect(at('my%20notes.md')).toEqual({ kind: 'tab', path: '/notes/course/my notes.md' })
    expect(at('<my notes.md>')).toEqual({ kind: 'tab', path: '/notes/course/my notes.md' })
    expect(at('file:///notes/course/my%20notes.md')).toEqual({ kind: 'tab', path: '/notes/course/my notes.md' })
  })

  it('the preview hands over what the renderer wrote for a <bracketed> link', async () => {
    const html = await renderMarkdown('[n](<my notes.md>)\n')
    const href = /href="([^"]+)"/.exec(html)?.[1] ?? ''
    expect(at(href)).toEqual({ kind: 'tab', path: '/notes/course/my notes.md' })
  })

  it('documents open in their own app; folders open; anything else is only shown', () => {
    expect(at('week%203.pdf')).toEqual({ kind: 'file', path: '/notes/course/week 3.pdf' })
    expect(at('assets')).toEqual({ kind: 'folder', path: '/notes/course/assets' })
    expect(at('run.command')).toEqual({ kind: 'reveal', path: '/notes/course/run.command' })
    expect(at('/Applications/Evil.app')).toEqual({ kind: 'reveal', path: '/Applications/Evil.app' })
  })

  it('says why when it cannot open', () => {
    expect(at('gone.md')).toEqual({ kind: 'error', message: 'No file at /notes/course/gone.md' })
    expect(at('review.md', null)).toEqual({ kind: 'error', message: 'Save this document first, so its links know where to look.' })
    expect(at('plainpage://open?path=relative.md').kind).toBe('error')
  })

  it('in-page anchors, unknown schemes, and protocol-relative URLs do nothing', () => {
    for (const href of ['#fn-1', '', 'javascript:alert(1)', 'ftp://x/y.md', '//example.com/a.md', 'vscode://file/a']) {
      expect(at(href), href).toEqual({ kind: 'ignore' })
    }
  })
})
