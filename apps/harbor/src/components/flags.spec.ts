import { describe, expect, it } from 'vitest'

import { CUTS, cutOf, flagColor, flagTint, fleetlets, hueOf, NO_ORG, RUNGS } from './flags'
import { ship } from './testing'

describe(hueOf, () => {
  /**
   * A hash straight onto 360 degrees put two of this fleet's organisations **one degree apart** —
   * not "similar" but indistinguishable, which is the worst of the three states because it reads
   * as a bug. The ladder makes two flags either the same colour or an obviously different one.
   */
  it('never lands two flags almost on top of each other', () => {
    const names = ['IT4Change', 'ulfgebhardt', 'webcraftmedia', 'mojotrollz', 'utopia-os', 'ohne']
    const step = 360 / RUNGS

    for (const name of names) {
      expect(hueOf(name) % step).toBe(0)
    }
  })

  /** Read repeatedly: a colour that moved between two readings makes every colour untrustworthy. */
  it('gives one name one colour, always', () => {
    expect(hueOf('IT4Change')).toBe(hueOf('IT4Change'))
    expect(flagColor('a')).toBe(flagColor('a'))
  })

  /**
   * A sum of character codes gives `ab` and `ba` the same answer, and on this fleet that put
   * `wir-social` and `utopia-os` four degrees apart.
   */
  it('does not give an anagram the same flag', () => {
    const same = hueOf('ab') === hueOf('ba') && cutOf('ab') === cutOf('ba')

    expect(same).toBe(false)
  })
})

describe(cutOf, () => {
  /** The half that survives greyscale, a shared rung, and a reader who does not see the hue. */
  it('is one of the four, for anything at all', () => {
    for (const name of ['', 'a', 'IT4Change', '💥']) {
      expect(CUTS).toContain(cutOf(name))
    }
  })
})

describe(flagTint, () => {
  /** Pixi wants a number; it has to be the same colour the DOM gets, not a second opinion. */
  it('stays inside one colour word', () => {
    for (const name of ['IT4Change', 'a', 'ohne', 'zzz']) {
      expect(flagTint(name)).toBeGreaterThanOrEqual(0)
      expect(flagTint(name)).toBeLessThanOrEqual(0xffffff)
    }
  })
})

describe(fleetlets, () => {
  /**
   * The grouping, and it is measured rather than decided: `org` is already in the path. Chosen
   * over the forge owner after measuring both — the owner gives the same 26 groups but leaves 6
   * repositories with none at all, because they have no `origin`.
   */
  it('groups by organisation, biggest first', () => {
    const fleet = [
      ship({ org: 'small', path: '/a' }),
      ship({ org: 'big', path: '/b' }),
      ship({ org: 'big', path: '/c' }),
      ship({ org: 'big', path: '/d' }),
    ]

    expect(fleetlets(fleet).map((one) => [one.org, one.ships.length])).toStrictEqual([
      ['big', 3],
      ['small', 1],
    ])
  })

  it('breaks a tie by name, so nothing swaps between two snapshots', () => {
    const fleet = [ship({ org: 'zeta', path: '/a' }), ship({ org: 'alpha', path: '/b' })]

    expect(fleetlets(fleet).map((one) => one.org)).toStrictEqual(['alpha', 'zeta'])
  })

  /** A repository filed straight under a root gets a group, not a gap. */
  it('gives a ship with no organisation one of its own', () => {
    expect(fleetlets([ship({ org: '', path: '/a' })])[0]?.org).toBe(NO_ORG)
  })

  it('places every ship exactly once', () => {
    const fleet = Array.from({ length: 30 }, (_, index) =>
      ship({ org: `org-${String(index % 4)}`, path: `/${String(index)}` }),
    )
    const placed = fleetlets(fleet).flatMap((one) => one.ships)

    expect(placed).toHaveLength(30)
    expect(new Set(placed.map((one) => one.path)).size).toBe(30)
  })

  it('answers for an empty fleet', () => {
    expect(fleetlets([])).toStrictEqual([])
  })
})
