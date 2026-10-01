import { describe, expect, it } from 'vitest'

import { wasChosen } from './revealing'

describe(wasChosen, () => {
  /** The two shapes the window hands around: a choice object, and a row's plain yes. */
  it('takes a choice and a bare yes alike', () => {
    expect(wasChosen({ kind: 'pier' })).toBe(true)
    expect(wasChosen(true)).toBe(true)
  })

  /** Nothing chosen is not a reason to move a panel somebody is reading. */
  it('is nothing for every way of saying nothing', () => {
    expect(wasChosen(null)).toBe(false)
    expect(wasChosen(undefined)).toBe(false)
    expect(wasChosen(false)).toBe(false)
  })
})
