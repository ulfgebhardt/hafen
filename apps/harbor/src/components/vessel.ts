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
import { drawn, isCapped, marksOf } from './marks'
import { BERTH } from './plan'

import type { MarkKind } from './marks'
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
 *
 * `reach` is the same thing for the planking itself — how far the drawn walkway really is, which
 * `reachOf` measures off the graph. It used to be `BERTH.laneCentre` outright, and in the lane
 * harbour the walkway is half a pier further out than that, so every line stopped short in open
 * water. A rope that ends beside the quay is a rope tied to nothing.
 */
export function mooringOf(
  hull: Hull,
  offset: number,
  reach: number = BERTH.laneCentre,
): readonly Line[] {
  const quay = -reach - offset
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
  /**
   * Between two rows across it.
   *
   * Widened from 1.9 when the apron became something to walk on: a box is 1.2 across, so 1.9 left
   * an aisle of 0.7 and a figure is 0.84 wide — somebody walking between the rows would have been
   * walking through them. At 2.2 the aisle is a unit, and `PIER_ROWS` still comes out at three,
   * so nothing the stack can hold was given up for it.
   */
  pitch: 2.2,
  /** Clear of the outer edge of this ship's half, so a box never sits on the planking's line. */
  first: 1.1,
} as const

/**
 * The apron: the water-level space in the berth **ahead of the bow**, where her load waits.
 *
 * It used to lie on the planking, spread along a 14-unit-deep pier. That gave the harbour two
 * kinds of walkway — a broad loaded one under the ships and a thin one between the docks — and one
 * kind was asked for. Ahead of the bow is also where it belongs to be read: coming down the jetty
 * you pass what she still owes before you reach her.
 *
 * Stacked rather than strung out. A row of eleven crates says "a lot" and nothing else; a block
 * three deep is countable at a glance, which is the only thing a crate does better than a number.
 */
export const APRON = {
  /** Clear of the stem, so the stack never touches her. */
  ahead: 2.6,
  /** And clear of the next berth's stern. */
  behind: 2.2,
} as const

/**
 * How many boxes stand across the stack before the next row starts.
 *
 * Worked out from the *longest* hull rather than from each one, so the answer is a constant: a
 * berth is `BERTH.pitch`, the biggest ship takes `SIZE.maxLength` of it, and what is left minus
 * the two clearances is the apron every ship gets. A per-ship count would make a small repository
 * stack its crates differently from a large one for a reason that is about the large one.
 */
export const LANDED_PER_ROW = Math.max(
  1,
  Math.floor(
    (BERTH.pitch - SIZE.maxLength - APRON.ahead - APRON.behind + LANDED.gap) /
      (LANDED.along + LANDED.gap),
  ),
)

/**
 * How deep the stack may grow, across the berth.
 *
 * Bounded by the ship's own beam rather than by the lane: a stack wider than the vessel it is
 * waiting for reads as two ships' cargo run together, which is exactly the confusion the old
 * half-a-pier-each rule existed to prevent.
 */
export const PIER_ROWS = Math.max(2, Math.floor(SIZE.maxBeam / LANDED.pitch))

/**
 * Where row `index` sits across the apron, in the hull's own coordinates.
 *
 * Centred on her centreline and growing towards the planking, so the nearest row is the one a
 * person walking the jetty meets first — the same reading order as everything else here.
 */
export function pierRowY(index: number): number {
  return -((PIER_ROWS - 1) * LANDED.pitch) / 2 + index * LANDED.pitch
}

/**
 * The row the repository's own untidiness stands in: the last one, always.
 *
 * Reserved rather than appended after whatever the demands used, because the two are laid out by
 * different code and an appended row is a row that lands on top of a full one.
 */
export const MARK_ROW = PIER_ROWS - 1

/** How many rows `count` boxes fill. */
export function pierRows(count: number): number {
  return Math.ceil(Math.max(count, 0) / LANDED_PER_ROW)
}

/** How many demands fit on the apron before the drawing would have to lie about the rest. */
export const LANDED_CAP = LANDED_PER_ROW * MARK_ROW

/** Where the stack begins, ahead of this ship's stem. */
export function apronX(hull: Hull): number {
  return hull.length + APRON.ahead
}

/**
 * The apron a stack stands on: a platform, not a patch of water.
 *
 * What waits for a ship has to wait *somewhere*, and until now it floated. Drawn one `APRON_EDGE`
 * wider than what stands on it, on every side — which is also exactly the room the walk round it
 * needs, so the platform and the path are one measurement rather than two that can drift apart.
 */
export const APRON_EDGE = 1.3

/** Anything that stands on the apron: a demand still owed, a crate of untidiness, a boat. */
export interface Box {
  /** The centre. */
  spot: Spot
  along: number
  across: number
}

/**
 * The platform under everything standing at this berth, in the hull's own coordinates.
 *
 * Measured off what is actually there rather than from a row count, because two different pieces
 * of code put things on this apron — the demands still owed and the repository's own untidiness —
 * and a platform derived from one of them left the other standing on open water. `null` where
 * nothing waits: an empty platform would say "something stood here".
 */
export function apronOf(items: readonly Box[]): Box | null {
  if (items.length === 0) {
    return null
  }
  const left = Math.min(...items.map((one) => one.spot.x - one.along / 2)) - APRON_EDGE
  const right = Math.max(...items.map((one) => one.spot.x + one.along / 2)) + APRON_EDGE
  const top = Math.min(...items.map((one) => one.spot.y - one.across / 2)) - APRON_EDGE
  const bottom = Math.max(...items.map((one) => one.spot.y + one.across / 2)) + APRON_EDGE
  return {
    along: right - left,
    across: bottom - top,
    spot: { x: (left + right) / 2, y: (top + bottom) / 2 },
  }
}

/** The rows things stand in on the apron, as the band each one occupies across the berth. */
function rowsOf(items: readonly Box[]): readonly { from: number; to: number }[] {
  const rows: { from: number; to: number }[] = []
  for (const item of items) {
    const from = item.spot.y - item.across / 2
    const to = item.spot.y + item.across / 2
    const same = rows.find((row) => from < row.to && to > row.from)
    if (same === undefined) {
      rows.push({ from, to })
      continue
    }
    same.from = Math.min(same.from, from)
    same.to = Math.max(same.to, to)
  }
  return [...rows].sort((one, other) => one.from - other.from)
}

/**
 * Where somebody may walk on the apron: **between** the rows and round the ends.
 *
 * A boustrophedon loop — along the aisle above the first row to the far end, down into the next
 * aisle, back, and so on. Every leg runs either in an aisle or past an end, so a figure never
 * walks over a package; and because it closes on itself, the walk network carries it exactly as
 * it carries a ship's deck.
 *
 * The aisle between two rows is where it is because `LANDED.pitch` was widened to 2.2 for it: a
 * box is 1.2 across and a figure 0.84 wide, so the old 1.9 left somebody walking through the
 * boxes rather than between them.
 */
export function apronWalk(items: readonly Box[]): readonly Spot[] {
  const apron = apronOf(items)
  if (apron === null) {
    return []
  }
  const rows = rowsOf(items)
  const left = apron.spot.x - apron.along / 2 + APRON_EDGE / 2
  const right = apron.spot.x + apron.along / 2 - APRON_EDGE / 2
  const aisles = [
    (rows[0]?.from ?? 0) - APRON_EDGE / 2,
    ...rows.slice(1).map((row, index) => ((rows[index]?.to ?? 0) + row.from) / 2),
    (rows.at(-1)?.to ?? 0) + APRON_EDGE / 2,
  ]
  const snake = aisles.flatMap((y, index) =>
    // Alternating, so the ring snakes through the aisles instead of crossing the stack to get
    // back to the side it started on.
    index % 2 === 0
      ? [
          { x: left, y },
          { x: right, y },
        ]
      : [
          { x: right, y },
          { x: left, y },
        ],
  )
  /*
   * And one corner where the snake ends on the far side.
   *
   * With an odd number of aisles the last leg finishes at `right`, and closing the ring from
   * there to the first point would draw a diagonal straight across the stack — a figure walking
   * over every package on her way back. The corner sends her up the end of the stack instead,
   * which is clear ground by construction: `left` and `right` lie outside the boxes.
   */
  const last = snake.at(-1)
  const first = snake[0]
  if (last !== undefined && first !== undefined && last.x !== first.x) {
    snake.push({ x: last.x, y: first.y })
  }
  return snake
}

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
export function landedOf(ship: Ship, hull: Hull): readonly Landed[] {
  const quests = orderedQuests(bindingQuests(ship.quests))
    .filter((quest) => quest.verdict !== 'met')
    .slice(0, LANDED_CAP)
  const from = apronX(hull)

  return quests.map((quest, index) => ({
    quest,
    along: LANDED.along,
    across: LANDED.across,
    spot: {
      x: from + (index % LANDED_PER_ROW) * (LANDED.along + LANDED.gap) + LANDED.along / 2,
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

/** Anything with a rectangle: a demand's box, a crate on the planking, a boat alongside. */
export interface Placed {
  spot: Spot
  along: number
  across: number
}

/**
 * The box under a point, or `null` for a click that hit nothing.
 *
 * Generic, because everything drawn on a ship is a rectangle somewhere and every one of them has
 * to be clickable: a demand, a staged file, a stash, a worktree, a carried repository. One hit
 * test over one list, and the list is the same one the renderer strokes — so a box can never be
 * drawn in one place and answered for in another.
 */
export function boxAt<T extends Placed>(boxes: readonly T[], at: Spot): T | null {
  for (const box of boxes) {
    if (
      Math.abs(at.x - box.spot.x) <= box.along / 2 &&
      Math.abs(at.y - box.spot.y) <= box.across / 2
    ) {
      return box
    }
  }
  return null
}

/**
 * Which demand's box lies under a point, or `null` for a click that hit no box.
 *
 * Arithmetic and not a hit area per box: a hundred ships carrying nine boxes each would be nine
 * hundred interactive display objects for a question that is asked once per click. Scanning twenty
 * rectangles when somebody taps is free, and it keeps the boxes in one batched `Graphics` — which
 * is the whole reason the drawing costs what it does.
 *
 * Two coordinate systems, because the two halves live in different containers: the cargo moves
 * with the ship and the planking does not. The caller converts for each, which is also the only
 * place that knows about that split.
 */
export function questAt(
  boxes: readonly (Placed & { quest: QuestResult })[],
  at: Spot,
): string | null {
  return boxAt(boxes, at)?.quest.id ?? null
}

/**
 * The plank from the planking to her deck.
 *
 * Drawn only where something is waiting, which makes it the one mark that says "there is work
 * here" without counting anything — the eye finds a line between two shapes before it finds a
 * crate among crates. It also has to reach: a ship standing off because her tree is untidy is
 * exactly the ship with a loaded pier, so the plank grows with the gap.
 */
export function gangwayOf(hull: Hull, offset: number, reach: number = BERTH.laneCentre): Line {
  return {
    from: { x: hull.length * 0.22, y: -hull.beam / 2 },
    to: { x: hull.length * 0.22, y: -reach - offset },
  }
}

/**
 * Where somebody may walk once she is aboard, in the hull's own coordinates.
 *
 * Up the gangway, along the inboard side, round the stern and back down the outboard side: the
 * two strips of deck that carry nothing. Everything a click answers for — the cargo, the marks,
 * the gangway itself — stands between `DECK.from` and `DECK.to` on the centreline, and these run
 * outboard of all of it at `0.82` of the half beam, which is clear of the widest stack
 * (`hull.beam * 0.72`, see `cargoOf`) with room to spare.
 *
 * A ring and not a line: a figure that walks to the bow and turns round walks the same planks
 * back, which from above reads as a pendulum. Round the stern it reads as somebody working.
 *
 * The first spot is where the gangway lands, so the path can simply be hung off it.
 */
export function promenadeOf(hull: Hull): readonly Spot[] {
  const side = (hull.beam / 2) * 0.82
  const aft = hull.length * 0.12
  const fore = hull.length * 0.88
  return [
    { x: hull.length * 0.22, y: -side },
    { x: fore, y: -side },
    { x: hull.length * 0.95, y: 0 },
    { x: fore, y: side },
    { x: aft, y: side },
    { x: hull.length * 0.05, y: 0 },
    { x: aft, y: -side },
  ]
}

/**
 * The gangway as a rectangle, for the hit test.
 *
 * A line is a poor target — two pixels wide is a target nobody hits — so it answers over a band
 * around itself. Its own function rather than a box in `pierMarks`, because it stands for no kind:
 * it is the sign that the planking is loaded at all.
 */
export function gangwayBox(hull: Hull, offset: number, reach: number = BERTH.laneCentre): Placed {
  const plank = gangwayOf(hull, offset, reach)
  return {
    spot: { x: plank.from.x, y: (plank.from.y + plank.to.y) / 2 },
    along: 2.2,
    across: Math.abs(plank.to.y - plank.from.y),
  }
}

/** A crate, a flag, a boat: one drawn mark, with the kind it stands for. */
export interface MarkBox extends Placed {
  kind: MarkKind
  /** Whether the count had to be cut, so the drawing can say `4+` rather than claim four. */
  capped: boolean
}

/** A box for the repository's own untidiness. Smaller than a demand, because it is a smaller thing. */
export const MARK = { along: 1.5, gap: 0.4, across: LANDED.across * 0.8 } as const

/**
 * The kinds that wait on the planking: everything there is to tidy up.
 *
 * `pennant` and `drag` moved here, and the reason is what they did on the hull: unpushed commits
 * and commits waiting upstream drew a flag and a wake, so a repository with *more* left to do came
 * out looking more interesting than one with nothing. The pier is where work waits, and those two
 * are work. What stays aboard is what she *is* — a conflict that has stopped her, the trees that
 * belong to her, the repositories she carries.
 */
const ON_THE_PIER = new Set<MarkKind>([
  'staged',
  'unstaged',
  'untracked',
  'stash',
  'pennant',
  'drag',
])

/**
 * The repository's own untidiness, laid out along its reserved row of the planking.
 *
 * Here and not in the renderer for the reason `cargoOf` is here: where a box sits is arithmetic,
 * and it now has a second reader — the hit test. Two placements of one crate would be two answers
 * to "what did I just click on".
 *
 * One row and not one per kind: half a pier holds three rows, and a row per kind wanted five. The
 * kinds are told apart by colour and by fill, never by which row they are in.
 */
export function pierMarks(ship: Ship, hull: Hull): readonly MarkBox[] {
  const out: MarkBox[] = []
  const y = pierRowY(MARK_ROW)
  const edge = apronX(hull) + LANDED_PER_ROW * (LANDED.along + LANDED.gap)
  let at = apronX(hull)

  for (const mark of marksOf(ship)) {
    if (!ON_THE_PIER.has(mark.kind)) {
      continue
    }
    for (let index = 0; index < drawn(mark) && at + MARK.along <= edge; index += 1) {
      out.push({
        kind: mark.kind,
        capped: isCapped(mark),
        spot: { x: at + MARK.along / 2, y },
        along: MARK.along,
        across: MARK.across,
      })
      at += MARK.along + MARK.gap
    }
    if (isCapped(mark)) {
      at += 1.2
    }
    // A gap between two kinds, so the row reads as groups rather than one long stack.
    at += 0.6
  }
  return out
}

/**
 * What the ship herself carries: damage amidships, the trees alongside, the repositories she takes
 * with her.
 *
 * What she does *not* carry is anything there is to do — that all waits on the planking. A flag
 * for unpushed commits and a wake for commits upstream used to hang here, and they made a
 * repository with more left to do the more interesting drawing.
 *
 * Every one of them a rectangle, including the ones drawn as a cross: the shape is the renderer's
 * business, the area a click may land in is this one's.
 */
export function hullMarks(ship: Ship, hull: Hull): readonly MarkBox[] {
  const out: MarkBox[] = []
  const half = hull.beam / 2

  for (const mark of marksOf(ship)) {
    const count = drawn(mark)
    const capped = isCapped(mark)

    if (mark.kind === 'damage') {
      out.push({
        kind: mark.kind,
        capped,
        spot: { x: hull.length * 0.45, y: 0 },
        along: 2.2,
        across: 2.2,
      })
    }
    if (mark.kind === 'boat') {
      for (let index = 0; index < count; index += 1) {
        out.push({
          kind: mark.kind,
          capped,
          spot: { x: hull.length * 0.2 + index * 3.2, y: half + 1.3 },
          along: 2.4,
          across: 1,
        })
      }
    }
    if (mark.kind === 'tender') {
      for (let index = 0; index < count; index += 1) {
        out.push({
          kind: mark.kind,
          capped,
          spot: { x: hull.length * 0.58 + index * 2.4 + 0.05, y: half + 1.3 },
          along: 1.9,
          across: 0.9,
        })
      }
    }
  }
  return out
}
