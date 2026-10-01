import { describe, expect, it } from 'vitest'

import { NOTHING_RUNNING, readingOf, shareOf } from './measuring'

describe(shareOf, () => {
  /** A bar at 100 % for the third of a second before the count arrives is a lie worth avoiding. */
  it('says nothing until the survey has counted', () => {
    expect(shareOf(null)).toBeNull()
    expect(shareOf(NOTHING_RUNNING)).toBeNull()
    expect(shareOf({ ...NOTHING_RUNNING, at: 3, of: 0 })).toBeNull()
  })

  it('is how many are done of how many there are', () => {
    expect(shareOf({ ...NOTHING_RUNNING, at: 23, of: 92 })).toBeCloseTo(0.25)
  })

  /** The count comes from another process: a bar that trusts it without a bound can run off. */
  it('cannot run past its own track', () => {
    expect(shareOf({ ...NOTHING_RUNNING, at: 99, of: 92 })).toBe(1)
    expect(shareOf({ ...NOTHING_RUNNING, at: -4, of: 92 })).toBe(0)
  })
})

describe(readingOf, () => {
  it('shortens a path to the two parts that name the repository', () => {
    expect(readingOf({ ...NOTHING_RUNNING, path: '/home/x/.data/sources/org/ship' })).toBe(
      'org/ship',
    )
  })

  it('has nothing to say before the first one lands', () => {
    expect(readingOf(null)).toBe('')
    expect(readingOf(NOTHING_RUNNING)).toBe('')
  })

  it('says what it can about a path with one part', () => {
    expect(readingOf({ ...NOTHING_RUNNING, path: '/ship' })).toBe('ship')
  })
})
