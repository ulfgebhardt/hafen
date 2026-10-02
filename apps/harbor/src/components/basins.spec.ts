import { NO_WORK } from '@hafen/core'
import { describe, expect, it } from 'vitest'

import {
  basinOf,
  bearingsOf,
  berthAround,
  cellsFor,
  endOf,
  laidUp,
  landingsFrom,
  latticeWays,
  nameFor,
  harbourOf,
  kindredsOf,
  LATTICE,
  ringCells,
  ringOf,
  spotOf,
  STEPS,
  toShore,
} from './basins'
import { NO_ORG } from './flags'
import { berthBox, cuts, overlaps, reachesShore, reachOf, shoreOf } from './moorings'
import { BERTH } from './plan'
import { ship } from './testing'

describe(ringOf, () => {
  /** The property the whole shape rests on: a ring is a set of cells equally far from the middle. */
  it('says which ring a cell is on', () => {
    expect(ringOf({ q: 0, r: 0 })).toBe(0)

    for (const step of STEPS) {
      expect(ringOf(step)).toBe(1)
    }

    expect(ringOf({ q: 2, r: -1 })).toBe(2)
  })
})

describe(ringCells, () => {
  /** `6k` and no more — which is what makes this a ring rather than an ellipse of rows. */
  it.each([1, 2, 3, 5])('walks ring %i once round', (k) => {
    const cells = ringCells(k)

    expect(cells).toHaveLength(6 * k)
    expect(new Set(cells.map((cell) => `${String(cell.q)}.${String(cell.r)}`)).size).toBe(6 * k)

    for (const cell of cells) {
      expect(ringOf(cell)).toBe(k)
    }
  })

  /** Ring nought is the middle, and the middle holds the kindred's name rather than a ship. */
  it('is nothing at the middle', () => {
    expect(ringCells(0)).toStrictEqual([])
  })

  /** Each cell is a neighbour of the last, so a ring is walked and not scattered. */
  it('walks, step by step', () => {
    const cells = ringCells(3)
    for (let index = 1; index < cells.length; index += 1) {
      const one = cells[index - 1]
      const next = cells[index]
      const step = { q: (next?.q ?? 0) - (one?.q ?? 0), r: (next?.r ?? 0) - (one?.r ?? 0) }

      expect(STEPS.some((only) => only.q === step.q && only.r === step.r)).toBe(true)
    }
  })
})

describe(cellsFor, () => {
  it.each([1, 6, 7, 14, 45, 92])('places all %i ships and never two in one cell', (count) => {
    const cells = cellsFor(count)

    expect(cells).toHaveLength(count)
    expect(new Set(cells.map((cell) => `${String(cell.q)}.${String(cell.r)}`)).size).toBe(count)
  })

  /**
   * From the first ring outward, and the middle cell stays empty.
   *
   * This went two ways before it settled. An eye that grew with the basin kept the shape a ring
   * and made every basin a wide donut with its ships at the rim. Filling the middle fixed the
   * crowding and left the kindred's name nowhere to go but above the basin, where it was lost
   * among twenty-three others and, on a tight row, under a hull. One cell does both.
   */
  it('fills from the first ring outward and leaves the middle open', () => {
    const rings = cellsFor(20).map((cell) => ringOf(cell))

    expect(rings[0]).toBe(1)
    expect(rings).not.toContain(0)
    expect(rings).toStrictEqual([...rings].sort((a, b) => a - b))
  })

  it('puts a kindred of one beside its name, not on top of it', () => {
    expect(cellsFor(1)).toStrictEqual([{ q: 1, r: 0 }])
  })

  /** Every ring is full before the next is started — that is what crowding is. */
  it.each([7, 19, 37])('fills each ring before the next at %i', (count) => {
    const rings = cellsFor(count).map((cell) => ringOf(cell))
    const outer = Math.max(...rings)

    for (let ring = 1; ring < outer; ring += 1) {
      expect(rings.filter((one) => one === ring)).toHaveLength(6 * ring)
    }
  })

  /**
   * A part-filled outer ring is left part-filled rather than spread over two: a ring that is
   * obviously the newest is a reading, and thinning one out to look tidy would be the drawing
   * arranging the measurement.
   */
  it('leaves the outermost ring part filled', () => {
    const rings = cellsFor(10).map((cell) => ringOf(cell))
    const outer = Math.max(...rings)

    expect(rings.filter((ring) => ring === outer).length).toBeLessThan(6 * outer)
  })
})

describe(spotOf, () => {
  /** Stretched to the shape of the thing standing in it: a hull is four times wider than deep. */
  it('puts a column a berth apart and a row half a block apart', () => {
    expect(spotOf({ q: 0, r: 0 })).toStrictEqual({ x: 0, y: 0 })
    expect(spotOf({ q: 1, r: 0 })).toStrictEqual({ x: LATTICE.along, y: 0 })
    // Odd rows are offset by half a pitch, which is what makes the lattice hexagonal.
    expect(spotOf({ q: 0, r: 1 })).toStrictEqual({ x: LATTICE.along / 2, y: LATTICE.across })
  })

  /** Two ships are two cells, and two cells are a pitch apart — no search, no check afterwards. */
  it.each([7, 14, 45, 92])('never puts two hulls on top of each other at %i', (count) => {
    const spots = cellsFor(count).map((cell) => spotOf(cell))

    for (const one of spots) {
      for (const other of spots) {
        if (one === other) {
          continue
        }
        const apart =
          Math.abs(one.x - other.x) >= LATTICE.along - 1e-9 ||
          Math.abs(one.y - other.y) >= LATTICE.across - 1e-9

        expect(apart).toBe(true)
      }
    }
  })
})

describe(basinOf, () => {
  it('holds every ship and keeps the middle cell clear', () => {
    const basin = basinOf(45)

    expect(basin.cells).toHaveLength(45)
    expect(basin.cells.some((cell) => cell.q === 0 && cell.r === 0)).toBe(false)
    expect(basin.width).toBeGreaterThan(0)
    expect(basin.height).toBeGreaterThan(0)
  })

  /**
   * The name is cut to the water between the two nearest hulls, not to the basin.
   *
   * A berth starts half a pitch before its cell's middle, so the open water across the centre is
   * two lattice steps less one berth. Cut to the basin instead, the name ran under the ships
   * either side of it — which is where it was, and why it could not be read.
   */
  it('gives the name the gap between the nearest two hulls', () => {
    const basin = basinOf(14)

    expect(basin.room).toBeGreaterThan(0)
    expect(basin.room).toBeLessThan(basin.width)
    expect(basin.label).toStrictEqual(basin.middle)
  })

  /** The middle is inside the box, because the liveliest ship of the project stands there. */
  it('knows where its middle is inside its own box', () => {
    const basin = basinOf(14)

    expect(basin.middle.x).toBeGreaterThan(0)
    expect(basin.middle.x).toBeLessThan(basin.width)
    expect(basin.middle.y).toBeGreaterThanOrEqual(0)
    expect(basin.middle.y).toBeLessThan(basin.height)
  })

  it('is nothing for nothing', () => {
    expect(basinOf(0).cells).toStrictEqual([])
  })
})

describe(nameFor, () => {
  const sized = (name: string, commits: number) =>
    ship({
      name,
      path: `/repos/${name}`,
      ledger: { total: { ...NO_WORK, commits, unscored: commits }, own: NO_WORK },
    })

  /**
   * Two namings were tried and both named the wrong thing: the alphabetically first member made
   * `H-E-L-F-A-Movement` — one repository — the name of a group of fourteen, and the organisation
   * holding most of it made three different basins called `IT4Change`.
   */
  it('names a family after the biggest repository in it', () => {
    expect(nameFor([sized('rebranding', 4), sized('ocelot-social', 9000)])).toBe('ocelot-social')
  })

  it('breaks a tie by path, so two snapshots agree', () => {
    expect(nameFor([sized('zeta', 7), sized('alpha', 7)])).toBe('alpha')
  })

  it('names nothing for nothing', () => {
    expect(nameFor([])).toBe(NO_ORG)
  })
})

describe(kindredsOf, () => {
  const kin = (name: string, org: string, roots: readonly string[] = [], rustDays = 10) =>
    ship({ name, org, path: `/repos/${org}/${name}`, roots, rustDays })

  /**
   * A measured family wins over the directory a repository happens to be filed under — that is the
   * whole reason `kin.ts` exists.
   */
  it('puts a family in its own basin', () => {
    const kindreds = kindredsOf([
      kin('ocelot', 'Ocelot', ['1111']),
      kin('wir', 'wir-social', ['1111']),
      kin('other', 'Ocelot'),
    ])

    // The family is named after the biggest repository in it; the leftover basin after its org.
    expect(kindreds.map((one) => [one.name, one.ships.length])).toStrictEqual([
      ['ocelot', 2],
      ['Ocelot', 1],
    ])
    expect(kindreds[0]?.orgs).toStrictEqual(['Ocelot', 'wir-social'])
  })

  /**
   * And a family of one is not a family: 65 of the 72 families on this fleet are a single
   * repository, and a harbour of 65 lone boats has thrown away what anybody could read off it.
   */
  it('leaves an untied ship with the others of its organisation', () => {
    const kindreds = kindredsOf([kin('a', 'org'), kin('b', 'org'), kin('c', 'other')])

    expect(kindreds.map((one) => [one.name, one.ships.length])).toStrictEqual([
      ['org', 2],
      ['other', 1],
    ])
  })

  /**
   * Freshest first, because that order **is** what the radius means: dealt outward, the ship
   * nearest the middle of a basin is the one somebody touched last.
   */
  it('orders a basin by how long each ship has lain', () => {
    const kindreds = kindredsOf([
      kin('old', 'o', [], 900),
      kin('fresh', 'o', [], 2),
      kin('middling', 'o', [], 200),
    ])

    expect(kindreds[0]?.ships.map((one) => one.name)).toStrictEqual(['fresh', 'middling', 'old'])
  })

  /** A repository with no commit at all has no age, and is certainly not the liveliest. */
  it('puts a ship that never sailed at the rim', () => {
    expect(laidUp(ship({ rustDays: null }))).toBe(Number.POSITIVE_INFINITY)
    expect(laidUp(ship({ rustDays: 4 }))).toBe(4)
  })

  /** Ties by path, so two snapshots of one fleet draw the same harbour. */
  it('breaks a tie the same way twice', () => {
    const kindreds = kindredsOf([
      ship({ name: 'b', org: 'o', path: '/b', rustDays: 5 }),
      ship({ name: 'a', org: 'o', path: '/a', rustDays: 5 }),
    ])

    expect(kindreds[0]?.ships.map((one) => one.path)).toStrictEqual(['/a', '/b'])
  })

  it('takes an empty fleet as no basins at all', () => {
    expect(kindredsOf([])).toStrictEqual([])
  })
})

describe(harbourOf, () => {
  const fleetOf = (sizes: Readonly<Record<string, number>>) =>
    Object.entries(sizes).flatMap(([org, count]) =>
      Array.from({ length: count }, (_, index) =>
        ship({ org, name: `${org}-${String(index)}`, path: `/repos/${org}/${String(index)}` }),
      ),
    )
  const harbour = harbourOf(fleetOf({ big: 14, mid: 5, one: 1, two: 2 }))

  /** Every ship gets a berth, once. A layout that loses one says the fleet is smaller. */
  it('moors every ship exactly once', () => {
    expect(harbour.moorings).toHaveLength(22)
    expect(new Set(harbour.moorings.map((one) => one.ship.path)).size).toBe(22)
  })

  /**
   * The one assertion this module shares with the other two: every ship can walk ashore, followed
   * through the tree rather than measured off the drawing.
   */
  it('joins every berth to the shore', () => {
    expect(reachesShore(harbour)).toBe(true)
  })

  /**
   * Clear water round every basin, which is what makes twenty-three projects countable.
   *
   * Asserted against the *footprint* and not merely against the spots: two berths a hair apart are
   * two hulls on top of each other. This went both ways before it settled — boxes edge to edge left
   * meaningless channels, nesting them closed the gaps and made one field of ships — and the moat
   * is the first arrangement here under which nothing overlaps at all.
   */
  it('leaves every berth standing clear of every other', () => {
    for (const one of harbour.moorings) {
      for (const other of harbour.moorings) {
        if (one === other) {
          continue
        }

        expect(overlaps(berthBox(one), berthBox(other))).toBe(false)
      }
    }
  })

  /** Two ships are two cells, and two cells are a lattice apart — nothing is searched. */
  it('puts no two ships in one place', () => {
    for (const one of harbour.moorings) {
      for (const other of harbour.moorings) {
        if (one === other) {
          continue
        }
        const apart =
          Math.abs(one.spot.x - other.spot.x) > 1e-9 || Math.abs(one.spot.y - other.spot.y) > 1e-9

        expect(apart).toBe(true)
      }
    }
  })

  /**
   * The part the hexagon was chosen for: nothing decides where a walkway goes. Two berths that are
   * neighbours on the lattice are joined, and that is the whole network — so a basin of fourteen
   * carries more ways than it has ships.
   */
  it('lays a way along every lattice edge it finds', () => {
    const inside = harbour.ways.filter((way) => way.kind === 'round')

    expect(inside.length).toBeGreaterThan(0)

    // And every way joins two quays that exist, which is what makes the graph a graph.
    const ids = new Set(harbour.quays.map((quay) => quay.id))
    for (const way of harbour.ways) {
      expect(ids.has(way.from)).toBe(true)
      expect(ids.has(way.to)).toBe(true)
    }
  })

  /** One basin per kindred, each carrying its name. */
  it('gives every kindred its own basin', () => {
    expect(harbour.blocks.map((one) => one.org).sort()).toStrictEqual(['big', 'mid', 'one', 'two'])

    for (const block of harbour.blocks) {
      expect(block.width).toBeGreaterThan(0)
      expect(block.height).toBeGreaterThan(0)
    }
  })

  /** The same fleet twice is the same harbour: a drawing that moved would say what it never measured. */
  it('draws the same harbour twice', () => {
    const again = harbourOf(fleetOf({ big: 14, mid: 5, one: 1, two: 2 }))

    expect(again.moorings.map((one) => one.spot)).toStrictEqual(
      harbour.moorings.map((one) => one.spot),
    )
  })

  it('takes an empty fleet as an empty harbour', () => {
    expect(harbourOf([]).moorings).toStrictEqual([])
  })
})

/** The slope of the lattice's diagonals: half a column across for one row down. */
const DIAGONAL = LATTICE.along / 2 / LATTICE.across

/** Whether a run between two points is one of the lattice's three directions. */
function onTheLattice(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return Math.abs(dy) < 1e-9 || Math.abs(Math.abs(dx / dy) - DIAGONAL) < 1e-9
}

describe(latticeWays, () => {
  /** Every edge is laid once: three directions walked from every cell, the other three are the same edges. */
  it('joins each pair of neighbours exactly once', () => {
    const cells = cellsFor(6)
    const pairs = latticeWays(cells).map((one) =>
      [`${String(one.from.q)}.${String(one.from.r)}`, `${String(one.to.q)}.${String(one.to.r)}`]
        .sort()
        .join('|'),
    )

    // Ring one is six cells round an empty middle: six edges round the ring, nothing across it.
    expect(pairs).toHaveLength(6)
    expect(new Set(pairs).size).toBe(6)
  })

  /** An outer ring that is only part full has neighbours missing, and a way to nowhere is not a way. */
  it('leaves out an edge to a cell nobody stands in', () => {
    expect(latticeWays(cellsFor(2))).toHaveLength(1)
    expect(latticeWays(cellsFor(1))).toStrictEqual([])
  })

  /**
   * The point of joining at the plank ends: every edge runs level or along the diagonal, so a berth
   * keeps the level plank her lines, her crane and her stack were built for.
   */
  it('runs every edge level or along the diagonal', () => {
    for (const edge of latticeWays(cellsFor(18))) {
      expect(onTheLattice(endOf(edge.from, edge.fromEnd), endOf(edge.to, edge.toEnd))).toBe(true)
    }
  })
})

describe(toShore, () => {
  const shore = { left: 0, top: 0, right: 100, bottom: 50 }

  it('reaches whichever side of the frame comes first', () => {
    expect(toShore({ x: 10, y: 25 }, { x: -1, y: 0 }, shore)).toBe(10)
    expect(toShore({ x: 10, y: 25 }, { x: 1, y: 0 }, shore)).toBe(90)
    // Down and east from near the bottom: the south shore comes before the east one.
    expect(toShore({ x: 10, y: 45 }, { x: 1, y: 1 }, shore)).toBe(5)
    expect(toShore({ x: 90, y: 5 }, { x: 1, y: -1 }, shore)).toBe(5)
  })
})

describe(landingsFrom, () => {
  const shore = { left: 0, top: 0, right: 1000, bottom: 1000 }
  const level = (): readonly { x: number; y: number }[] => [{ x: -1, y: 0 }]
  const down = (): readonly { x: number; y: number }[] => [{ x: 1, y: 1 }]

  it('walks straight to the shore when nothing is in the way', () => {
    const [landing] = landingsFrom([{ x: 40, y: 500 }], level, shore, [], [])

    expect(landing).toStrictEqual({
      from: { x: 40, y: 500 },
      to: { x: 0, y: 500 },
      channel: null,
      length: 40,
    })
  })

  /** A ray through a berth is a line drawn over a ship, not a way. */
  it('drops a ray that would cross something', () => {
    const berth = { x: 10, y: 490, width: 10, height: 20 }

    expect(landingsFrom([{ x: 40, y: 500 }], level, shore, [], [berth])).toStrictEqual([])
  })

  /**
   * The first channel crossed is where the spur ends. Allowed to fly on, a diagonal reached the
   * south shore across a whole row of basins, because that was shorter on paper.
   */
  it('ends at the first channel it crosses, and counts the run to the nearer shore', () => {
    const channels = [{ y: 600 }, { y: 400 }, { y: 520 }]
    const [landing] = landingsFrom([{ x: 100, y: 500 }], down, shore, channels, [])

    expect(landing?.channel).toStrictEqual({ y: 520 })
    expect(landing?.to).toStrictEqual({ x: 120, y: 520 })
    // The spur itself, and the channel's run west to the shore at x 0.
    expect(landing?.length).toBeCloseTo(Math.hypot(20, 20) + 120)
  })

  it('puts the shortest walk first', () => {
    const lengths = landingsFrom(
      [
        { x: 300, y: 500 },
        { x: 40, y: 500 },
      ],
      level,
      shore,
      [],
      [],
    ).map((one) => one.length)

    expect(lengths).toStrictEqual([40, 300])
  })
})

describe(bearingsOf, () => {
  /** Outward only, so no spur starts back across the plank it belongs to. */
  it('leaves a plank end away from its own plank', () => {
    expect(bearingsOf('west').every((one) => one.x < 0)).toBe(true)
    expect(bearingsOf('east').every((one) => one.x > 0)).toBe(true)
  })
})

describe('a basin harbour, walked', () => {
  const fleetOf = (sizes: Readonly<Record<string, number>>) =>
    Object.entries(sizes).flatMap(([org, count]) =>
      Array.from({ length: count }, (_, index) =>
        ship({ org, name: `${org}-${String(index)}`, path: `/repos/${org}/${String(index)}` }),
      ),
    )
  /** Enough kindreds for several rows, so some basins are inland and have to use a channel. */
  const sizes = Object.fromEntries(
    Array.from({ length: 14 }, (_, index) => [`org${String(index)}`, 1 + ((index * 5) % 9)]),
  )
  const harbour = harbourOf(fleetOf(sizes))
  const spots = new Map(harbour.quays.map((quay) => [quay.id, quay.spot]))
  const runs = harbour.ways.map((way) => ({
    way,
    from: spots.get(way.from) ?? { x: Number.NaN, y: Number.NaN },
    to: spots.get(way.to) ?? { x: Number.NaN, y: Number.NaN },
  }))
  /** Each berth as `scene.ts` hits it, with her plank's two ends, which are allowed to touch it. */
  const berths = harbour.moorings.map((mooring) => {
    const middle = { x: mooring.spot.x + BERTH.pitch / 2, y: mooring.spot.y - BERTH.laneCentre }
    return {
      box: berthAround(middle),
      ends: [
        { x: middle.x - BERTH.pitch / 2, y: middle.y },
        { x: middle.x + BERTH.pitch / 2, y: middle.y },
      ],
    }
  })
  const same = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
    Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9

  it('reaches the shore from every berth, on planks and not by boat', () => {
    expect(reachesShore(harbour)).toBe(true)
    expect(harbour.ways.filter((way) => way.kind === 'tender')).toStrictEqual([])
  })

  /** The honeycomb, and the spurs and channels too: nothing in the harbour leaves the lattice's three directions. */
  it('runs every way level or along the diagonal', () => {
    for (const run of runs) {
      expect(onTheLattice(run.from, run.to)).toBe(true)
    }
  })

  /**
   * The measurement `SLACK.along` was widened for: a way may end on a berth's plank and must not
   * pass through anybody's hull or caption on the way.
   */
  it('clears a berth with every lattice way', () => {
    const crossing = runs.flatMap((run) =>
      berths
        .filter((berth) => !berth.ends.some((end) => same(end, run.from) || same(end, run.to)))
        .filter((berth) => cuts(run.from, run.to, berth.box))
        .map((berth) => ({ run: [run.from, run.to], berth: berth.box })),
    )

    expect(crossing).toStrictEqual([])
  })

  /**
   * Her plank is a tree way and her lines are measured to it, so they are the length of the lane
   * and not the distance to some diagonal — which is what hung a hull far below her plank before.
   */
  it('hangs every ship off her own level plank', () => {
    for (const mooring of harbour.moorings) {
      expect(reachOf(harbour, mooring)).toBeCloseTo(BERTH.laneCentre)
    }
  })

  /** Inland basins drop into a channel, and every walk to land ends on the drawn shore. */
  it('lands on the shore the ground is drawn with', () => {
    const shore = shoreOf(harbour.width, harbour.height)
    const roots = harbour.quays.filter((quay) => quay.rank === 'root')

    expect(roots.length).toBeGreaterThan(1)

    for (const root of roots) {
      const onEdge =
        Math.abs(root.spot.x - shore.left) < 1e-9 ||
        Math.abs(root.spot.x - shore.right) < 1e-9 ||
        Math.abs(root.spot.y - shore.top) < 1e-9 ||
        Math.abs(root.spot.y - shore.bottom) < 1e-9

      expect(onEdge).toBe(true)
    }

    expect(harbour.quays.some((quay) => quay.rank === 'stub')).toBe(true)
  })
})
