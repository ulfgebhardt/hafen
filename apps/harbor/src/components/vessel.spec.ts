import { describe, expect, it } from 'vitest'

import { quest, ship } from './testing'
import { bridgeOf, cargoOf, hasPlume, hullOf, LENGTH_CEILING, SIZE } from './vessel'

const AT = { x: 2, y: 3 }

describe(hullOf, () => {
  it('places the deck around the berth it was given', () => {
    const hull = hullOf(ship(), AT, 100)

    for (const corner of hull.deck) {
      expect(corner.x).toBeGreaterThanOrEqual(AT.x)
      expect(Math.abs(corner.y - AT.y)).toBeLessThanOrEqual(SIZE.width)
    }
  })

  /**
   * Length follows the project score — the one place being busy buys space. Bounded at both ends:
   * a repository with eighteen thousand points must not need its own pier, and one with four
   * commits still has to look like a ship.
   */
  it('grows with the score and stops', () => {
    const small = hullOf(ship(), AT, 10).length
    const big = hullOf(ship(), AT, 3000).length
    const huge = hullOf(ship(), AT, LENGTH_CEILING * 5).length

    expect(big).toBeGreaterThan(small)
    expect(small).toBeGreaterThanOrEqual(SIZE.minLength)
    expect(huge).toBeLessThanOrEqual(SIZE.maxLength)
  })

  /**
   * Height follows how well the ship is *kept*, not what it scored: that is the sentence a person
   * can change this afternoon, and the one the picture should answer fastest.
   */
  it('rides high when kept and low when strewn', () => {
    const tidy = hullOf(ship(), AT, 500).height
    const strewn = hullOf(ship({ dirty: true, stash: 3, ahead: 2 }), AT, 500).height

    expect(tidy).toBeGreaterThan(strewn)
    expect(strewn).toBeGreaterThanOrEqual(SIZE.minHeight)
  })
})

describe(cargoOf, () => {
  it('carries one container per binding quest', () => {
    const subject = ship({
      quests: [quest('a', 'met'), quest('b', 'violated'), quest('c', 'notApplicable')],
    })
    const hull = hullOf(subject, AT, 100)

    expect(cargoOf(subject, hull, AT)).toHaveLength(2)
  })

  /**
   * An empty deck and a deck of failed cargo are different sentences — the renderer draws bare
   * planking for the first. "Never measured" and "measured and failing" must not look alike.
   */
  it('carries nothing where nothing binds', () => {
    const subject = ship({ quests: [quest('a', 'notApplicable')] })

    expect(cargoOf(subject, hullOf(subject, AT, 100), AT)).toStrictEqual([])
  })

  it('puts the worst at the front of the stack', () => {
    const subject = ship({ quests: [quest('gut', 'met'), quest('kaputt', 'violated')] })
    const cargo = cargoOf(subject, hullOf(subject, AT, 100), AT)

    expect(cargo[0]?.quest.id).toBe('kaputt')
  })

  it('stands the cargo on the deck and not in the water', () => {
    const subject = ship({ quests: [quest('a', 'met')] })
    const hull = hullOf(subject, AT, 100)

    for (const box of cargoOf(subject, hull, AT)) {
      expect(box.spot.z).toBe(hull.height)
    }
  })

  it('keeps every container on the ship, however many there are', () => {
    const many = Array.from({ length: 12 }, (_, index) => quest(`q${String(index)}`, 'met'))
    const subject = ship({ quests: many })
    const hull = hullOf(subject, AT, 100)

    for (const box of cargoOf(subject, hull, AT)) {
      expect(box.spot.x).toBeGreaterThanOrEqual(AT.x)
      expect(box.spot.x).toBeLessThanOrEqual(AT.x + hull.length)
    }
  })
})

describe(bridgeOf, () => {
  it('grows a storey per five binding demands, capped', () => {
    const few = ship({ quests: [quest('a', 'met')] })
    const many = ship({
      quests: Array.from({ length: 11 }, (_, index) => quest(`q${String(index)}`, 'met')),
    })
    const huge = ship({
      quests: Array.from({ length: 60 }, (_, index) => quest(`q${String(index)}`, 'met')),
    })

    expect(bridgeOf(few, hullOf(few, AT, 1), AT).storeys).toBe(1)
    expect(bridgeOf(many, hullOf(many, AT, 1), AT).storeys).toBe(3)
    expect(bridgeOf(huge, hullOf(huge, AT, 1), AT).storeys).toBe(4)
  })

  it('still gives a bridge to a ship nothing is demanded of', () => {
    expect(bridgeOf(ship(), hullOf(ship(), AT, 1), AT).storeys).toBe(1)
  })
})

describe(hasPlume, () => {
  /** Earned, not decorative: both halves, because either alone is a different sentence. */
  it('needs every binding demand met and a clean tree', () => {
    expect(hasPlume(ship({ quests: [quest('a', 'met')] }))).toBe(true)
    expect(hasPlume(ship({ quests: [quest('a', 'met')], stash: 1 }))).toBe(false)
    expect(hasPlume(ship({ quests: [quest('a', 'violated')] }))).toBe(false)
  })

  it('is not earned by a ship nothing is demanded of', () => {
    expect(hasPlume(ship())).toBe(false)
  })
})
