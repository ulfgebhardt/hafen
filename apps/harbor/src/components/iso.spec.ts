import { describe, expect, it } from 'vitest'

import {
  berthsFor,
  byDepth,
  depth,
  isoExtent,
  isoOrigin,
  PER_SIDE,
  pierCount,
  piersFor,
  project,
  TILE,
  unproject,
} from './iso'
import { SIZE } from './vessel'

describe(project, () => {
  it('puts the origin at the origin', () => {
    expect(project({ x: 0, y: 0 })).toStrictEqual({ x: 0, y: 0 })
  })

  /**
   * 2:1 and not a true 30° isometric: at this ratio a diagonal is exactly one pixel down per two
   * across, so edges stay crisp instead of shimmering. It looks slightly worse in a still and
   * markedly better on a screen.
   */
  it('keeps the two-to-one ratio every tile grid uses', () => {
    const along = project({ x: 1, y: 0 })

    expect(along.x).toBe(TILE.width / 2)
    expect(along.y).toBe(TILE.height / 2)
    expect(TILE.width / TILE.height).toBe(2)
  })

  it('sends the two ground axes in opposite directions', () => {
    expect(project({ x: 1, y: 0 }).x).toBeGreaterThan(0)
    expect(project({ x: 0, y: 1 }).x).toBeLessThan(0)
  })

  it('lifts a body straight up, without moving it sideways', () => {
    const ground = project({ x: 3, y: 2 })
    const raised = project({ x: 3, y: 2, z: 40 })

    expect(raised.x).toBe(ground.x)
    expect(raised.y).toBe(ground.y - 40)
  })
})

describe(unproject, () => {
  it('is the inverse of the projection on the ground', () => {
    for (const spot of [
      { x: 0, y: 0 },
      { x: 4, y: 7 },
      { x: 2.5, y: -3 },
    ]) {
      const back = unproject(project(spot))

      expect(back.x).toBeCloseTo(spot.x, 6)
      expect(back.y).toBeCloseTo(spot.y, 6)
    }
  })
})

describe(depth, () => {
  /**
   * The painter's algorithm, and there is no alternative: Pixi has no depth buffer, so whatever
   * is drawn last is in front.
   */
  it('orders away from the viewer', () => {
    expect(depth({ x: 0, y: 0 })).toBeLessThan(depth({ x: 1, y: 0 }))
    expect(depth({ x: 1, y: 0 })).toBeLessThan(depth({ x: 1, y: 1 }))
  })

  /** So a crane is drawn after the quay it stands on, rather than through it. */
  it('breaks a tie by height', () => {
    expect(depth({ x: 2, y: 2 })).toBeLessThan(depth({ x: 2, y: 2, z: 30 }))
  })

  it('sorts a scene back to front', () => {
    const spots = [
      { x: 5, y: 5 },
      { x: 0, y: 0 },
      { x: 2, y: 1 },
    ]

    expect([...spots].sort(byDepth).map((spot) => spot.x)).toStrictEqual([0, 2, 5])
  })
})

describe(berthsFor, () => {
  it('gives every ship a berth', () => {
    expect(berthsFor(17)).toHaveLength(17)
  })

  /** Two rows facing each other, the way a real basin fills — so the eye reads pairs. */
  it('alternates the sides of a pier', () => {
    const sides = berthsFor(4).map((berth) => berth.side)

    expect(sides).toStrictEqual([-1, 1, -1, 1])
  })

  it('starts a new pier once both sides of one are full', () => {
    const berths = berthsFor(PER_SIDE * 2 + 1)

    expect(berths[PER_SIDE * 2 - 1]?.pier).toBe(0)
    expect(berths[PER_SIDE * 2]?.pier).toBe(1)
  })

  /**
   * The layout places and never sorts: the caller's order decides who gets the front berths, and
   * the front is where the biggest ships belong.
   */
  it('fills in the order it was given', () => {
    const berths = berthsFor(3)

    expect(berths[0]?.spot.x).toBeLessThan(berths[2]?.spot.x ?? 0)
  })

  /**
   * The bug this catches: berths were spaced 2.2 apart while `vessel.ts` drew hulls up to 3.2
   * long, so every ship overlapped its neighbour and the basin read as a pile.
   */
  it('leaves room for the longest hull between two berths', () => {
    const berths = berthsFor(4)
    const along = (berths[2]?.spot.x ?? 0) - (berths[0]?.spot.x ?? 0)

    expect(along).toBeGreaterThan(SIZE.maxLength)
  })

  /** Two rows face each other across a pier; they must not sit on top of one another. */
  it('leaves room across the pier for two rows and their captions', () => {
    const berths = berthsFor(2)
    const across = Math.abs((berths[1]?.spot.y ?? 0) - (berths[0]?.spot.y ?? 0))

    expect(across).toBeGreaterThan(SIZE.width * 2)
  })

  it('places nothing for an empty harbour', () => {
    expect(berthsFor(0)).toStrictEqual([])
  })
})

describe(pierCount, () => {
  it('needs one pier even for nothing, so the quay has something to be', () => {
    expect(pierCount(0)).toBe(1)
    expect(pierCount(1)).toBe(1)
  })

  it('adds a pier once both sides are taken', () => {
    expect(pierCount(PER_SIDE * 2)).toBe(1)
    expect(pierCount(PER_SIDE * 2 + 1)).toBe(2)
  })
})

describe(piersFor, () => {
  it('draws one strip of concrete per pier', () => {
    expect(piersFor(30)).toHaveLength(pierCount(30))
  })

  it('spaces them apart so two rows of ships fit between', () => {
    const piers = piersFor(30)

    expect((piers[1]?.from.y ?? 0) - (piers[0]?.from.y ?? 0)).toBeGreaterThan(3)
  })
})

describe(isoExtent, () => {
  /** The quay and the water reach past the outermost hull; a drawing that clipped them looks broken. */
  it('is wide enough to hold the whole ground plane', () => {
    const extent = isoExtent(20)

    expect(extent.width).toBeGreaterThan(TILE.width)
    expect(extent.height).toBeGreaterThan(TILE.height)
  })

  it('grows with the fleet', () => {
    expect(isoExtent(60).height).toBeGreaterThan(isoExtent(6).height)
  })
})

describe(isoOrigin, () => {
  /** Half the grid projects to a negative x; without the shift the left half would be cut off. */
  it('shifts the drawing so nothing lands left of zero', () => {
    const count = 20
    const origin = isoOrigin(count)

    for (const berth of berthsFor(count)) {
      expect(origin.x + project(berth.spot).x).toBeGreaterThan(0)
    }
  })
})
