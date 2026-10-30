import { describe, expect, it } from 'vitest'
import { findTextMatches } from './preview-find'

const plain = { caseSensitive: false, regexp: false, wholeWord: false }

describe('findTextMatches — find in preview', () => {
  it('finds every match, ignoring case by default', () => {
    expect(findTextMatches('Cat, cat, CAT.', 'cat', plain)).toEqual([
      { from: 0, to: 3 },
      { from: 5, to: 8 },
      { from: 10, to: 13 }
    ])
  })

  it('match case narrows it', () => {
    expect(findTextMatches('Cat, cat', 'cat', { ...plain, caseSensitive: true })).toEqual([{ from: 5, to: 8 }])
  })

  it('takes regex characters literally unless regex is on', () => {
    expect(findTextMatches('a.c abc', 'a.c', plain)).toEqual([{ from: 0, to: 3 }])
    expect(findTextMatches('a.c abc', 'a.c', { ...plain, regexp: true })).toHaveLength(2)
  })

  it('whole word skips matches inside words, including accented ones', () => {
    expect(findTextMatches('cat scatter café cat_x cat', 'cat', { ...plain, wholeWord: true })).toEqual([
      { from: 0, to: 3 },
      { from: 23, to: 26 }
    ])
    expect(findTextMatches('caté', 'cat', { ...plain, wholeWord: true })).toEqual([])
  })

  it('an empty query, an invalid regex, or an empty-only regex finds nothing', () => {
    expect(findTextMatches('text', '', plain)).toEqual([])
    expect(findTextMatches('text', '(', { ...plain, regexp: true })).toEqual([])
    expect(findTextMatches('text', 'x*?', { ...plain, regexp: true })).toEqual([])
  })

  it('stops at a thousand matches', () => {
    expect(findTextMatches('a'.repeat(1500), 'a', plain)).toHaveLength(1000)
  })
})
