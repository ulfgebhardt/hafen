import { describe, expect, it } from 'vitest'

import { bandOf, BANDS, byBand, firstBand } from './band'
import { ship } from './testing'

describe(bandOf, () => {
  it('reads the register for what was put away', () => {
    expect(bandOf(ship({ archived: true, rustDays: 1 }))).toBe('archived')
  })

  it('calls a recently touched repository active', () => {
    expect(bandOf(ship({ rustDays: 3 }))).toBe('active')
    expect(bandOf(ship({ rustDays: 400 }))).toBe('dormant')
  })

  /** The commit date says when something landed, not whether somebody is on it right now. */
  it('lets an open worktree beat the calendar', () => {
    expect(bandOf(ship({ rustDays: 400, docks: ['/d/one'] }))).toBe('active')
  })

  /** Archived wins over everything, including a worktree somebody forgot. */
  it('puts the archive above the rest', () => {
    expect(bandOf(ship({ archived: true, docks: ['/d/one'] }))).toBe('archived')
  })
})

describe(byBand, () => {
  it('sorts every ship into exactly one band', () => {
    const ships = [ship({ rustDays: 1 }), ship({ rustDays: 900 }), ship({ archived: true })]
    const grouped = byBand(ships)

    expect(grouped.active).toHaveLength(1)
    expect(grouped.dormant).toHaveLength(1)
    expect(grouped.archived).toHaveLength(1)
  })

  /** A tab that disappears when it is empty is a tab nobody finds again. */
  it('offers every band, even the empty ones', () => {
    const grouped = byBand([])

    for (const band of BANDS) {
      expect(grouped[band]).toStrictEqual([])
    }
  })
})

describe(firstBand, () => {
  it('opens on the active page, which is what somebody came for', () => {
    expect(firstBand([ship({ rustDays: 1 }), ship({ rustDays: 900 })])).toBe('active')
  })

  /** An empty first page that has to be clicked away is what a tool does once. */
  it('skips to the first band that has anything in it', () => {
    expect(firstBand([ship({ rustDays: 900 })])).toBe('dormant')
    expect(firstBand([ship({ archived: true })])).toBe('archived')
  })

  it('answers something usable for an empty fleet', () => {
    expect(firstBand([])).toBe('active')
  })
})
