import { describe, expect, it } from 'vitest'

import {
  basinOf,
  cellsFor,
  eyeFor,
  harbourOf,
  kindredsOf,
  LATTICE,
  ringCells,
  ringOf,
  spotOf,
  STEPS,
} from './basins'
import { fleetlets } from './flags'
import { reachesShore } from './moorings'
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

  /** Outward, so the eye stays clear and the newest work is the outermost ring. */
  it('fills inner rings before outer ones', () => {
    const rings = cellsFor(20).map((cell) => ringOf(cell))

    expect(Math.min(...rings)).toBe(eyeFor(20))
    expect(rings).toStrictEqual([...rings].sort((a, b) => a - b))
  })

  /**
   * The eye grows with the basin, or the shape stops being a ring at the size where a ring is
   * worth drawing: four rings round one empty cell is a disc with a dent in it.
   */
  it('keeps the eye in proportion', () => {
    expect(eyeFor(45)).toBeGreaterThan(eyeFor(9))
    expect(eyeFor(9)).toBeGreaterThan(eyeFor(3))
    expect(Math.min(...cellsFor(45).map((cell) => ringOf(cell)))).toBe(eyeFor(45))
  })

  /**
   * A ring of one or two is not a ring. They stand in the middle and their name goes above them,
   * because an eye kept clear for two ships is a hole with nothing round it.
   */
  it('gives the smallest kindreds no eye at all', () => {
    expect(eyeFor(1)).toBe(0)
    expect(eyeFor(2)).toBe(0)
    expect(cellsFor(1)).toStrictEqual([{ q: 0, r: 0 }])
    expect(cellsFor(2)).toHaveLength(2)
    expect(cellsFor(2)[0]).toStrictEqual({ q: 0, r: 0 })
  })

  /**
   * A part-filled outer ring is left part-filled rather than spread over two: a ring that is
   * obviously the newest is a reading, and thinning one out to look tidy would be the drawing
   * arranging the measurement.
   */
  it('leaves the outermost ring part filled', () => {
    const rings = cellsFor(8).map((cell) => ringOf(cell))
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
  it('holds every ship and keeps its middle clear', () => {
    const basin = basinOf(45)

    expect(basin.cells).toHaveLength(45)
    expect(basin.cells.every((cell) => ringOf(cell) > 0)).toBe(true)
    expect(basin.width).toBeGreaterThan(0)
    expect(basin.height).toBeGreaterThan(0)
  })

  /** The middle is inside the box, because that is where the name is drawn. */
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

describe(kindredsOf, () => {
  /** An organisation's ships stay together, so the owners are readable as runs round the ring. */
  it('gathers the organisations of one project into one kindred', () => {
    const kindreds = kindredsOf([
      { org: 'Wattenmeer', kindred: 'Lotsenverein', ships: [ship({ name: 'a' })] },
      { org: 'windstaerke', kindred: 'Lotsenverein', ships: [ship({ name: 'b' })] },
      { org: 'ulfgebhardt', kindred: 'ulfgebhardt', ships: [ship({ name: 'c' })] },
    ])

    expect(kindreds).toHaveLength(2)
    expect(kindreds[0]?.orgs).toStrictEqual(['Wattenmeer', 'windstaerke'])
    expect(kindreds[0]?.ships.map((one) => one.name)).toStrictEqual(['a', 'b'])
  })
})

describe(harbourOf, () => {
  const fleetOf = (sizes: Readonly<Record<string, number>>) =>
    Object.entries(sizes).flatMap(([org, count]) =>
      Array.from({ length: count }, (_, index) =>
        ship({ org, name: `${org}-${String(index)}`, path: `/repos/${org}/${String(index)}` }),
      ),
    )
  const harbour = harbourOf(fleetlets(fleetOf({ big: 14, mid: 5, one: 1, two: 2 })))

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
    const again = harbourOf(fleetlets(fleetOf({ big: 14, mid: 5, one: 1, two: 2 })))

    expect(again.moorings.map((one) => one.spot)).toStrictEqual(
      harbour.moorings.map((one) => one.spot),
    )
  })

  it('takes an empty fleet as an empty harbour', () => {
    expect(harbourOf([]).moorings).toStrictEqual([])
  })
})
