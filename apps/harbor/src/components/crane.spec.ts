import { describe, expect, it } from 'vitest'

import { boomLoaded, boomTip, carriesOut, craneCycle, LEGS } from './crane'

const foot = { x: 0, y: 0 }
const stack = { x: 10, y: 0 }
const ship = { x: 0, y: 8 }

describe('the legs of a crane cycle', () => {
  /**
   * The whole cycle and no more. They summed to 0.92, and the missing 8 % is the bug this module
   * exists for: the last leg carried on past the stack and the next cycle snapped it back.
   */
  it('divides a cycle without a gap or an overlap', () => {
    expect(LEGS.atStack + LEGS.outward + LEGS.atShip + LEGS.homeward).toBeCloseTo(1)
  })
})

describe(boomTip, () => {
  /** The two ends are where it stands still, and it reaches neither further nor short of them. */
  it('stands at the stack at the turn and at the ship halfway', () => {
    expect(boomTip(foot, stack, ship, 0)).toStrictEqual(stack)
    expect(boomTip(foot, stack, ship, LEGS.atStack + LEGS.outward)).toStrictEqual(ship)
  })

  /**
   * The property worth asserting rather than looking at: no step between one frame and the next,
   * anywhere — **including across the seam** where the cycle wraps, which is where it jumped.
   */
  it('never jumps, not even where one cycle becomes the next', () => {
    const step = 1 / 600
    let worst = 0
    for (let cycle = 0; cycle < 1; cycle += step) {
      const here = boomTip(foot, stack, ship, cycle)
      const next = boomTip(foot, stack, ship, (cycle + step) % 1)
      worst = Math.max(worst, Math.hypot(next.x - here.x, next.y - here.y))
    }

    // A sixtieth of the sweep in a six-hundredth of the cycle is generous and still catches a
    // snap: the old code's wrap moved the tip by nearly four units in one frame.
    expect(worst).toBeLessThan(0.5)
  })

  /** And it never reaches beyond either end — the overshoot that made the snap necessary. */
  it('stays within reach of the two places it works between', () => {
    const far = Math.max(Math.hypot(stack.x, stack.y), Math.hypot(ship.x, ship.y))
    for (let cycle = 0; cycle < 1; cycle += 1 / 200) {
      const tip = boomTip(foot, stack, ship, cycle)

      expect(Math.hypot(tip.x, tip.y)).toBeLessThanOrEqual(far + 1e-9)
    }
  })
})

describe(boomLoaded, () => {
  /** A box is picked up at one end and set down at the other, and hangs for exactly one leg. */
  it('carries on the leg this round is carrying on', () => {
    expect(boomLoaded(0, true)).toBe(false)
    expect(boomLoaded(LEGS.atStack + 0.1, true)).toBe(true)
    expect(boomLoaded(LEGS.atStack + 0.1, false)).toBe(false)
    expect(boomLoaded(0.99, false)).toBe(true)
  })
})

describe(craneCycle, () => {
  it('is a share of one, whatever the clock says', () => {
    expect(craneCycle(0, 6, 0)).toBeCloseTo(0)
    expect(craneCycle(3, 6, 0)).toBeCloseTo(0.5)
    expect(craneCycle(-3, 6, 0)).toBeCloseTo(0.5)
  })

  /** The load alternates with the cycle, so a box appears and vanishes where the boom is still. */
  it('swaps the loaded leg once per cycle', () => {
    expect(carriesOut(0, 6, 0)).toBe(true)
    expect(carriesOut(6, 6, 0)).toBe(false)
    expect(carriesOut(12, 6, 0)).toBe(true)
  })
})
