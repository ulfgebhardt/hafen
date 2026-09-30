import { describe, expect, it } from 'vitest'

import { fleetlets } from './flags'
import { blockOf, columnsIn, harbourOf, reachesShore, walksOf } from './moorings'
import { ship } from './testing'

/** A fleet named the way this machine's actually is: a few real groups and a tail of singletons. */
const fleetOf = (sizes: Readonly<Record<string, number>>) =>
  Object.entries(sizes).flatMap(([org, count]) =>
    Array.from({ length: count }, (_, index) =>
      ship({ org, name: `${org}-${String(index)}`, path: `/repos/${org}/${String(index)}` }),
    ),
  )

const REAL = { IT4Change: 18, ulfgebhardt: 15, webcraftmedia: 15, tu: 9, mojo: 6, einzel: 1 }

describe(columnsIn, () => {
  /** Searched, not estimated — the same defence the old `columnsFor` carries. */
  it('keeps a group roughly block-shaped rather than a line', () => {
    expect(columnsIn(1)).toBe(1)
    expect(columnsIn(18)).toBeGreaterThan(1)
    expect(columnsIn(18)).toBeLessThan(18)
  })

  it('never asks for more columns than there are ships', () => {
    for (const count of [0, 1, 2, 3, 7, 18, 40]) {
      expect(columnsIn(count)).toBeLessThanOrEqual(Math.max(1, count))
      expect(columnsIn(count)).toBeGreaterThanOrEqual(1)
    }
  })
})

describe(harbourOf, () => {
  const harbour = harbourOf(fleetlets(fleetOf(REAL)))

  /**
   * The assertion this module exists for. Followed through `parent` and not measured off the
   * drawing: a walkway that *looks* joined and one that *is* joined are different claims, and only
   * the second survives somebody moving a constant.
   */
  it('gives every ship a way ashore', () => {
    expect(harbour.moorings).toHaveLength(64)
    expect(reachesShore(harbour)).toBe(true)
  })

  it('gives every ship a way ashore at any fleet size', () => {
    for (const count of [1, 2, 5, 17, 92]) {
      const fleet = Array.from({ length: count }, (_, index) =>
        ship({ org: `org-${String(index % 7)}`, path: `/repos/${String(index)}` }),
      )

      expect(reachesShore(harbourOf(fleetlets(fleet)))).toBe(true)
    }
  })

  /**
   * She is filed against the pier she actually touches.
   *
   * An even row lies south of its own pier and an odd row lies *north of the next one*, so
   * `row / 2` filed half the fleet against planking it does not reach. Nothing caught it: any
   * spine reaches the shore, so the connectivity check passed either way. It needs its own
   * assertion, and the shape of that assertion is the point — the mooring's node must be the one
   * whose planking her side faces.
   */
  it('files each ship against the pier she actually lies at', () => {
    const many = harbourOf(fleetlets(fleetOf({ one: 12 })))
    const byId = new Map(many.nodes.map((node) => [node.id, node]))

    for (const mooring of many.moorings) {
      const spine = byId.get(mooring.node)

      expect(spine?.rank).toBe('spine')

      // Her planking is `side` away from her, and that is where the spine has to be.
      const towards = (spine?.spot.y ?? 0) - mooring.spot.y

      expect(Math.sign(towards)).toBe(-mooring.side)
      expect(Math.abs(towards)).toBeLessThan(12)
    }
  })

  /** Exactly one node stands on the quay, and everything else hangs off something that does. */
  it('has one root and no orphan', () => {
    const roots = harbour.nodes.filter((node) => node.parent === null)

    expect(roots).toHaveLength(1)
    expect(roots[0]?.rank).toBe('root')
  })

  /**
   * The grouping the whole change is for: a repository's neighbours used to be whoever sorted
   * next to it. Now they are the rest of its organisation.
   */
  it('lays each organisation out in one block', () => {
    for (const org of Object.keys(REAL)) {
      const mine = harbour.moorings.filter((one) => one.org === org)
      const xs = mine.map((one) => one.spot.x)
      const block = harbour.blocks.find((one) => one.org === org)

      expect(block).toBeDefined()
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(block?.at.x ?? 0)
      expect(Math.max(...xs)).toBeLessThanOrEqual((block?.at.x ?? 0) + (block?.width ?? 0))
    }
  })

  /** Biggest first, because the layout hangs the groups off the trunk in the order it gets them. */
  it('puts the largest organisation nearest the root', () => {
    const first = harbour.blocks[0]

    expect(first?.org).toBe('IT4Change')
  })

  /**
   * Same colour, more ways round. A group's own spines are tied to each other; between two
   * organisations there is at most the one link along a lane.
   */
  it('ties a group together more densely than two groups', () => {
    const within = harbour.crossings.filter((one) => one.within)
    const between = harbour.crossings.filter((one) => !one.within)

    expect(within.length).toBeGreaterThan(between.length)
    expect(within.every((one) => one.org !== null)).toBe(true)
    expect(between.every((one) => one.org === null)).toBe(true)
  })

  /**
   * No walkway is ever drawn over somebody else's ships.
   *
   * Found by looking rather than by thinking: the first arrangement joined risers to each other
   * and spines to each other by the shortest line, and both of those ran diagonally across the
   * blocks in between. Every extra way runs in a gap now, and a gap is open water by construction.
   */
  it('keeps every walkway out of the blocks, tree and extras alike', () => {
    const lines = [
      ...harbour.crossings.map((one) => ({ from: one.from, to: one.to })),
      // The tree too. Checking only the extras is what let a diagonal spine edge through.
      ...walksOf(harbour).map((one) => ({ from: one.from, to: one.to })),
    ]
    for (const cross of lines) {
      const crosses = harbour.blocks.some((block) => {
        const insideX = (at: number) => at > block.at.x && at < block.at.x + block.width
        const insideY = (at: number) => at > block.at.y && at < block.at.y + block.height
        return (
          (insideX(cross.from.x) || insideX(cross.to.x)) &&
          (insideY(cross.from.y) || insideY(cross.to.y))
        )
      })

      expect(crosses).toBe(false)
    }
  })

  /**
   * The extra ways are outside the tree, so none of them can be what a ship depends on. Dropping
   * every one of them must leave the harbour walkable.
   */
  it('still reaches the shore with every extra path removed', () => {
    expect(reachesShore({ ...harbour, crossings: [] })).toBe(true)
  })

  /** A single ship is a harbour too, and the smallest place for an off-by-one to hide. */
  it('lays out one ship without inventing a second pier', () => {
    const one = harbourOf(fleetlets([ship({ org: 'solo' })]))

    expect(one.moorings).toHaveLength(1)
    expect(reachesShore(one)).toBe(true)
    expect(one.width).toBeGreaterThan(0)
    expect(one.height).toBeGreaterThan(0)
  })

  /** An empty harbour has a size, because a viewport divides by it. */
  it('answers for an empty fleet rather than dividing by nothing', () => {
    const none = harbourOf([])

    expect(none.moorings).toStrictEqual([])
    expect(none.width).toBeGreaterThan(0)
    expect(none.height).toBeGreaterThan(0)
  })

  /** Read repeatedly, so it must not move: the same fleet twice is the same harbour twice. */
  it('places the same fleet the same way twice', () => {
    const again = harbourOf(fleetlets(fleetOf(REAL)))

    expect(again.moorings.map((one) => one.spot)).toStrictEqual(
      harbour.moorings.map((one) => one.spot),
    )
  })
})

describe(walksOf, () => {
  it('draws one segment per node that has a parent', () => {
    const harbour = harbourOf(fleetlets(fleetOf({ a: 4, b: 2 })))

    expect(walksOf(harbour)).toHaveLength(harbour.nodes.length - 1)
  })
})

describe(blockOf, () => {
  it('measures a group as wide as its columns and as deep as its rows', () => {
    const block = blockOf({ org: 'a', ships: fleetOf({ a: 6 }) })

    expect(block.columns * block.rows).toBeGreaterThanOrEqual(6)
    expect(block.width).toBeGreaterThan(0)
    expect(block.height).toBeGreaterThan(0)
  })
})
