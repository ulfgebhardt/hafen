import { describe, expect, it } from 'vitest'

import { fleetlets } from './flags'
import {
  berthBox,
  cuts,
  harbourOf,
  inTheWayOf,
  overlaps,
  reachesShore,
  sectorsOf,
  walksOf,
} from './moorings'
import { BERTH } from './plan'
import { ship } from './testing'
import { SIZE } from './vessel'

/** A fleet named the way this machine's actually is: a few real groups and a tail of singletons. */
const fleetOf = (sizes: Readonly<Record<string, number>>) =>
  Object.entries(sizes).flatMap(([org, count]) =>
    Array.from({ length: count }, (_, index) =>
      ship({ org, name: `${org}-${String(index)}`, path: `/repos/${org}/${String(index)}` }),
    ),
  )

const REAL = { Wattenmeer: 18, ulfgebhardt: 15, werkstatt: 15, lehre: 9, kombuese: 6, einzel: 1 }

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
   * She is filed against the plank she actually touches.
   *
   * The arrangement before this one filed half the fleet against planking it does not reach, and
   * nothing caught it: any walkway reaches the shore, so the connectivity check passed either way.
   * The assertion has to be about *which* plank, not about whether there is one.
   */
  it('files each ship against the plank she actually lies at', () => {
    const many = harbourOf(fleetlets(fleetOf({ one: 12 })))
    const byId = new Map(many.nodes.map((node) => [node.id, node]))

    for (const mooring of many.moorings) {
      const plank = byId.get(mooring.node)

      expect(plank?.rank).toBe('plank')

      // Her planking is `side` away from her, and that is where the plank has to be.
      const towards = (plank?.spot.y ?? 0) - mooring.spot.y

      expect(Math.sign(towards)).toBe(-mooring.side)
      expect(Math.abs(towards)).toBeCloseTo(BERTH.laneCentre)
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
   * next to it. Now they are the rest of its organisation, on one limb.
   */
  it('keeps each organisation inside its own dock', () => {
    for (const org of Object.keys(REAL)) {
      const mine = harbour.moorings.filter((one) => one.org === org)
      const dock = harbour.blocks.find((one) => one.org === org)

      expect(dock).toBeDefined()

      for (const one of mine) {
        expect(one.spot.x).toBeGreaterThanOrEqual(dock?.at.x ?? 0)
        expect(one.spot.x).toBeLessThanOrEqual((dock?.at.x ?? 0) + (dock?.width ?? 0))
      }
    }
  })

  /** One limb per organisation, so every ship of a dock shares one bearing from the shore. */
  it('gives one organisation one bearing', () => {
    for (const org of Object.keys(REAL)) {
      const bearings = new Set(
        harbour.moorings.filter((one) => one.org === org).map((one) => one.angle),
      )

      expect(bearings.size).toBe(1)
    }
  })

  /**
   * The biggest dock takes the middle of the fan, because the middle is where there is most room.
   * Dealt outward from there, so the singletons get the shallow angles top and bottom.
   */
  it('puts the largest organisation straight ahead of the root', () => {
    const angles = new Map(harbour.blocks.map((one) => [one.org, Math.abs(one.angle)]))

    expect(angles.get('Wattenmeer')).toBeLessThan(angles.get('einzel') ?? 9)
  })

  /**
   * The thing the search exists for, and the reason it is a search: no two berths may overlap.
   * A closed form would have to know every hull's length, every apron's width and which sector
   * the neighbour spilled into.
   */
  it('never lays one berth over another', () => {
    for (const [index, one] of harbour.moorings.entries()) {
      for (const other of harbour.moorings.slice(index + 1)) {
        expect(overlaps(berthBox(one), berthBox(other))).toBe(false)
      }
    }
  })

  /** Everything the search placed is inside the picture it reports. */
  it('reports a size that holds what it placed', () => {
    for (const mooring of harbour.moorings) {
      const box = berthBox(mooring)

      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(harbour.width)
      expect(box.y + box.height).toBeLessThanOrEqual(harbour.height)
    }
  })

  /**
   * Same colour, closer together — and in a fan that is the tree itself rather than extra links.
   *
   * Two ships of one organisation share a limb, so the walk between them turns off it once and
   * back on; two ships of different organisations have to go back to the shore. Measured as the
   * number of walkway nodes between them, which is the thing a person would actually walk.
   */
  it('puts two ships of one organisation fewer steps apart', () => {
    const byId = new Map(harbour.nodes.map((node) => [node.id, node]))
    const toRoot = (start: number): number[] => {
      const path: number[] = []
      let at: number | null = start
      while (at !== null) {
        path.push(at)
        at = byId.get(at)?.parent ?? null
      }
      return path
    }
    const steps = (a: number, b: number): number => {
      const up = toRoot(a)
      const down = toRoot(b)
      const meet = up.find((one) => down.includes(one)) ?? 0
      return up.indexOf(meet) + down.indexOf(meet)
    }

    const mates = harbour.moorings.filter((one) => one.org === 'Wattenmeer')
    const stranger = harbour.moorings.find((one) => one.org === 'werkstatt')

    expect(mates.length).toBeGreaterThan(1)
    expect(stranger).toBeDefined()
    expect(steps(mates[0]?.node ?? 0, mates[1]?.node ?? 0)).toBeLessThan(
      steps(mates[0]?.node ?? 0, stranger?.node ?? 0),
    )
  })

  /**
   * No walkway is ever drawn over somebody else's ships.
   *
   * Found by looking rather than by thinking: the first arrangement joined risers to each other
   * and spines to each other by the shortest line, and both of those ran diagonally across the
   * blocks in between. Every extra way runs in a gap now, and a gap is open water by construction.
   */
  /**
   * No walkway is drawn over a hull.
   *
   * The rule two arrangements were broken by, and the reason the fan exists: with docks packed
   * edge to edge, any diagonal crossed the block between its ends. Checked against the *hulls*
   * now rather than against a dock's bounding box, because a fan's docks are wedges and a box
   * round one would forbid the open water beside it.
   */
  it('keeps every walkway off the hulls, tree and extras alike', () => {
    const hulls = harbour.moorings.map((one) => ({
      name: one.ship.name,
      box: {
        x: one.spot.x,
        y: one.spot.y - SIZE.maxBeam / 2,
        width: SIZE.maxLength,
        height: SIZE.maxBeam,
      },
    }))
    const lines = [
      ...harbour.crossings,
      // The tree too. Checking only the extras is what let a diagonal tree edge through before.
      ...walksOf(harbour),
    ]

    // Gathered and asserted once: a quarter of a million assertions is a test that times out
    // rather than a test that tells you which plank is wrong.
    const over = lines.flatMap((line) =>
      hulls.filter((hull) => cuts(line.from, line.to, hull.box)).map((hull) => hull.name),
    )

    expect(over).toStrictEqual([])
  })

  /**
   * The extra ways are outside the tree, so none of them can be what a ship depends on. Dropping
   * every one of them must leave the harbour walkable.
   */
  it('still reaches the shore with every extra path removed', () => {
    expect(reachesShore({ ...harbour, crossings: [] })).toBe(true)
  })

  /** A single ship is a harbour too, and the smallest place for an off-by-one to hide. */
  it('lays out one ship without inventing a second limb', () => {
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

describe(sectorsOf, () => {
  /**
   * By the root of the count and not the count. A sector is an angle, and what a group needs from
   * an angle is room *across* its limb; the rest of its growth goes into length. Straight by
   * count, the eighteen-ship dock here took a quarter of the fan and each singleton a fortieth —
   * narrower than one hull.
   */
  it('gives a big dock more of the fan, but not proportionally more', () => {
    const [big, small] = sectorsOf([16, 1])

    expect(big).toBeGreaterThan(small ?? 0)
    expect((big ?? 0) / (small ?? 1)).toBeLessThan(16)
    expect((big ?? 0) / (small ?? 1)).toBeCloseTo(4)
  })

  it('shares out the whole fan and no more', () => {
    const shares = sectorsOf([18, 15, 9, 1, 1, 1])

    expect(shares.reduce((sum, one) => sum + one, 0)).toBeCloseTo(1)
  })

  it('answers for a fleet of nothing', () => {
    expect(sectorsOf([])).toStrictEqual([])
  })
})

describe(inTheWayOf, () => {
  /**
   * The check that found the last four. `clearanceOn` keeps a berth off *her own* limb, which a
   * limb-by-limb test can confirm and still miss the case that matters: a berth pushed far out
   * along a shallow sector drifting under a steeper neighbour's limb.
   */
  const east = { along: { x: 1, y: 0 }, square: { x: 0, y: 1 } }

  it('sees a box the limb runs through', () => {
    expect(inTheWayOf({ x: 10, y: -5, width: 20, height: 10 }, east.along, east.square)).toBe(true)
  })

  it('lets a box beside the limb be', () => {
    expect(inTheWayOf({ x: 10, y: 5, width: 20, height: 10 }, east.along, east.square)).toBe(false)
    expect(inTheWayOf({ x: 10, y: -15, width: 20, height: 10 }, east.along, east.square)).toBe(
      false,
    )
  })

  /** A limb is a ray and not a line: what lies behind the root is not in its way. */
  it('does not reach behind the root', () => {
    expect(inTheWayOf({ x: -40, y: -5, width: 20, height: 10 }, east.along, east.square)).toBe(
      false,
    )
  })
})

describe(cuts, () => {
  /** Sampled, because an endpoint test misses a line that runs clean through. */
  it('sees a segment that passes straight through', () => {
    const box = { x: 10, y: 10, width: 10, height: 10 }

    expect(cuts({ x: 0, y: 15 }, { x: 40, y: 15 }, box)).toBe(true)
    expect(cuts({ x: 0, y: 0 }, { x: 40, y: 0 }, box)).toBe(false)
  })
})
