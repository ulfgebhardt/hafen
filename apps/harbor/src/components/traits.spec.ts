import { describe, expect, it } from 'vitest'

import { quest, ship } from './testing'
import {
  livelinessOf,
  readingsOf,
  reachOf,
  standingOf,
  STAR_CEILING,
  STAR_WEIGHT,
  traitsOf,
} from './traits'

import type { ForgeStats } from '@hafen/core'

const stats = (stars: number): ForgeStats => ({
  slug: { host: 'github.com', owner: 'o', repo: 'r' },
  stars,
  watchers: 0,
  forks: 0,
  issues: 0,
  pulls: 0,
  language: null,
})

const reading = (over: Partial<ReturnType<typeof readingsOf>> = {}) => ({
  points: 0,
  met: 0,
  binding: 0,
  stars: 0,
  issues: 0,
  asked: false,
  rustDays: 0,
  disorder: 0,
  ...over,
})

describe(readingsOf, () => {
  it('reads the demands a ship answered, not the ones that exist', () => {
    const read = readingsOf(
      ship({
        quests: [quest('lint', 'met'), quest('unit', 'violated'), quest('e2e', 'notApplicable')],
      }),
      null,
    )

    expect(read.met).toBe(1)
    // `notApplicable` is not a demand this ship failed, so it is not one it was asked.
    expect(read.binding).toBe(2)
  })

  /** Dark is a reading too: nobody has looked. It must not be confusable with "no stars". */
  it('says whether the forge was asked at all', () => {
    expect(readingsOf(ship(), null).asked).toBe(false)
    expect(readingsOf(ship(), stats(0)).asked).toBe(true)
    expect(readingsOf(ship(), stats(1743)).stars).toBe(1743)
  })
})

describe(reachOf, () => {
  /**
   * The decision the user made: the hull grows once the forge has been asked. It means the same
   * repository is a different size before and after the button — honest because the forge reading
   * carries its own timestamp, and because 15 of 86 repositories here can never be read and
   * therefore stay at their snapshot size for good.
   */
  it('grows a ship once her stars are known', () => {
    const before = reachOf(reading({ points: 2000 }))
    const after = reachOf(reading({ points: 2000, stars: 100, asked: true }))

    expect(after).toBeGreaterThan(before)
    expect(reachOf(reading({ points: 2000 + 100 * STAR_WEIGHT }))).toBeCloseTo(after)
  })

  it('stays inside its own scale however big the numbers get', () => {
    expect(reachOf(reading({ points: 1e9, stars: 1e6 }))).toBe(1)
    expect(reachOf(reading({ points: -5 }))).toBe(0)
  })
})

describe(standingOf, () => {
  /** Nothing demanded is not the same as everything failed, and must not read as either. */
  it('is nothing where nothing is demanded', () => {
    expect(standingOf(reading({ binding: 0, met: 0 }))).toBe(0)
    expect(standingOf(reading({ binding: 4, met: 4 }))).toBe(1)
  })
})

describe(traitsOf, () => {
  /**
   * Independence is the whole point of this module: a ship carries as many readings at once as she
   * has features. A single "condition" number would have been ninety copies of one shape.
   */
  it('moves one feature without moving the others', () => {
    const plain = traitsOf(reading({ points: 1000, binding: 4, met: 2 }))
    const starred = traitsOf(reading({ points: 1000, binding: 4, met: 2, stars: 500 }))
    const rusted = traitsOf(reading({ points: 1000, binding: 4, met: 2, rustDays: 400 }))

    expect(starred.glow).toBeGreaterThan(plain.glow)
    expect(starred.masts).toBe(plain.masts)
    expect(rusted.rust).toBeGreaterThan(plain.rust)
    expect(rusted.glow).toBe(plain.glow)
    expect(rusted.masts).toBe(plain.masts)
  })

  /** Imposing is the demands she answered — the user's own word for it, and one reading. */
  it('gives more rig to a ship that answers more of what is asked', () => {
    const none = traitsOf(reading({ binding: 4, met: 0 }))
    const all = traitsOf(reading({ binding: 4, met: 4 }))

    expect(all.masts).toBeGreaterThan(none.masts)
    expect(all.cranes).toBeGreaterThan(none.cranes)
    expect(all.tiers).toBeGreaterThan(none.tiers)
  })

  /**
   * Logarithmic, and two scales were wrong before it: most repositories here have under twenty
   * stars, the busiest active one has 112 and `funkbuch` has 1743. Linear left every window under a
   * third lit.
   */
  it('spends the light where the ships actually are', () => {
    expect(traitsOf(reading({ stars: 0 })).glow).toBe(0)
    expect(traitsOf(reading({ stars: 20 })).glow).toBeGreaterThan(0.3)
    expect(traitsOf(reading({ stars: 112 })).glow).toBeGreaterThan(0.55)
    expect(traitsOf(reading({ stars: STAR_CEILING })).glow).toBeCloseTo(1)
  })

  /** A repository with no commits has no age, and no age is not "brand new" nor "ancient". */
  it('does not streak a ship that has no age at all', () => {
    expect(traitsOf(reading({ rustDays: null })).rust).toBe(0)
  })

  /**
   * Traffic comes off her size and never off her condition: a big repository has more people
   * going aboard, a broken one does not have fewer. Tying the two together would let a large
   * violated ship cancel itself out.
   */
  it('keeps the bustle at her berth out of her standing', () => {
    const big = traitsOf(reading({ points: 20000, binding: 4, met: 0 }))
    const small = traitsOf(reading({ points: 10, binding: 4, met: 4 }))

    expect(big.bustle).toBeGreaterThan(small.bustle)
    expect(big.masts).toBeLessThan(small.masts)
  })

  it('keeps every share inside nought and one', () => {
    const wild = traitsOf(reading({ points: 1e9, stars: 1e6, rustDays: 1e5, disorder: 1e4 }))

    for (const value of [wild.reach, wild.glow, wild.rust, wild.scuff, wild.bustle]) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

describe(livelinessOf, () => {
  /**
   * "Je aktiver das Dock, desto mehr Bewegung." Read off the ships on the page rather than handed
   * down as a prop: the page a reader is on *is* a set of ships, and the dormant tab is dormant by
   * definition. One less thing for two components to disagree about.
   */
  it('stirs an active page more than a dormant one', () => {
    const fresh = Array.from({ length: 4 }, () => ship({ rustDays: 1 }))
    const still = Array.from({ length: 4 }, () => ship({ rustDays: 900, docks: [] }))

    expect(livelinessOf(fresh)).toBeGreaterThan(livelinessOf(still))
  })

  /** An archived page is the quietest and still moves: a still picture reads as a broken one. */
  it('never comes to a complete stop', () => {
    const gone = Array.from({ length: 3 }, () => ship({ archived: true, rustDays: 2000 }))

    expect(livelinessOf(gone)).toBeGreaterThan(0)
    expect(livelinessOf([])).toBeGreaterThan(0)
  })

  it('is the average and not the loudest ship on the page', () => {
    const mixed = [ship({ rustDays: 1 }), ship({ archived: true, rustDays: 2000 })]

    expect(livelinessOf(mixed)).toBeLessThan(livelinessOf([ship({ rustDays: 1 })]))
  })
})
