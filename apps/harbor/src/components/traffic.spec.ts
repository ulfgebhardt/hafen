import { describe, expect, it } from 'vitest'

import { fleetlets } from './flags'
import { harbourOf as laneHarbour } from './lanes'
import { harbourOf as fanHarbour, cuts, walksOf } from './moorings'
import { ship } from './testing'
import {
  carriageOf,
  CLEARANCE,
  freeOn,
  LANE_SHARE,
  lanesOf,
  longestOn,
  middles,
  networkOf,
  PACE,
  ROAM,
  routesOf,
  spanOf,
  stepFrom,
} from './traffic'

import type { Harbour } from './moorings'
import type { Spot } from './plan'
import type { Network } from './traffic'

/** The shape this machine's fleet actually has: a few real groups and a tail of singletons. */
const fleetOf = (sizes: Readonly<Record<string, number>>) =>
  Object.entries(sizes).flatMap(([org, count]) =>
    Array.from({ length: count }, (_, index) =>
      ship({ org, name: `${org}-${String(index)}`, path: `/repos/${org}/${String(index)}` }),
    ),
  )

const REAL = { Wattenmeer: 18, ulfgebhardt: 15, werkstatt: 15, lehre: 9, kombuese: 6, einzel: 1 }
const fleet = fleetlets(fleetOf(REAL))

/** Both arrangements, because both emit the same graph and the rules are about the graph. */
const BOTH: readonly { name: string; harbour: Harbour }[] = [
  { name: 'lanes', harbour: laneHarbour(fleet) },
  { name: 'fan', harbour: fanHarbour(fleet) },
]

describe(carriageOf, () => {
  /** Boards are walked, water is sailed — and the way says which it is, not where it runs. */
  it('reads the carriage off the kind of way', () => {
    expect(carriageOf('tree')).toBe('foot')
    expect(carriageOf('round')).toBe('water')
    expect(carriageOf('tender')).toBe('water')
  })
})

describe(spanOf, () => {
  it('measures a route end to end', () => {
    expect(spanOf({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe(freeOn, () => {
  /** Exact and not sampled: a box blocks a line on precisely one interval. */
  it('takes the blocked stretches out of the line', () => {
    expect(freeOn([{ from: 20, to: 40 }], 100)).toStrictEqual([
      { from: 0, to: 20 },
      { from: 40, to: 100 },
    ])
  })

  it('merges stretches that overlap, rather than reporting water between them', () => {
    expect(
      freeOn(
        [
          { from: 20, to: 60 },
          { from: 30, to: 40 },
        ],
        100,
      ),
    ).toStrictEqual([
      { from: 0, to: 20 },
      { from: 60, to: 100 },
    ])
  })

  it('answers with the whole line where nothing blocks it', () => {
    expect(freeOn([], 100)).toStrictEqual([{ from: 0, to: 100 }])
  })

  it('answers with nothing where a dock covers the line end to end', () => {
    expect(freeOn([{ from: 0, to: 100 }], 100)).toStrictEqual([])
  })
})

describe(longestOn, () => {
  it('picks the widest stretch of open water on the line', () => {
    expect(
      longestOn(
        [
          { from: 0, to: 10 },
          { from: 30, to: 40 },
        ],
        100,
      ),
    ).toStrictEqual({ from: 40, to: 100 })
  })

  it('says so where there is no open water at all', () => {
    expect(longestOn([{ from: 0, to: 100 }], 100)).toBeNull()
  })
})

describe(middles, () => {
  /** One lane down a band of water: ten parallel lanes six units apart is a hatch pattern. */
  it('answers with the middle line of each band', () => {
    const lines = [{ at: 6 }, { at: 12 }, { at: 18 }, { at: 60 }, { at: 66 }]

    expect(middles(lines, 6)).toStrictEqual([{ at: 12 }, { at: 66 }])
  })

  it('has no middle for water it was given none of', () => {
    expect(middles([], 6)).toStrictEqual([])
  })

  it('keeps a single open line as its own band', () => {
    expect(middles([{ at: 42 }], 6)).toStrictEqual([{ at: 42 }])
  })
})

describe(routesOf, () => {
  describe.each(BOTH)('$name', ({ harbour }) => {
    const routes = routesOf(harbour)
    const planks = walksOf(harbour).filter((walk) => walk.kind === 'tree')

    /**
     * The claim this module exists for: a way nothing is ever seen taking is a line, not a route.
     * Before this, traffic went where it was convenient and most of the planking in a ninety-ship
     * harbour stood empty.
     */
    it('gives every single walkway somebody walking it', () => {
      expect(routes).toHaveLength(planks.length)
      expect(routes.length).toBeGreaterThan(30)
      expect(routes.map((route) => [route.from, route.to])).toStrictEqual(
        planks.map((plank) => [plank.from, plank.to]),
      )
    })

    /** A figure strolling across the fairway, which is what `waysAt` used to hand out. */
    it('never walks a person over water', () => {
      expect(routes.every((route) => route.on === 'foot')).toBe(true)
      expect(routes.length).toBeLessThan(harbour.ways.length + 1)
    })

    /** A picture that shuffles between two draws makes every difference in it suspect. */
    it('draws the same harbour the same way twice', () => {
      expect(routesOf(harbour)).toStrictEqual(routes)
    })

    it('starts its traffic at different places along the way', () => {
      const offsets = new Set(routes.map((route) => route.offset))

      expect(offsets.size).toBeGreaterThan(10)
      expect(routes.every((route) => route.offset >= 0 && route.offset < 1)).toBe(true)
    })

    /** The walkways are somebody's, and the figure on one carries that flag. */
    it('carries the flag its way carries', () => {
      expect(routes.map((route) => route.org)).toStrictEqual(planks.map((plank) => plank.org))
    })
  })

  it('has nothing to show for a harbour with no ways', () => {
    expect(routesOf(fanHarbour([]))).toStrictEqual([])
  })
})

describe(lanesOf, () => {
  describe.each(BOTH)('$name', ({ harbour }) => {
    const lanes = lanesOf(harbour)

    it('finds open water to run in', () => {
      expect(lanes.length).toBeGreaterThan(0)
    })

    /**
     * The one thing a lane must never do. A launch drawn over a dock sails across other people's
     * decks, and a lane down the gap between two docks runs alongside the riser standing in it —
     * which is what the boats looked wrong doing in the first place.
     */
    it('keeps every lane clear of every dock, by the whole clearance', () => {
      for (const lane of lanes) {
        for (const block of harbour.blocks) {
          const wall = {
            x: block.at.x - CLEARANCE,
            y: block.at.y - CLEARANCE,
            width: block.width + CLEARANCE * 2,
            height: block.height + CLEARANCE * 2,
          }

          expect(cuts(lane.from, lane.to, wall)).toBe(false)
        }
      }
    })

    /** Long on purpose: a boat crossing the picture is passing traffic, a short hop is a ferry. */
    it('crosses at least its share of the harbour', () => {
      for (const lane of lanes) {
        expect(spanOf(lane.from, lane.to)).toBeGreaterThanOrEqual(harbour.width * LANE_SHARE)
      }
    })

    /** One lane down the middle of a band, never a bundle of parallel ones in the same water. */
    it('puts one lane down a band of water and not a sheaf of them', () => {
      const across = lanes.filter((lane) => lane.from.y === lane.to.y).map((lane) => lane.from.y)
      const gaps = across.slice(1).map((y, index) => y - (across[index] ?? 0))

      expect(gaps.every((gap) => gap > CLEARANCE)).toBe(true)
    })

    /**
     * And never alongside a walkway, which the docks alone did not cover: the trunk stands on the
     * west quay, which no dock covers, so the first lane found there ran up it at four tenths of a
     * unit — a launch driving along a plank, which is the complaint this arrangement answers.
     *
     * Measured by brute force here rather than with the production arithmetic, so the check is an
     * independent opinion and not the same sum written twice. Measured on this fleet, no lane
     * comes within the clearance of a walkway *at all* — not even crossing one.
     */
    it('never comes within the clearance of a walkway', () => {
      const planks = walksOf(harbour).filter((walk) => walk.kind === 'tree')
      const gap = (at: Spot, from: Spot, to: Spot): number => {
        const dx = to.x - from.x
        const dy = to.y - from.y
        const square = dx * dx + dy * dy
        const along =
          square === 0
            ? 0
            : Math.min(1, Math.max(0, ((at.x - from.x) * dx + (at.y - from.y) * dy) / square))
        return Math.hypot(at.x - (from.x + dx * along), at.y - (from.y + dy * along))
      }

      for (const lane of lanes) {
        const steps = 120
        for (let step = 0; step <= steps; step += 1) {
          const at = {
            x: lane.from.x + ((lane.to.x - lane.from.x) * step) / steps,
            y: lane.from.y + ((lane.to.y - lane.from.y) * step) / steps,
          }
          const room = planks.reduce(
            (least, plank) => Math.min(least, gap(at, plank.from, plank.to)),
            Number.POSITIVE_INFINITY,
          )

          expect(room).toBeGreaterThan(CLEARANCE)
        }
      }
    })

    it('answers the same way twice', () => {
      expect(lanesOf(harbour)).toStrictEqual(lanes)
    })
  })

  /**
   * Across and never down, on any fleet shape.
   *
   * A hull seen end-on is a wedge with nothing in it to read, so a boat climbing the picture was
   * a rocket and not traffic. The lopsided fleet is here because it is the one that *did* leave a
   * clear column — this machine's own does not, so a plain check would have passed either way.
   */
  it('never runs a lane up the picture', () => {
    const lopsided = laneHarbour(fleetlets(fleetOf({ gross: 30, klein: 2 })))
    for (const harbour of [...BOTH.map((one) => one.harbour), lopsided]) {
      expect(lanesOf(harbour).every((lane) => lane.from.y === lane.to.y)).toBe(true)
    }
  })

  /** An empty harbour is one unit square: there is no water to run in and that is not an error. */
  it('finds nothing to run in a harbour with no docks', () => {
    expect(lanesOf(fanHarbour([]))).toStrictEqual([])
  })
})

describe('pace', () => {
  /**
   * Units per second and not a fraction of the route: the old number meant something different on
   * every way, so a 52-unit plank and a 6-unit stub were covered in the same time.
   */
  it('travels water faster than boards', () => {
    expect(PACE.water).toBeGreaterThan(PACE.foot)
    expect(PACE.foot).toBeGreaterThan(0)
  })
})

describe(networkOf, () => {
  const harbour = BOTH[0]?.harbour ?? laneHarbour(fleet)

  it('offers every quay as a place and every walkway as a step, both ways round', () => {
    const network = networkOf(harbour)
    const planks = walksOf(harbour).filter((walk) => walk.kind === 'tree')

    expect(network.where.size).toBe(harbour.quays.length)

    for (const way of harbour.ways.filter((one) => one.kind === 'tree')) {
      expect(network.next.get(`q${String(way.from)}`)).toContain(`q${String(way.to)}`)
      expect(network.next.get(`q${String(way.to)}`)).toContain(`q${String(way.from)}`)
    }

    expect(planks.length).toBeGreaterThan(0)
  })

  /** Water is not a step: a figure that walked a way round would be walking the fairway. */
  it('never offers a way round as a step', () => {
    const network = networkOf(harbour)

    for (const way of harbour.ways.filter((one) => one.kind !== 'tree')) {
      expect(network.next.get(`q${String(way.from)}`) ?? []).not.toContain(`q${String(way.to)}`)
    }
  })

  /** The gangway is what it is drawn as: one step from the planking onto her deck. */
  it('hangs a deck off the plank she lies against, as a ring', () => {
    const mooring = harbour.moorings[0]
    const node = mooring?.node ?? 0
    const ring = [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
    ]
    const network = networkOf(harbour, new Map([[node, ring]]))

    expect(network.next.get(`q${String(node)}`)).toContain(`d${String(node)}.0`)
    expect(network.next.get(`d${String(node)}.0`)).toContain(`d${String(node)}.1`)
    // Round and not up and down: the last spot leads back to the first.
    expect(network.next.get(`d${String(node)}.2`)).toContain(`d${String(node)}.0`)
    expect(network.where.get(`d${String(node)}.1`)).toStrictEqual({ x: 20, y: 10 })
  })

  it('takes a deck for a berth that does not exist as nothing at all', () => {
    const network = networkOf(harbour, new Map([[9999, [{ x: 1, y: 1 }]]]))

    expect(network.where.has('d9999.0')).toBe(false)
  })

  it('takes an empty deck as no deck', () => {
    const mooring = harbour.moorings[0]
    const network = networkOf(harbour, new Map([[mooring?.node ?? 0, []]]))

    expect([...network.where.keys()].some((place) => place.startsWith('d'))).toBe(false)
  })
})

describe(stepFrom, () => {
  /**
   * One number carries the whole behaviour: the further she is from her own ship, the more likely
   * her next step is towards it. Outbound that reads as turning round, inbound as carrying on —
   * the same arithmetic, which is why both sentences describe it.
   */
  const network: Network = {
    where: new Map([
      ['home', { x: 0, y: 0 }],
      ['near', { x: 10, y: 0 }],
      ['far', { x: ROAM, y: 0 }],
      ['away', { x: ROAM + 20, y: 0 }],
    ]),
    next: new Map([
      ['home', ['near']],
      ['near', ['home', 'far']],
      ['far', ['near', 'away']],
      ['away', ['far']],
    ]),
  }

  it('turns for home with certainty once she is a whole roam out', () => {
    for (const roll of [0, 0.5, 0.99]) {
      expect(stepFrom(network, 'far', { x: 0, y: 0 }, roll)).toBe('near')
    }
  })

  it('wanders freely at her own berth', () => {
    // far = 10/90, so all but the first tenth of the roll goes to the other options.
    expect(stepFrom(network, 'near', { x: 0, y: 0 }, 0.9)).toBe('far')
    expect(stepFrom(network, 'near', { x: 0, y: 0 }, 0.05)).toBe('home')
  })

  it('leaves a dead end the way she came', () => {
    expect(stepFrom(network, 'away', { x: 0, y: 0 }, 0.99)).toBe('far')
  })

  it('stays put where there is nowhere to go', () => {
    expect(stepFrom({ where: new Map(), next: new Map() }, 'nowhere', { x: 0, y: 0 }, 0.5)).toBe(
      'nowhere',
    )
  })

  /** The same place, the same roll and the same ship give the same answer. Always. */
  it('answers the same way twice', () => {
    for (const roll of [0.1, 0.4, 0.77]) {
      expect(stepFrom(network, 'near', { x: 0, y: 0 }, roll)).toBe(
        stepFrom(network, 'near', { x: 0, y: 0 }, roll),
      )
    }
  })
})

describe('a walk over places that are not there', () => {
  /**
   * A place with no spot is not a crash.
   *
   * The network is built from two sources — the harbour and the decks — and a berth that is
   * listed with a node the graph does not carry would otherwise take the whole picture down. The
   * answer is a step, and an unplaceable neighbour is the furthest thing from home there is.
   */
  it('walks on where a place has no position', () => {
    const network: Network = {
      where: new Map([['here', { x: 0, y: 0 }]]),
      next: new Map([
        ['here', ['ghost', 'here']],
        ['ghost', ['here']],
      ]),
    }

    expect(stepFrom(network, 'here', { x: 0, y: 0 }, 0.5)).toBe('ghost')
    // Standing nowhere, she is at no distance from home at all, so she wanders.
    expect(stepFrom(network, 'ghost', { x: 0, y: 0 }, 0.99)).toBe('here')
  })
})
