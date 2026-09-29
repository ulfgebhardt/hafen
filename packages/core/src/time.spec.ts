import { describe, expect, it } from 'vitest'

import { daysSince } from './time'

const NOW = new Date('2026-09-27T12:00:00Z')

describe(daysSince, () => {
  it('counts whole days', () => {
    expect(daysSince('2026-09-25T12:00:00Z', NOW)).toBe(2)
  })

  it('reads a few hours ago as today rather than as a day', () => {
    expect(daysSince('2026-09-27T01:00:00Z', NOW)).toBe(0)
  })

  it('has no age for something that never happened', () => {
    expect(daysSince(null, NOW)).toBeNull()
    expect(daysSince(undefined, NOW)).toBeNull()
    expect(daysSince('', NOW)).toBeNull()
  })

  it('refuses to turn an unparsable date into a number', () => {
    expect(daysSince('vorgestern', NOW)).toBeNull()
  })
})
