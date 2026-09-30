/**
 * A ship seen from above: the shapes, in plan coordinates, before anything is drawn.
 *
 * Separate from the renderer because the shape of a thing is arithmetic, and arithmetic is what a
 * test can hold. `scene.ts` strokes what this returns and decides nothing.
 *
 * The view change moved what carries each reading, and the three stay deliberately apart — they
 * are fixed by different work, which is the whole argument in `condition.ts`:
 *
 * - the **contract** is deck cargo, a grid of boxes, because that is what a container terminal
 *   looks like from the air and a grid is countable at a glance;
 * - **hygiene** is how the ship *lies*: snug against the quay when the tree is clean, standing off
 *   on slack lines and a little askew when it is not. From above that is the loudest thing in the
 *   picture, which is where the fastest fix belongs;
 * - **freshness** is rust along the plating, and it is meant to be quiet — nobody should be pushed
 *   into working by a drawing.
 *
 * Height is gone, and nothing was lost with it: freeboard was the isometric stand-in for hygiene,
 * and lying off the quay says the same thing where it can actually be seen.
 */

import { bindingQuests } from '@hafen/core'

import { conditionOf, hygieneOf } from './condition'
import { drift, orderedQuests } from './fleet'
import { BERTH } from './plan'

import type { Spot } from './plan'
import type { QuestResult, Ship } from '@hafen/core'

/**
 * How big a ship is drawn, in plan units.
 *
 * Length follows the project score, and it is the one place in this drawing where being *busy*
 * buys space. Bounded hard at both ends: a repository with eighteen thousand points must not need
 * its own row, and one with four commits still has to look like a ship. The beam follows the
 * length so the proportion stays a ship's rather than a plank's.
 */
export const SIZE = {
  minLength: 20,
  maxLength: 34,
  minBeam: 5.6,
  maxBeam: 7.2,
} as const

/** Where a project score stops buying length. A busy shared repository, measured. */
export const LENGTH_CEILING = 6000

export interface Hull {
  /** Stem to transom. */
  length: number
  /** Widest point. */
  beam: number
  /** The outline from above, counter-clockwise, stern at `x = 0` and stem at `x = length`. */
  outline: readonly Spot[]
}

/**
 * The outline of a hull from above.
 *
 * Eleven points and no curve command: a polygon is what a test can compare, and at these sizes the
 * difference between a drawn spline and eleven points is under a pixel. The proportions are a
 * cargo ship's — a long parallel body, a taper starting at three fifths, a point at the stem and a
 * flat transom. That silhouette is the whole reason for the change of view; nobody mistakes it for
 * a building.
 */
export function outlineOf(length: number, beam: number): readonly Spot[] {
  const half = beam / 2
  return [
    { x: 0, y: -half * 0.86 },
    { x: length * 0.06, y: -half },
    { x: length * 0.6, y: -half },
    { x: length * 0.82, y: -half * 0.86 },
    { x: length * 0.94, y: -half * 0.42 },
    { x: length, y: 0 },
    { x: length * 0.94, y: half * 0.42 },
    { x: length * 0.82, y: half * 0.86 },
    { x: length * 0.6, y: half },
    { x: length * 0.06, y: half },
    { x: 0, y: half * 0.86 },
  ]
}

export function hullOf(ship: Ship, points: number): Hull {
  const reach = Math.sqrt(Math.min(Math.max(points, 0), LENGTH_CEILING) / LENGTH_CEILING)
  const length = SIZE.minLength + (SIZE.maxLength - SIZE.minLength) * reach
  const beam = SIZE.minBeam + (SIZE.maxBeam - SIZE.minBeam) * reach
  return { length, beam, outline: outlineOf(length, beam) }
}

/**
 * How far off the quay an untidy ship lies.
 *
 * The gamification lever, and it is deliberately the largest movement in the plan: a stash and a
 * dirty tree push a hull most of a lane away from the concrete, and a commit brings it back. What
 * somebody can fix in two minutes has to be what moves the picture.
 */
export const BERTH_SLACK = 2.4

export function offsetOf(ship: Ship): number {
  return BERTH_SLACK * (1 - hygieneOf(ship))
}

/**
 * How far out of line she lies, in radians.
 *
 * Small on purpose — past about three degrees it stops reading as a badly moored ship and starts
 * reading as a broken renderer. The side is a function of the path and never random, for the same
 * reason `drift` is: a hull that swung the other way between two readings of the same harbour
 * would make the picture untrustworthy.
 */
export const MAX_YAW = 0.05

export function yawOf(ship: Ship): number {
  const slack = 1 - hygieneOf(ship)
  // Guarded rather than multiplied through: a tidy ship on the port side would otherwise come back
  // as `-0`, which is a straight ship that no longer compares equal to one.
  return slack === 0 ? 0 : MAX_YAW * slack * (drift(ship.path) < 0.5 ? -1 : 1)
}

export interface Line {
  from: Spot
  to: Spot
}

/**
 * Head and stern lines, in the hull's own coordinates.
 *
 * They lead *away* from the ship the way real ones do, so a hull standing off the quay shows it in
 * the length of its lines and not only in the gap. `offset` is passed in rather than read again
 * here: the scene has already placed the body with it, and two readings of one number are two
 * chances to disagree about where the quay is.
 */
export function mooringOf(hull: Hull, offset: number): readonly Line[] {
  const quay = -BERTH.laneCentre - offset
  const half = hull.beam / 2
  return [
    { from: { x: hull.length * 0.08, y: -half * 0.95 }, to: { x: -2, y: quay } },
    { from: { x: hull.length * 0.86, y: -half * 0.78 }, to: { x: hull.length + 2, y: quay } },
  ]
}

/** How many containers stand abreast in one bay. */
export const BAYS_ACROSS = 3

/**
 * One container, in plan units.
 *
 * `across` is fixed and `along` is not: the bays are squeezed to fit the deck they have, so a
 * short hull with nine demands keeps all nine aboard instead of stowing three over the side.
 */
export const CONTAINER = {
  across: 1.3,
  /** Between two boxes abreast. */
  gap: 0.3,
  /** The full length of a bay before it has to be squeezed. */
  maxAlong: 4.4,
  /** Between two bays. */
  gapAlong: 0.5,
} as const

/** Where cargo may stand, as fractions of the length: clear of the house aft and the taper forward. */
export const DECK = { from: 0.26, to: 0.82 } as const

export interface Container {
  quest: QuestResult
  /** The centre of the box. */
  spot: Spot
  along: number
  across: number
}

/**
 * What is **met**, as deck cargo.
 *
 * Aboard means done. Everything still owed stands on the pier instead (`landedOf`), and that
 * split is the whole picture in one sentence: the ship carries what has been achieved, the
 * planking beside her carries what there is to do. It is the same division the task list makes in
 * words, and a drawing that said it differently would be a second opinion about one repository.
 *
 * A bare deck therefore means "nothing met" and not "nothing demanded" — the two are told apart by
 * the pier, which is empty for the first and loaded for the second. The renderer draws hatch lines
 * on an empty deck either way, because an empty hold is an empty hold.
 */
export function cargoOf(ship: Ship, hull: Hull): readonly Container[] {
  const quests = orderedQuests(bindingQuests(ship.quests)).filter(
    (quest) => quest.verdict === 'met',
  )
  if (quests.length === 0) {
    return []
  }

  const from = hull.length * DECK.from
  const usable = hull.length * (DECK.to - DECK.from)
  const bays = Math.ceil(quests.length / BAYS_ACROSS)
  const pitch = Math.min(CONTAINER.maxAlong + CONTAINER.gapAlong, usable / bays)
  const along = Math.max(0.6, pitch - CONTAINER.gapAlong)

  const spread = BAYS_ACROSS * CONTAINER.across + (BAYS_ACROSS - 1) * CONTAINER.gap
  const first = -spread / 2 + CONTAINER.across / 2

  return quests.map((quest, index) => ({
    quest,
    along,
    across: CONTAINER.across,
    spot: {
      x: from + Math.floor(index / BAYS_ACROSS) * pitch + along / 2,
      y: first + (index % BAYS_ACROSS) * (CONTAINER.across + CONTAINER.gap),
    },
  }))
}

/**
 * A box waiting on the planking, in the same units as everything else on the pier.
 *
 * Deliberately smaller than a deck container: what is waiting ashore is not yet stowed, and two
 * boxes of the same size on either side of the ship's rail would read as one cargo that happens to
 * be split.
 */
export const LANDED = {
  along: 2.4,
  across: 1.2,
  /** Between two boxes along the pier. */
  gap: 0.5,
  /** Between two rows across it. */
  pitch: 1.9,
  /** Clear of the outer edge of this ship's half, so a box never sits on the planking's line. */
  first: 1.1,
} as const

/**
 * How many boxes stand in one row along the pier before the next row starts.
 *
 * As many as the pitch holds, worked out rather than picked: a berth is `BERTH.pitch` wide, a box
 * and its gap are `along + gap`, and the row starts an inset in. Picked, this was eight, and the
 * rows it cost were rows there was no room for — half a pier holds three.
 */
export const LANDED_PER_ROW = Math.floor(
  (BERTH.pitch - 2 * LANDED.first) / (LANDED.along + LANDED.gap),
)

/** How much of the pier belongs to the ship on one side of it. */
export const PIER_SHARE = BERTH.pier / 2

/**
 * Where row `index` sits across the pier, in the hull's own coordinates.
 *
 * Measured from the middle of the planking outwards, because the other half is the other ship's
 * and the two must not meet. The rows therefore start beside her and run away from her, which is
 * also the order a person reads them in: what is nearest the ship is what is most nearly aboard.
 */
export function pierRowY(index: number): number {
  return -(BERTH.laneCentre + PIER_SHARE) + LANDED.first + index * LANDED.pitch
}

/** How many rows of boxes this ship's half of the planking holds. */
export const PIER_ROWS =
  Math.floor((PIER_SHARE - LANDED.first - LANDED.across / 2) / LANDED.pitch) + 1

/**
 * The row the repository's own untidiness stands in: the last one, always.
 *
 * Reserved rather than appended after whatever the demands used, because the two are laid out by
 * different code and an appended row is a row that lands on top of a full one. The outermost row
 * is also the right one for it: the nearer the ship, the nearer to being aboard, and a stash is
 * the furthest thing from that.
 */
export const MARK_ROW = PIER_ROWS - 1

/** How many rows `count` boxes fill. */
export function pierRows(count: number): number {
  return Math.ceil(Math.max(count, 0) / LANDED_PER_ROW)
}

/** How many demands fit on the planking before the drawing would have to lie about the rest. */
export const LANDED_CAP = LANDED_PER_ROW * MARK_ROW

export interface Landed {
  quest: QuestResult
  spot: Spot
  along: number
  across: number
}

/**
 * What is still **owed**, standing on the pier.
 *
 * Everything binding that is not met — violated, waiting, and not measurable alike. Not measurable
 * is included on purpose and is not a softer case: a demand nothing could answer is still a demand
 * this repository has not satisfied, and leaving it off the pier would quietly turn the blind spot
 * into a pass. What it is *not* is a violation, and the colour and the sheet keep saying so.
 *
 * Worst first, along the pier from the stern — the same reading order as everything else here.
 */
export function landedOf(ship: Ship): readonly Landed[] {
  const quests = orderedQuests(bindingQuests(ship.quests))
    .filter((quest) => quest.verdict !== 'met')
    .slice(0, LANDED_CAP)

  return quests.map((quest, index) => ({
    quest,
    along: LANDED.along,
    across: LANDED.across,
    spot: {
      x: 1.2 + (index % LANDED_PER_ROW) * (LANDED.along + LANDED.gap) + LANDED.along / 2,
      y: pierRowY(Math.floor(index / LANDED_PER_ROW)),
    },
  }))
}

export interface Bridge {
  /** The centre of the block. */
  spot: Spot
  along: number
  across: number
}

/**
 * The accommodation block, aft.
 *
 * It grows with the number of binding demands, which is the same measurement the isometric storeys
 * used and kept for the same reason: a ship held to fifteen demands is a bigger vessel, and the
 * silhouette should say so before any label is read. From above that is area rather than height.
 */
export function bridgeOf(ship: Ship, hull: Hull): Bridge {
  const binding = bindingQuests(ship.quests).length
  const along = 2 + Math.min(binding, 12) * 0.16
  return {
    along,
    across: hull.beam * 0.72,
    spot: { x: hull.length * 0.06 + along / 2, y: 0 },
  }
}

/**
 * Whether this ship gets smoke at the funnel.
 *
 * Earned and not decorative — every binding demand met *and* a clean tree. It is one of the few
 * things in the basin that moves on its own, so it is what the eye finds first.
 */
export function hasPlume(ship: Ship): boolean {
  const condition = conditionOf(ship)
  return condition.contract === 1 && condition.hygiene === 1
}
