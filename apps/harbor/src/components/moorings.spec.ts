import { describe, expect, it } from 'vitest'

import { fleetlets } from './flags'
import {
  arcFor,
  berthBox,
  centresFor,
  CENTRES_MOST,
  cuts,
  FAN,
  harbourOf,
  inTheWayOf,
  overlaps,
  endsAtAShip,
  reachesShore,
  sectorsOf,
  trimmed,
  walksOf,
  waysAt,
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

  /**
   * The other half of the promise: every piece of walkway is there for a ship.
   *
   * A limb is laid out to a group's sector before its berths are placed, and a berth rejected on
   * geometry used to leave the piece that was going to serve it standing — three of them on this
   * machine's fleet, drawn as little peaks running out into open water. Neither check implies the
   * other: a way to nowhere strands nobody, it only lies about being a route.
   */
  it('ends every walkway at a ship', () => {
    expect(endsAtAShip(harbour)).toBe(true)

    for (const count of [1, 2, 5, 17, 64, 92]) {
      const fleet = Array.from({ length: count }, (_, index) =>
        ship({ org: `org-${String(index % 7)}`, path: `/repos/${String(index)}` }),
      )
      const laid = harbourOf(fleetlets(fleet))

      expect(endsAtAShip(laid)).toBe(true)
      expect(reachesShore(laid)).toBe(true)
    }
  })

  it('cuts back a loose end without cutting anybody off', () => {
    const before = harbourOf(fleetlets(fleetOf(REAL)))
    // Ein Steg ins Nichts, von Hand angehaengt: er faellt, und der Rest bleibt erreichbar.
    const tip = before.quays.at(-1)
    // Eine freie Id und nicht `length`: nach dem Beschneiden sind die Ids nicht mehr lueckenlos.
    const free = Math.max(...before.quays.map((quay) => quay.id)) + 1
    const loose = {
      id: free,
      spot: { x: 0, y: 0 },
      rank: 'stub' as const,
      org: null,
    }
    const grown = {
      ...before,
      quays: [...before.quays, loose],
      ways: [
        ...before.ways,
        { from: tip?.id ?? 0, to: loose.id, kind: 'tree' as const, org: null },
      ],
    }

    expect(endsAtAShip(grown)).toBe(false)
    expect(trimmed(grown).quays).toHaveLength(before.quays.length)
    expect(endsAtAShip(trimmed(grown))).toBe(true)
    expect(reachesShore(trimmed(grown))).toBe(true)
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
    const byId = new Map(many.quays.map((quay) => [quay.id, quay]))

    for (const mooring of many.moorings) {
      const plank = byId.get(mooring.node)

      expect(plank?.rank).toBe('plank')

      // Her planking is `side` away from her, and that is where the plank has to be.
      const towards = (plank?.spot.y ?? 0) - mooring.spot.y

      expect(Math.sign(towards)).toBe(-mooring.side)
      expect(Math.abs(towards)).toBeCloseTo(BERTH.laneCentre)
    }
  })

  /** Every quay is joined to something — a root included, once there is more than one of them. */
  it('leaves no orphan quay', () => {
    const touched = new Set(harbour.ways.flatMap((way) => [way.from, way.to]))
    const roots = harbour.quays.filter((quay) => quay.rank === 'root')

    expect(roots.length).toBeGreaterThanOrEqual(1)
    // A centre with no dock dealt to it carries no ways, and is an empty shore rather than
    // an orphan.
    expect(
      harbour.quays.filter((quay) => quay.rank !== 'root' && !touched.has(quay.id)),
    ).toStrictEqual([])
  })

  /**
   * The tree ways alone already connect everything.
   *
   * That is the construction the promise rests on: `extend` cannot lay a quay without the way
   * that reaches it, so the extras really are extras. Throwing every one of them away and asking
   * again is how that stops being a claim in a comment.
   */
  it('reaches the shore on the laid ways alone, with every extra removed', () => {
    const tree = harbour.ways.filter((way) => way.kind !== 'round')

    expect(reachesShore(harbour, tree)).toBe(true)
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
  it('puts the largest organisation straight ahead of its centre', () => {
    // Bearings are measured off the centre's own inward direction, so "straight ahead" is the
    // fan's middle rather than a fixed compass point.
    const inward = Math.PI / 2
    const off = (org: string): number =>
      Math.abs((harbour.blocks.find((one) => one.org === org)?.angle ?? 0) - inward)

    expect(off('Wattenmeer')).toBeLessThan(off('einzel'))
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
    // A real walk over the ways, which is what the graph is for: hops, not parent hops.
    const edge = new Map<number, number[]>()
    for (const way of harbour.ways) {
      edge.set(way.from, [...(edge.get(way.from) ?? []), way.to])
      edge.set(way.to, [...(edge.get(way.to) ?? []), way.from])
    }
    const steps = (a: number, b: number): number => {
      const seen = new Map([[a, 0]])
      const queue = [a]
      while (queue.length > 0) {
        const at = queue.shift() ?? 0
        if (at === b) {
          return seen.get(at) ?? 0
        }
        for (const next of edge.get(at) ?? []) {
          if (!seen.has(next)) {
            seen.set(next, (seen.get(at) ?? 0) + 1)
            queue.push(next)
          }
        }
      }
      return Number.POSITIVE_INFINITY
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
    // Every way, extras included: checking only one kind is what let a diagonal through before.
    const lines = walksOf(harbour)

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
  /** Somebody standing on a plank can walk somewhere: the graph answers that, a tree did not. */
  it('says what can be walked from a plank', () => {
    const plank = harbour.moorings[0]?.node ?? 0

    expect(waysAt(harbour, plank).length).toBeGreaterThan(0)
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
  /**
   * One segment per way, and the tree ways are exactly one fewer than there are quays.
   *
   * That count *is* the construction: a tree over n quays has n−1 edges, so any other number
   * means a quay was laid without a way or a way was laid twice. The extras are counted apart
   * for the same reason they are a separate kind.
   */
  it('draws one segment per way, and the laid ways make a tree', () => {
    const harbour = harbourOf(fleetlets(fleetOf({ a: 4, b: 2 })))
    const tree = harbour.ways.filter((way) => way.kind === 'tree')

    expect(walksOf(harbour)).toHaveLength(harbour.ways.length)
    expect(tree).toHaveLength(harbour.quays.length - 1)
  })
})

describe('several centres', () => {
  /**
   * One fan wastes its own middle. Strung along one shore the centres stacked into a column and
   * the picture came out 701 × 1252 — twice as tall as wide, the opposite of a window. Round a
   * frame, fanning inward, six fans fought over the middle and spent five times the area the same
   * fleet takes in lanes. A row along one shore, all fanning the same way, has neither problem.
   */
  it('reaches the shore in more than one place once there are docks enough', () => {
    const many = harbourOf(fleetlets(fleetOf({ a: 4, b: 4, c: 4, d: 4, e: 4, f: 4, g: 4 })))
    const roots = many.quays.filter((quay) => quay.rank === 'root')

    expect(roots.length).toBeGreaterThan(1)
    expect(reachesShore(many)).toBe(true)
  })

  /** And a small fleet keeps one, because two fans of one limb each is a row and not a fan. */
  it('keeps a single centre for a handful of docks', () => {
    expect(centresFor(1)).toBe(1)
    expect(centresFor(3)).toBe(1)
    expect(centresFor(25)).toBeGreaterThan(1)
    expect(centresFor(1000)).toBeLessThanOrEqual(CENTRES_MOST)
  })

  /**
   * Every centre counts as shore. A check seeded from the first one would have called four fifths
   * of the harbour unreachable — a correct answer to the wrong question.
   */
  it('lets a ship reach whichever piece of land is nearest', () => {
    const many = harbourOf(fleetlets(fleetOf({ a: 5, b: 5, c: 5, d: 5, e: 5, f: 5, g: 5, h: 5 })))

    expect(many.quays.filter((quay) => quay.rank === 'root').length).toBeGreaterThan(1)
    expect(reachesShore(many)).toBe(true)
  })

  /** Narrower fans where there are more of them, or each reaches round into its neighbour's. */
  it('opens each fan less widely the more of them there are', () => {
    expect(arcFor(1)).toBe(FAN)
    expect(arcFor(6)).toBeLessThan(arcFor(2))
    expect(arcFor(6)).toBeGreaterThan(0)
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
