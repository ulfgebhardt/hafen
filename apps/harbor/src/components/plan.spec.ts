import { describe, expect, it } from 'vitest'

import {
  ASPECT,
  BERTH,
  berthsFor,
  BLOCK,
  columnsFor,
  contentHeight,
  CONTENT_TOP,
  piersFor,
  planExtent,
  project,
  rowsFor,
  shapeAt,
  unproject,
  UNIT,
} from './plan'
import { BERTH_SLACK, SIZE } from './vessel'

describe(project, () => {
  it('is a scale and nothing else', () => {
    expect(project({ x: 3, y: 4 })).toStrictEqual({ x: 3 * UNIT, y: 4 * UNIT })
  })

  /**
   * Exact, unlike its isometric predecessor: without a third axis a point on screen is a point in
   * the world and not a line through it.
   */
  it('comes back to where it started', () => {
    expect(unproject(project({ x: 17.5, y: -3.25 }))).toStrictEqual({ x: 17.5, y: -3.25 })
  })
})

describe(columnsFor, () => {
  it('holds an empty harbour to one column', () => {
    expect(columnsFor(0)).toBe(1)
    expect(rowsFor(0)).toBe(1)
  })

  it('never asks for more columns than there are ships', () => {
    for (const count of [1, 2, 3, 5]) {
      expect(columnsFor(count)).toBeLessThanOrEqual(count)
    }
  })

  /**
   * The point of searching instead of estimating: whatever it returns, no other column count lands
   * closer to the shape that was asked for. The closed form could not promise this — the land, the
   * breakwater and the margins are a fixed height it could not see, so it drifted square as the
   * fleet grew.
   */
  it('picks the column count whose plan lands nearest the target', () => {
    for (const count of [1, 4, 7, 20, 41, 89, 150]) {
      const chosen = columnsFor(count)
      const off = (columns: number): number => {
        const shape = shapeAt(count, columns)
        return Math.abs(shape.width / shape.height - ASPECT)
      }

      for (let columns = 1; columns <= count; columns += 1) {
        expect(off(chosen)).toBeLessThanOrEqual(off(columns))
      }
    }
  })

  /**
   * Near, and not on it. The rows come in pairs — a block holds two — so the height moves in steps
   * of a whole block and some fleet sizes have no column count that lands closer. Measured over
   * one to a hundred and fifty, the worst case is a twelve-ship harbour at 1.35. Asserting tighter
   * would be asserting something the grid cannot do, and the test above already proves that
   * nothing available was passed over.
   */
  it('stays in sight of the target for a fleet worth laying out', () => {
    for (let count = 4; count <= 150; count += 1) {
      const extent = planExtent(count)
      const ratio = extent.width / extent.height

      expect(ratio).toBeGreaterThan(1.2)
      expect(ratio).toBeLessThan(2.3)
    }
  })
})

describe(berthsFor, () => {
  it('gives every ship a berth and fills row by row', () => {
    const berths = berthsFor(9)
    const columns = columnsFor(9)

    expect(berths).toHaveLength(9)
    expect(berths[0]?.spot.x).toBeLessThan(berths[1]?.spot.x ?? 0)
    expect(berths[columns]?.row).toBe(1)
    expect(berths[columns]?.spot.x).toBe(berths[0]?.spot.x)
  })

  /**
   * Both sides of every pier — the reason for the shape. Berths only on one side is the isometric
   * layout with a different projection, and it spends twice the water per ship.
   */
  it('moors the rows alternately either side of a pier', () => {
    const columns = columnsFor(30)
    const berths = berthsFor(30)

    expect(berths[0]?.side).toBe(1)
    expect(berths[columns]?.side).toBe(-1)
    expect(berths[columns * 2]?.side).toBe(1)
  })

  it('lays the two rows of a block against the pier between them', () => {
    const columns = columnsFor(30)
    const berths = berthsFor(30)
    const piers = piersFor(30)

    // Row 0 lies below the first pier, row 1 above the second: one pier serves two rows.
    expect(berths[0]?.spot.y).toBe((piers[0]?.from.y ?? 0) + BERTH.pier + BERTH.laneCentre)
    expect(berths[columns]?.spot.y).toBe((piers[1]?.from.y ?? 0) - BERTH.laneCentre)
  })

  it('keeps every berth inside the plan it reported', () => {
    const count = 41
    const extent = planExtent(count)

    for (const berth of berthsFor(count)) {
      expect(berth.spot.x * UNIT).toBeGreaterThanOrEqual(0)
      expect((berth.spot.x + SIZE.maxLength) * UNIT).toBeLessThanOrEqual(extent.width)
      expect(berth.spot.y * UNIT).toBeLessThan(extent.height)
    }
  })

  /**
   * The bug this file's predecessor shipped: berths 2.2 cells apart against hulls up to 3.2 long,
   * and a basin that read as a pile. The relation lives in two files, so it is asserted across
   * them — one of them alone cannot see it. The three cells of margin are the flag at the stem.
   */
  it('leaves room along the pier for the longest hull and her flag', () => {
    expect(BERTH.pitch).toBeGreaterThan(SIZE.maxLength + 3)
  })

  /**
   * The other half of the same relation, across the lane. A snug hull must lie clear of the
   * planking, and one standing right off must still be in her own lane — otherwise the hygiene
   * reading would push a ship into the caption beside her.
   */
  it('leaves room across the lane for a snug hull and a slack one', () => {
    expect(SIZE.maxBeam / 2).toBeLessThan(BERTH.laneCentre)
    expect(BERTH.laneCentre + BERTH_SLACK + SIZE.maxBeam / 2).toBeLessThanOrEqual(BERTH.lane)
  })

  it('spends its block on the bands it named', () => {
    expect(BLOCK).toBe(
      BERTH.pier + BERTH.lane + BERTH.caption + BERTH.fairway + BERTH.caption + BERTH.lane,
    )
  })
})

describe(piersFor, () => {
  /**
   * One per pair of rows plus one for the first row to lie against — and never one more. A pier
   * with no ship on either side was a third of the basin at seventeen ships.
   */
  it('gives every row a pier to lie against, and no spare', () => {
    for (const count of [1, 9, 17, 30, 89]) {
      const rows = rowsFor(count)
      const piers = piersFor(count)

      expect(piers).toHaveLength(Math.floor(rows / 2) + 1)

      // Every berth's own pier exists: the one above her, or the one below.
      for (const berth of berthsFor(count)) {
        const mine = Math.floor(berth.row / 2) + (berth.side === 1 ? 0 : 1)

        expect(piers[mine]).toBeDefined()
      }
    }
  })

  /** Nothing drawn below the last thing there is: the breakwater closes on the last caption. */
  it('ends the basin at the last row and not at the end of its block', () => {
    const short = planExtent(17)
    const full = planExtent(21)

    expect(short.height).toBeLessThan(full.height)
    expect(contentHeight(3)).toBeLessThan(contentHeight(4))
    expect(contentHeight(4)).toBe(2 * BLOCK + BERTH.pier)
  })

  it('runs every pier the full width of the plan', () => {
    const extent = planExtent(30)

    for (const pier of piersFor(30)) {
      expect(pier.length * UNIT).toBe(extent.width)
      expect(pier.depth).toBe(BERTH.pier)
    }
  })

  it('starts the first pier at the waterfront', () => {
    expect(piersFor(3)[0]?.from.y).toBe(CONTENT_TOP)
  })

  /** The breakwater and the margin below it: nothing is drawn flush against an edge. */
  it('leaves water below the last pier', () => {
    const count = 30
    const piers = piersFor(count)
    const last = piers.at(-1)

    expect(((last?.from.y ?? 0) + BERTH.pier) * UNIT).toBeLessThan(planExtent(count).height)
  })
})

describe('the shape the window has', () => {
  /**
   * A constant 16:9 is only right on a window that happens to be 16:9. On a taller one the harbour
   * came out flat and small in the height, with room above and below it that nothing used — which
   * is what "die Szene ist zu klein in der Höhe" was.
   */
  it('lays a tall window out in more rows than a wide one', () => {
    const wide = columnsFor(40, 21 / 9)
    const tall = columnsFor(40, 4 / 5)

    expect(tall).toBeLessThan(wide)
    expect(rowsFor(40, 4 / 5)).toBeGreaterThan(rowsFor(40, 21 / 9))
  })

  it('shapes the whole plan to what it was asked for, not to the constant', () => {
    const portrait = planExtent(40, 3 / 4)

    expect(portrait.width / portrait.height).toBeLessThan(1)
  })

  /** A window with no height yet — a first frame, a hidden panel — must not divide by it. */
  it('falls back to the standing shape for a nonsense one', () => {
    expect(columnsFor(40, 0)).toBe(columnsFor(40))
    expect(columnsFor(40, Number.NaN)).toBe(columnsFor(40))
    expect(columnsFor(40, Number.POSITIVE_INFINITY)).toBe(columnsFor(40))
  })

  /** Every reader of the grid has to agree about the shape, or the piers miss the berths. */
  it('keeps berths, piers and extent in step for one shape', () => {
    const aspect = 3 / 4
    const berths = berthsFor(40, aspect)
    const piers = piersFor(40, aspect)

    expect(piers).toHaveLength(Math.floor(rowsFor(40, aspect) / 2) + 1)
    for (const berth of berths) {
      expect(piers[Math.floor(berth.row / 2) + (berth.side === 1 ? 0 : 1)]).toBeDefined()
      expect(berth.spot.y * UNIT).toBeLessThan(planExtent(40, aspect).height)
    }
  })
})
