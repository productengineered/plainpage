import { describe, expect, it } from 'vitest'
import { closeQuits } from './close-quits'

describe('closeQuits', () => {
  it('turns the last window\'s close into a quit on Windows and Linux', () => {
    expect(closeQuits('win32', 1, false)).toBe(true)
    expect(closeQuits('linux', 1, false)).toBe(true)
  })

  it('leaves macOS, other windows, and a quit already under way alone', () => {
    expect(closeQuits('darwin', 1, false)).toBe(false)
    expect(closeQuits('win32', 2, false)).toBe(false)
    expect(closeQuits('win32', 1, true)).toBe(false)
  })
})
