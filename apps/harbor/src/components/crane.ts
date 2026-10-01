/**
 * Where a crane's boom is pointing, as a function of time.
 *
 * Its own module because `scene.ts` must not own a rule, and because this one has a property worth
 * *asserting* rather than looking at: the tip moves continuously, including across the seam where
 * one cycle becomes the next. That is exactly what was wrong — see `LEGS`.
 */

import type { Spot } from './plan'

/**
 * The four legs of a cycle, as shares of it, and they must add to one.
 *
 * They did not. The swing home ran from 0.54 for a length of 0.38, which ends at 0.92 — and the
 * last 8 % of every cycle fell through to the same branch and carried on *past* the stack, by a
 * fifth of the sweep, before the next cycle snapped it back. That snap is the jump: a crane that
 * reaches too far and then teleports home.
 *
 * Written as four shares that are summed and checked, so the next change to them cannot leave a
 * gap or an overlap without a test saying so.
 */
export const LEGS = {
  /** Standing at the stack, hooking on or letting go. */
  atStack: 0.07,
  /** Slewing out to the ship. */
  outward: 0.43,
  /** Standing at the ship. */
  atShip: 0.07,
  /** And slewing home. */
  homeward: 0.43,
} as const

const OUT_FROM = LEGS.atStack
const SHIP_FROM = OUT_FROM + LEGS.outward
const HOME_FROM = SHIP_FROM + LEGS.atShip

/** Where in its cycle a crane is, as a share of one, for a clock and its own pace. */
export function craneCycle(now: number, period: number, phase: number): number {
  return (((now / period + phase) % 1) + 1) % 1
}

/**
 * Which leg carries the box this time round.
 *
 * The two ends used to swap every other period instead, so at the turn of a cycle the boom stood
 * at the stack and the next frame declared the stack to be where the ship is. It runs stack →
 * ship → stack for ever now, and only *which leg is loaded* alternates — out with a box one round,
 * back with one the next, which is what a quay crane does.
 */
export function carriesOut(now: number, period: number, phase: number): boolean {
  return Math.floor(now / period + phase) % 2 === 0
}

/**
 * The tip, interpolated in **polar** terms — angle and length separately.
 *
 * A straight line between the two ends slides a point across the drawing; a boom pivots. The
 * length differs along the way because the stack and the forecastle are not the same distance
 * from the post, so the boom telescopes as it slews, which is also what a real one does.
 */
function swing(foot: Spot, one: Spot, other: Spot, at: number): Spot {
  const a = Math.atan2(one.y - foot.y, one.x - foot.x)
  const b = Math.atan2(other.y - foot.y, other.x - foot.x)
  // The short way round, so the boom never sweeps backwards through the ship.
  const turn = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  const angle = a + turn * at
  const reach =
    Math.hypot(one.x - foot.x, one.y - foot.y) * (1 - at) +
    Math.hypot(other.x - foot.x, other.y - foot.y) * at
  return { x: foot.x + Math.cos(angle) * reach, y: foot.y + Math.sin(angle) * reach }
}

/** Where the boom points at this point in its cycle. */
export function boomTip(foot: Spot, stack: Spot, ship: Spot, cycle: number): Spot {
  if (cycle < OUT_FROM) {
    return stack
  }
  if (cycle < SHIP_FROM) {
    return swing(foot, stack, ship, (cycle - OUT_FROM) / LEGS.outward)
  }
  if (cycle < HOME_FROM) {
    return ship
  }
  return swing(foot, ship, stack, (cycle - HOME_FROM) / LEGS.homeward)
}

/** Whether something is hanging from the hook right now. */
export function boomLoaded(cycle: number, out: boolean): boolean {
  const outward = cycle >= OUT_FROM && cycle < SHIP_FROM
  const homeward = cycle >= HOME_FROM
  return out ? outward : homeward
}
