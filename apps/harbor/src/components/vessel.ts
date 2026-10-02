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
  /**
   * The range a hull may be, and it was far too narrow.
   *
   * Measured over this fleet: the readings span **18 447 to one** in commits and 488 to one in
   * authors, and the drawing turned that into a length range of 1.69 and a beam range of 1.29 —
   * two hundred times less variation than there is. Ninety-two ships came out looking like
   * ninety-two of the same ship.
   *
   * Widened at the **floor** and not at the ceiling, which is what the berth allows. A hull at her
   * widest still leaves a metre of water to the pier — `BERTH.laneCentre` is 4.6 and half of
   * `maxBeam` is 3.6 — and that promise is older than this change. The small end had no such
   * reason to be where it was.
   */
  minLength: 9,
  maxLength: 34,
  minBeam: 2.6,
  maxBeam: 7.2,
} as const

/**
 * Where a history stops buying length.
 *
 * Read with a logarithm, so this is the count at which a hull is *full length* rather than the
 * point where a linear ramp is cut off. The longest history on this fleet is 18 447 commits, so a
 * ceiling just above it means the longest ship in the harbour is the longest ship there is.
 */
export const LENGTH_CEILING = 20000

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

/**
 * Where a hull starts growing at all: one commit, which every repository has.
 *
 * It was 20 *points* and the length came off the project score — commits, authors, checks and CI
 * added together. That score is commit-dominated anyway, so the length was almost this reading
 * already, only muddied by three others that have their own place in the drawing.
 */
export const LENGTH_FLOOR = 1

/**
 * Where a hull starts and stops getting **wider**, in people.
 *
 * Her length is what has been *done* here; her beam is how many it was done by. Two readings that
 * must be able to disagree, and this pairing is the second attempt at that.
 *
 * The first took the beam off *lines of text*, and the fleet said plainly that bulk is not
 * crowdedness: the widest ship in the harbour became `addons/AddOns` — 3 663 532 lines, **68
 * commits, one author** — a folder of downloaded game addons drawn as the broadest hull in the
 * basin. Authors cannot do that: a reading of people only grows when people turn up.
 *
 * Measured over this fleet: 1 at the bottom, 3 at the median, 8 at the third quartile and 488 at
 * the top. Heavy-tailed like everything else here, so logarithmic like everything else here.
 */
export const BEAM_FLOOR = 1
export const BEAM_CEILING = 500

/**
 * Her share of the beam range, 0 … 1 — and `null` lines sit at the bottom rather than nowhere.
 *
 * A repository git could not answer about is drawn narrow, which is the same thing the rest of
 * the drawing does with an absent reading: it says "nothing known" by looking like nothing much,
 * never by inventing a middle.
 */
export function beamShare(authors: number | null): number {
  if (authors === null) {
    return 0
  }
  const low = Math.log1p(BEAM_FLOOR)
  const high = Math.log1p(BEAM_CEILING)
  return Math.min(1, Math.max(0, (Math.log1p(Math.max(authors, 0)) - low) / (high - low)))
}

/** Her share of the length range, 0 … 1 — logarithmic between the floor and the ceiling. */
export function lengthShare(commits: number): number {
  const low = Math.log1p(LENGTH_FLOOR)
  const high = Math.log1p(LENGTH_CEILING)
  const worth = Math.log1p(Math.max(commits, 0))
  return Math.min(1, Math.max(0, (worth - low) / (high - low)))
}

/**
 * Her hull, from what the repository is worth.
 *
 * **Logarithmic, and a root against a ceiling was not enough.** Measured over this fleet: 21
 * points at the bottom, 23 200 at the median, 26 831 at the top. Against a ceiling of 6 000 the
 * six busiest repositories all came out at the maximum length and the median hull at 23.2 of a
 * 20-to-34 range — nine ships in ten the same size, and a size that says nothing is worse than
 * none. The same correction the stars and the crew carry: these are heavy-tailed counts, and a
 * root over one is a scale for its tail.
 */
export function hullOf(ship: Ship): Hull {
  const work = ship.ledger.total
  const length = SIZE.minLength + (SIZE.maxLength - SIZE.minLength) * lengthShare(work.commits)
  const beam = SIZE.minBeam + (SIZE.maxBeam - SIZE.minBeam) * beamShare(work.authors)
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
 * One container, **as a share of the hull it stands on**.
 *
 * It was absolute — 1.3 across, whatever the ship — and that was the quiet reason every hull in
 * the harbour was nearly the same size. Three bays and two gaps need 4.5 units across, a deck is
 * `beam * 0.86` wide where the cargo stands, so no hull narrower than 5.3 could carry its own
 * containers. The same held fore and aft for the deckhouse. The minima were not chosen; they were
 * what the furniture left, and they capped the length range at 1.69 and the beam range at 1.29
 * against readings that span 18 447 to one.
 *
 * A share instead, so a small ship is a small ship with small containers on it. `along` is still
 * squeezed to the deck it has, so a short hull with nine demands keeps all nine aboard instead of
 * stowing three over the side.
 */
export const CONTAINER = {
  /** How much of her beam the stack may use, across. The rest is deck to walk on. */
  deck: 0.86,
  /** Between two boxes abreast, of the beam — but never less than `SEAM`. */
  gap: 0.045,
  /** The full length of a bay before it has to be squeezed, of the length. */
  maxAlong: 0.13,
  /** Between two bays, of the length — but never less than `SEAM`. */
  gapAlong: 0.0147,
} as const

/**
 * The smallest gap between two crates that is still a gap, in plan units.
 *
 * A share alone was not enough and the small ships showed it: at a beam of 2.6 the share came to
 * four hundredths of a unit, which at any honest zoom is no gap at all — three boxes drawn as one
 * block, and a reader counting demands off a hull counts one. A floor costs the boxes a little
 * width on a small ship and buys the thing the boxes are *for*: being countable.
 */
export const SEAM = 0.26

/**
 * What one container measures on this hull: the gap first, the box with what is left.
 *
 * In that order on purpose. Sizing the box and then the gap lets the two add up to more than the
 * deck, which is how a stack ends up over the side; sizing the gap first makes "there is always
 * visible water between two crates" true by construction, and the boxes take the remainder.
 */
export function boxOn(hull: Hull): { across: number; gap: number } {
  const gap = Math.max(SEAM, hull.beam * CONTAINER.gap)
  const room = hull.beam * CONTAINER.deck
  return {
    across: Math.max(0.2, (room - (BAYS_ACROSS - 1) * gap) / BAYS_ACROSS),
    gap,
  }
}

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
  const gapAlong = Math.max(SEAM, hull.length * CONTAINER.gapAlong)
  const pitch = Math.min(hull.length * CONTAINER.maxAlong + gapAlong, usable / bays)
  const along = Math.max(hull.length * 0.018, pitch - gapAlong)

  const box = boxOn(hull)
  const spread = BAYS_ACROSS * box.across + (BAYS_ACROSS - 1) * box.gap
  const first = -spread / 2 + box.across / 2

  return quests.map((quest, index) => ({
    quest,
    along,
    across: box.across,
    spot: {
      x: from + Math.floor(index / BAYS_ACROSS) * pitch + along / 2,
      y: first + (index % BAYS_ACROSS) * (box.across + box.gap),
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
export function apronOf(items: readonly Box[], toPlank: number | null = null): Box | null {
  if (items.length === 0) {
    return null
  }
  const left = Math.min(...items.map((one) => one.spot.x - one.along / 2)) - APRON_EDGE
  const right = Math.max(...items.map((one) => one.spot.x + one.along / 2)) + APRON_EDGE
  /*
   * Up to the planking where it is given, so the two are **one** surface.
   *
   * An apron that stops short of the walkway is an island: somebody standing on it got there by
   * jumping. `toPlank` is where the drawn plank runs in this berth's own coordinates — measured
   * per berth by `reachOf`, never assumed — and the platform simply reaches it.
   */
  const near = Math.min(...items.map((one) => one.spot.y - one.across / 2)) - APRON_EDGE
  const top = toPlank === null ? near : Math.min(near, toPlank)
  const bottom = Math.max(...items.map((one) => one.spot.y + one.across / 2)) + APRON_EDGE
  return {
    along: right - left,
    across: bottom - top,
    spot: { x: (left + right) / 2, y: (top + bottom) / 2 },
  }
}

/** How finely a surface is divided into places somebody can stand, in world units. */
export const STRIDE = 1.1

/**
 * A piece of walkable ground: where somebody may stand on it, and which steps it allows.
 *
 * `links` are pairs of indices into `spots`, and `gate` is the spot that touches the planking.
 * A deck and an apron are both this, which is the whole point: the walk network knows one shape of
 * thing and neither has to be special-cased in it.
 */
export interface Ground {
  spots: readonly Spot[]
  links: readonly (readonly [number, number])[]
  gate: number
}

/**
 * The apron as a field somebody may walk **freely**, which is what it looks like.
 *
 * A grid over the platform at `STRIDE`, with every cell that touches a package left out, and each
 * remaining cell joined to its neighbour east and south. So a figure goes round the stack, down
 * an aisle, across and back — anywhere the ground actually is — rather than along one fixed loop.
 * Water is not in the grid and neither are the boxes, so "nicht ins Wasser und nicht über Kästen"
 * is true by construction rather than by a rule somebody has to keep.
 *
 * The gate is the spot nearest the planking, so the way aboard is the short one.
 */
export function fieldOf(items: readonly Box[], apron: Box | null): Ground | null {
  if (apron === null || items.length === 0) {
    return null
  }
  const left = apron.spot.x - apron.along / 2
  const top = apron.spot.y - apron.across / 2
  const columns = Math.max(1, Math.floor(apron.along / STRIDE))
  const rows = Math.max(1, Math.floor(apron.across / STRIDE))
  const alongStep = apron.along / columns
  const acrossStep = apron.across / rows

  const spots: Spot[] = []
  const at = new Map<string, number>()
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const spot = {
        x: left + (column + 0.5) * alongStep,
        y: top + (row + 0.5) * acrossStep,
      }
      // A cell is ground only where nothing stands on it. Half a stride of room around a box, so
      // a figure beside one does not overlap it.
      const blocked = items.some(
        (item) =>
          Math.abs(spot.x - item.spot.x) < item.along / 2 + STRIDE / 2 &&
          Math.abs(spot.y - item.spot.y) < item.across / 2 + STRIDE / 2,
      )
      if (blocked) {
        continue
      }
      at.set(`${String(column)}.${String(row)}`, spots.length)
      spots.push(spot)
    }
  }
  if (spots.length === 0) {
    return null
  }

  const links: (readonly [number, number])[] = []
  for (const [key, index] of at) {
    const [column, row] = key.split('.').map(Number)
    const east = at.get(`${String((column ?? 0) + 1)}.${String(row ?? 0)}`)
    const south = at.get(`${String(column ?? 0)}.${String((row ?? 0) + 1)}`)
    if (east !== undefined) {
      links.push([index, east])
    }
    if (south !== undefined) {
      links.push([index, south])
    }
  }

  const gate = spots.reduce(
    (best, spot, index) => (spot.y < (spots[best]?.y ?? 0) ? index : best),
    0,
  )
  return { spots, links, gate }
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
  // A share of her length, for the reason `CONTAINER` gives: a deckhouse of fixed size is a floor
  // under how short a hull may be, and that floor was most of why they all looked alike. It still
  // grows with what she is held to — it just does so within the ship rather than against her.
  const along = hull.length * (0.09 + Math.min(binding, 12) * 0.0068)
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
 * Whether there is a gangway at all — and it is about her **remote**, not her tidiness.
 *
 * It used to appear when something was waiting on the planking, so a gangway came and went with
 * the working tree: a repository with a clean checkout had no way aboard, and the same repository
 * with one untracked file had one. That reads as a statement about the ship and was a statement
 * about a `git status`.
 *
 * A remote is the honest reading: a repository nobody can reach from anywhere else is a ship with
 * no connection to the shore, and that is a fact about her that holds whatever her tree looks
 * like. Without one, nobody walks aboard either — see the walk network.
 *
 * *Any* remote and not the origin, although every one of the 86 reachable repositories here has
 * an origin. The question a plank answers is whether there is a way between this ship and the
 * shore at all, and a tree whose only remote is an `upstream` has one.
 */
export function hasGangway(ship: Ship): boolean {
  return ship.remotes.length > 0
}

/**
 * The plank from the planking to her deck, for a ship that has one.
 *
 * It has to reach: a ship standing off because her tree is untidy is exactly the ship with a
 * loaded pier, so the plank grows with the gap.
 */
export function gangwayOf(hull: Hull, offset: number, reach: number = BERTH.laneCentre): Line {
  return {
    from: { x: hull.length * 0.22, y: -hull.beam / 2 },
    to: { x: hull.length * 0.22, y: -reach - offset },
  }
}

/**
 * Whether a point is inside a closed polygon — the crossing-number rule.
 *
 * Needed because the deck is the one surface here whose edge is not a rectangle: a hull tapers,
 * and a walk laid out in fractions of her length rather than against her actual outline is a walk
 * that leaves her at the bow on some ships and not on others.
 */
export function within(outline: readonly Spot[], spot: Spot): boolean {
  let inside = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const a = outline[i]
    const b = outline[j]
    if (a === undefined || b === undefined) {
      continue
    }
    if (a.y > spot.y !== b.y > spot.y) {
      const cut = a.x + ((spot.y - a.y) / (b.y - a.y)) * (b.x - a.x)
      if (spot.x < cut) {
        inside = !inside
      }
    }
  }
  return inside
}

/**
 * The deck somebody may walk: inside her outline, and never over what stands on her.
 *
 * It used to be a ring at seven hand-picked fractions of her length and `0.82` of her half beam,
 * and both halves of that were wrong. `0.82` is clear of the widest *cargo* stack but not of the
 * deckhouse, which is `0.72` of the beam and sits exactly where the ring's aft leg runs — so
 * figures walked through it. And a ring that turns at `x * 0.95` is outside a hull whose bow has
 * been tapering since `0.82`.
 *
 * Built the way the apron is, for the same reason: a grid with everything standing on it left
 * out, so "nicht über die Kästen" and "nicht über die Bordwand" hold by construction rather than
 * by two constants somebody has to keep true. A cell is deck only where all four of its corners
 * are inside the outline, which is the clearance a figure needs at the rail.
 */
export function deckOf(hull: Hull, standing: readonly Placed[]): Ground | null {
  // Her own outline and not a second one computed from her dimensions: the drawing strokes this
  // polygon, and a walk measured against a different one would be clear of a rail nobody sees.
  const outline = hull.outline
  const columns = Math.max(1, Math.round(hull.length / STRIDE))
  const rows = Math.max(1, Math.round(hull.beam / STRIDE))
  const alongStep = hull.length / columns
  const acrossStep = hull.beam / rows

  const spots: Spot[] = []
  const at = new Map<string, number>()
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const spot = { x: (column + 0.5) * alongStep, y: -hull.beam / 2 + (row + 0.5) * acrossStep }
      const corners = [
        { x: spot.x - alongStep / 2, y: spot.y - acrossStep / 2 },
        { x: spot.x + alongStep / 2, y: spot.y - acrossStep / 2 },
        { x: spot.x - alongStep / 2, y: spot.y + acrossStep / 2 },
        { x: spot.x + alongStep / 2, y: spot.y + acrossStep / 2 },
      ]
      if (!corners.every((corner) => within(outline, corner))) {
        continue
      }
      const blocked = standing.some(
        (item) =>
          Math.abs(spot.x - item.spot.x) < item.along / 2 + alongStep / 2 &&
          Math.abs(spot.y - item.spot.y) < item.across / 2 + acrossStep / 2,
      )
      if (blocked) {
        continue
      }
      at.set(`${String(column)}.${String(row)}`, spots.length)
      spots.push(spot)
    }
  }
  if (spots.length === 0) {
    return null
  }

  const links: (readonly [number, number])[] = []
  for (const [key, index] of at) {
    const [column, row] = key.split('.').map(Number)
    const east = at.get(`${String((column ?? 0) + 1)}.${String(row ?? 0)}`)
    const south = at.get(`${String(column ?? 0)}.${String((row ?? 0) + 1)}`)
    if (east !== undefined) {
      links.push([index, east])
    }
    if (south !== undefined) {
      links.push([index, south])
    }
  }

  // The foot of the gangway: where somebody who has just come aboard is standing.
  const landing = { x: hull.length * 0.22, y: -hull.beam / 2 }
  const away = (spot: Spot | undefined): number =>
    spot === undefined
      ? Number.POSITIVE_INFINITY
      : Math.hypot(spot.x - landing.x, spot.y - landing.y)
  const gate = spots.reduce(
    (best, spot, index) => (away(spot) < away(spots[best]) ? index : best),
    0,
  )
  return { spots, links, gate }
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

/** What the forge says is open, as something standing on the apron. */
export interface ForgeBox extends Box {
  kind: 'issue' | 'pull'
}

/**
 * How full a heap is, per kind — and the two scales are **different on purpose**.
 *
 * Ten open issues is a quiet repository; ten open pull requests is a queue. Measured over the 71
 * repositories this fleet could read: issues run 0 at the median, 1 at the third quartile, 51 at
 * the ninetieth and 3167 at the top; pull requests run 0, 2, 14 and 68. One scale for both would
 * have put every repository here on the same two rungs and said nothing.
 *
 * Five rungs because a heap has five states to be in, and a reader counts crates, not pixels.
 */
export const HEAP_STEPS: Record<
  ForgeBox['kind'],
  readonly [number, number, number, number, number]
> = {
  issue: [1, 5, 20, 60, 200],
  pull: [1, 3, 7, 15, 30],
}

/** Which rung `count` of this kind stands on — 0 where nothing is open at all. */
export function heapLevel(kind: ForgeBox['kind'], count: number): number {
  return HEAP_STEPS[kind].filter((step) => count >= step).length
}

/**
 * The crates of one heap, by how full it is.
 *
 * A pile and not a row: a row of six says "six", a pile says "this much", and what the forge
 * answers is an amount nobody counts off a drawing anyway. Three across at the base and two on
 * top, which is as much as a heap can be at this scale without becoming a block.
 */
const HEAP_SHAPE: readonly (readonly (readonly [number, number])[])[] = [
  [],
  [[1, 0]],
  [
    [0.5, 0],
    [1.5, 0],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [0.5, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [0.5, 1],
    [1.5, 1],
  ],
]

/**
 * What is open on the forge, heaped on the apron like everything else that is not done.
 *
 * Two piles side by side: issues, which are questions, and pull requests, which carry code. Their
 * own row **beyond** the demands and the untidiness — those two are about this repository, this is
 * about what other people have left open in it — and beyond rather than between, so the side that
 * merges with the walkway stays the side a person walks on.
 */
export function forgeLoad(hull: Hull, issues: number, pulls: number): readonly ForgeBox[] {
  const base = pierRowY(MARK_ROW) + LANDED.pitch
  const out: ForgeBox[] = []
  let at = apronX(hull)
  for (const [kind, count] of [
    ['issue', issues],
    ['pull', pulls],
  ] as const) {
    const shape = HEAP_SHAPE[heapLevel(kind, count)] ?? []
    for (const [column, row] of shape) {
      out.push({
        kind,
        spot: {
          x: at + column * (MARK.along + MARK.gap) + MARK.along / 2,
          // Stacked away from the ship, so a heap never grows into the rows beside it.
          y: base + row * (MARK.across + MARK.gap),
        },
        along: MARK.along,
        across: MARK.across,
      })
    }
    // Three crates wide plus a gap between the two piles, whether this one is full or not: two
    // heaps that slid together as the first one shrank would be one heap that changes shape.
    at += 3 * (MARK.along + MARK.gap) + 1.2
  }
  return out
}

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
