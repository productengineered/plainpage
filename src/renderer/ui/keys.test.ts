import { describe, expect, it } from 'vitest'
import { formatKeys, localizeKeys } from './keys'

describe('formatKeys', () => {
  it('writes macOS glyphs in Apple\'s order whatever order they arrive in', () => {
    expect(formatKeys('darwin', ['mod', 'shift', 'T'])).toBe('⇧⌘T')
    expect(formatKeys('darwin', ['mod', 'alt', 'C'])).toBe('⌥⌘C')
    expect(formatKeys('darwin', ['mod', ','])).toBe('⌘,')
  })

  it('spells shortcuts out on Windows and Linux, Ctrl first', () => {
    expect(formatKeys('win32', ['shift', 'mod', 'T'])).toBe('Ctrl+Shift+T')
    expect(formatKeys('win32', ['mod', 'alt', 'C'])).toBe('Ctrl+Alt+C')
    expect(formatKeys('linux', ['mod', 'K'])).toBe('Ctrl+K')
  })

  it('says Ctrl once when both mod and ctrl are asked for, and allows a bare modifier', () => {
    expect(formatKeys('win32', ['ctrl', 'mod', 'Tab'])).toBe('Ctrl+Tab')
    expect(formatKeys('win32', ['mod'])).toBe('Ctrl')
  })
})

describe('localizeKeys', () => {
  const help = 'Press `⌘K`, `⇧⌘K` links, `⌥`-click a cell, `⌘−` smaller.'

  it('leaves macOS text alone', () => {
    expect(localizeKeys(help, 'darwin')).toBe(help)
  })

  it('respells every glyph run for Windows', () => {
    expect(localizeKeys(help, 'win32')).toBe(
      'Press `Ctrl+K`, `Ctrl+Shift+K` links, `Alt`-click a cell, `Ctrl+-` smaller.'
    )
  })

  it('keeps a named key whole', () => {
    expect(localizeKeys('`⇧Enter` breaks a line', 'win32')).toBe('`Shift+Enter` breaks a line')
  })

  it('respells glyphs in table cells without eating the pipes', () => {
    expect(localizeKeys('| `⌘,` | Settings |', 'win32')).toBe('| `Ctrl+,` | Settings |')
  })

  it('keeps only the platform\'s own blocks', () => {
    const text = 'a\n<!-- mac -->\nFinder\n<!-- /mac -->\n<!-- pc -->\nExplorer\n<!-- /pc -->\nb'
    expect(localizeKeys(text, 'darwin')).toBe('a\nFinder\nb')
    expect(localizeKeys(text, 'win32')).toBe('a\nExplorer\nb')
  })
})
