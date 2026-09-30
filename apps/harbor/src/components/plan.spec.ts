import { describe, expect, it } from 'vitest'

import { BERTH, BLOCK, contentHeight, project, rowsAt, unproject, UNIT } from './plan'
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

describe('what a berth holds', () => {
  /**
   * A berth must clear the longest hull *and* the stack of what she still owes, which now stands
   * on the apron ahead of her bow. It held only the hull while the cargo lay on the planking.
   */
  it('is long enough for the biggest ship and her load', () => {
    expect(BERTH.pitch).toBeGreaterThan(SIZE.maxLength)
  })

  /**
   * One plank, everywhere. It was 14 units deep because it carried the cargo, which gave the
   * harbour two kinds of walkway — a broad loaded one and a thin connecting one.
   */
  it('has planking to walk on and not to stack on', () => {
    expect(BERTH.pier).toBeLessThan(BERTH.lane)
  })

  /** The widest hull still leaves water between her and the planking when she lies snug. */
  it('leaves a snug hull clear of the plank', () => {
    expect(BERTH.laneCentre).toBeGreaterThan(SIZE.maxBeam / 2)
    // And room to lie off it, which is what the hygiene reading spends.
    expect(BERTH.lane - BERTH.laneCentre).toBeGreaterThan(BERTH_SLACK)
  })
})

describe(rowsAt, () => {
  it('needs one row per column-full, and never none', () => {
    expect(rowsAt(0, 4)).toBe(1)
    expect(rowsAt(4, 4)).toBe(1)
    expect(rowsAt(5, 4)).toBe(2)
    expect(rowsAt(12, 4)).toBe(3)
  })
})

describe(contentHeight, () => {
  /**
   * Counted to the last thing drawn and not in whole blocks. A block is two rows, so an odd row
   * count fills half of one — rounding up put a whole empty pier under the last ship.
   */
  it('stops at the last thing actually drawn', () => {
    expect(contentHeight(2)).toBe(BLOCK + BERTH.pier)
    expect(contentHeight(1)).toBe(BERTH.pier + BERTH.lane + BERTH.caption)
    expect(contentHeight(4)).toBe(2 * BLOCK + BERTH.pier)
  })

  it('grows with every row and never shrinks', () => {
    for (let rows = 1; rows < 12; rows += 1) {
      expect(contentHeight(rows + 1)).toBeGreaterThan(contentHeight(rows))
    }
  })
})
