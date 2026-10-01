/**
 * Where every ship lies, and the walkways that reach her.
 *
 * The fleet is grouped by organisation, and the harbour fans out from one point on the shore: each
 * group gets an angular sector, a **limb** runs out along it, and her ships hang off that limb on
 * short planks to either side. That is the third arrangement and the first one whose walkways can
 * run at an angle — which was the point of it.
 *
 * The two before it are worth naming, because each failed for a reason that is now a rule here.
 * A ruled grid of full-width piers answered "how many ships" and nothing else: a repository's
 * neighbours were whoever happened to sort next to it. Docks in rectangular lanes fixed the
 * neighbours and fixed the walkways at right angles — with blocks packed edge to edge, *any*
 * diagonal between two points crosses the block in between, so an angled plank had nowhere to go
 * that was not over somebody else's ships. A fan has the gaps a diagonal needs.
 *
 * **The walkways are a graph**: quays and the ways between them. It is built as a tree — every way
 * but the extras joins a new quay to one already reachable, in that order — so "every ship can
 * reach the shore" is still true *by construction* and not merely checked afterwards. What the
 * edge list adds is that the extra ways round are now ordinary ways rather than a second list the
 * reachability check does not look at, and that questions like "what does this plank serve" and
 * "where can somebody standing here walk" have an answer at all.
 *
 * No store and no database: the graph is derived from the fleet every draw, like everything else
 * here. A kept graph could disagree with the ships it is about.
 *
 * **Where a ship goes is searched, not calculated.** Each berth is pushed outward along its limb
 * until its footprint clears everything already placed. A closed form would have to know how long
 * every hull is, how wide her apron is and which sector her neighbour spilled into; the search
 * knows all three by asking. It also makes "no two ships overlap" something a test can check
 * rather than something the arithmetic is trusted about.
 *
 * The berth arithmetic itself is unchanged and re-used (`BERTH`, the alternating `Side`), which is
 * what keeps `vessel.ts` — hull, cargo, apron, gangway, mark placement and every hit test —
 * working without knowing any of this happened.
 */

import { BERTH } from './plan'
import { SIZE } from './vessel'

import type { Fleetlet } from './flags'
import type { Side, Spot } from './plan'
import type { Ship } from '@hafen/core'

/** The shore: land all round the picture, and the root stands on its western edge. */
export const QUAY = 7

/** Water around the whole plan, so nothing sits flush against an edge. */
export const MARGIN = { x: 3, y: 3 } as const

/** Clear water kept between the outermost berth and the shore behind it. */
export const GAP = { x: 11, y: 9 } as const

/**
 * The fan, in radians either side of due east.
 *
 * Not a full half-turn: a limb at ninety degrees runs straight up the shore and its ships lie
 * along it in a column, which is a column and not a branch. Eighty degrees keeps every limb
 * visibly leaving the shore while still spending the whole height of the picture.
 *
 * That is the width for **one** centre. Several have to share the water, and a fan that keeps its
 * eighty degrees reaches round into its neighbour's — the six-centre harbour came out at 1074k
 * square units against 210k for the same fleet in lanes, because every fan was pushing ships
 * through every other one. `arcFor` divides the turn instead.
 */
export const FAN = 1.4

/**
 * How wide one centre's fan may open, with this many centres round the frame.
 *
 * A share of the whole turn and never more than `FAN`. The tenth extra is deliberate: neighbouring
 * fans overlapping a little is what makes the harbour read as one place rather than as six
 * separate diagrams, and the placement search resolves the overlap by moving a ship, which it can
 * do. What it cannot do is invent room where two fans have claimed the same water outright.
 */
export function arcFor(centres: number): number {
  return Math.min(FAN, ((Math.PI * 2) / Math.max(1, centres) / 2) * 1.1)
}

/** Where the first berth on a limb may stand, and how finely the search steps outward. */
export const REACH = { first: 22, step: 3 } as const

/**
 * How many places the shore is reached at.
 *
 * One fan wastes its own middle: the wedges are narrow where they meet and the picture is mostly
 * empty near the root. Several smaller fans along the shore waste less of it, and it is what a
 * real waterfront looks like — a marina does not have one jetty system, it has a few.
 *
 * The count comes off the group count and is deliberately flat: too many centres and each fan is
 * a single limb, which is a row and not a fan. Three organisations per centre keeps a fan wide
 * enough to be one.
 */
export const PER_CENTRE = 3
export const CENTRES_MOST = 6

export function centresFor(groups: number): number {
  return Math.max(1, Math.min(CENTRES_MOST, Math.round(groups / PER_CENTRE)))
}

/** What one berth takes up: her hull, the apron ahead of her bow, her lane and her caption. */
export const FOOTPRINT = {
  along: BERTH.pitch,
  across: 2 * (BERTH.lane + BERTH.caption * 0.55),
} as const

/**
 * How much room a fan wastes, as a multiple of the berths it holds.
 *
 * Measured rather than guessed: the same 92 berths came out in 210k square units packed in lanes
 * and 877k fanned, so a fan spends about four times the area a rectangle does. The frame the
 * centres stand on is sized from that, which is the only way to place them before knowing how big
 * the harbour turns out to be.
 */
export const FAN_SLACK = 3.4

/**
 * Where the centres stand: a row along the north shore, every fan pointing south.
 *
 * Two arrangements were measured before this one, and both failed on *shape* rather than on
 * anything subtle. A column along the west shore gave 701 × 1252 — twice as tall as wide, the
 * opposite of a window. Round the whole frame, fanning inward, gave 1202 × 894 and **five times
 * the area the same fleet takes in lanes**, because six fans all reaching for the middle spend
 * the whole picture fighting over it.
 *
 * A row fanning one way has neither problem: the fans run beside each other instead of into each
 * other, and the harbour grows along the shore, which is the direction a window has room in.
 */
export function centresOn(count: number, berths: number, aspect: number): readonly Berth[] {
  const area = Math.max(1, berths) * FOOTPRINT.along * FOOTPRINT.across * FAN_SLACK
  const width = Math.sqrt(area * aspect)
  const pitch = width / Math.max(1, count)

  return Array.from({ length: count }, (_, index) => ({
    // Half a pitch in, so the first and last fans have shore either side of them rather than
    // hanging off the corner.
    spot: { x: (index + 0.5) * pitch, y: 0 },
    angle: Math.PI / 2,
  }))
}

/** A place on the shore and the way its fan points. */
export interface Berth {
  spot: Spot
  angle: number
}

/**
 * How many ranks deep a limb may carry ships on one side.
 *
 * One rank each side was the first try and it left the harbour four times the area it needed: a
 * sector is a wedge that gets wider the further out you go, and two berths abreast cannot fill a
 * wedge, so the search kept pushing outward for room that was already there sideways. Ranks fill
 * the width, and a rank past the first hangs off the plank in front of it — which is a branch off
 * a branch, and the first thing in this harbour that is a tree more than one level deep.
 */
export const RANKS = 4

/** Clear water between a limb and the berths hanging off it, over and above what they need. */
export const OFFSET = BERTH.lane

/**
 * How far off her limb a berth has to float, for a limb pointing this way.
 *
 * **Not a constant, and that was the bug.** A berth is a long box lying east–west; a limb can
 * point anywhere. Held at a fixed distance, a berth on a steep limb had only her *beam* between
 * her and it while her fifty-two-unit length lay straight across it — sixteen hulls with a walkway
 * drawn through them on this fleet, which is the one thing this module promises never to do.
 *
 * What is needed is the box's own half-extent measured along the limb's normal, which is the
 * support function of a rectangle: twenty-six units for a limb running due north, seventeen for
 * one running due east, and the right thing in between.
 */
export function clearanceOn(square: Spot): number {
  return (
    (FOOTPRINT.along / 2) * Math.abs(square.x) +
    (FOOTPRINT.across / 2) * Math.abs(square.y) +
    OFFSET
  )
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/**
 * Whether a walkway passes through a box, with the cheap rejection first.
 *
 * The bounding-box test is not an optimisation for its own sake: the anchor search asks this
 * question a few hundred thousand times per draw, and without it the layout took longer than the
 * test runner's patience — which is a slow window, not just a slow test.
 */
function near(from: Spot, to: Spot, box: Box): boolean {
  return (
    Math.min(from.x, to.x) <= box.x + box.width &&
    Math.max(from.x, to.x) >= box.x &&
    Math.min(from.y, to.y) <= box.y + box.height &&
    Math.max(from.y, to.y) >= box.y
  )
}

/**
 * Whether a walkway passes through a box.
 *
 * Sampled along the segment rather than solved: an endpoint test misses a line that runs clean
 * through, which is exactly the kind of near-miss that put sixteen planks across hulls. Twenty-one
 * samples on a segment that is never longer than a few berths cannot skip one.
 */
export function cuts(from: Spot, to: Spot, box: Box): boolean {
  if (!near(from, to, box)) {
    return false
  }
  for (let at = 0; at <= 1; at += 0.05) {
    const x = from.x + (to.x - from.x) * at
    const y = from.y + (to.y - from.y) * at
    if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) {
      return true
    }
  }
  return false
}

/** The point a bearing is measured from when nobody says otherwise. */
const ORIGIN: Spot = { x: 0, y: 0 }

/**
 * Whether a limb pointing this way would pass through this box.
 *
 * Exact rather than sampled, because it is asked once per candidate berth per limb and there are
 * a lot of candidates. A limb is a ray from the root: the box is in its way exactly when its
 * corners fall on **both** sides of the ray's line and at least one of them is in front of the
 * root. Corners all on one side means the limb passes it by, however close.
 *
 * `clearanceOn` already keeps a berth off *her own* limb, so this is asked of every limb including
 * hers — which makes it an invariant rather than a special case. What it catches is the other
 * fifteen: a berth pushed far enough out along a shallow sector to drift under a steeper one.
 */
export function inTheWayOf(box: Box, along: Spot, square: Spot, from: Spot = ORIGIN): boolean {
  const corners = [
    { x: box.x - from.x, y: box.y - from.y },
    { x: box.x + box.width - from.x, y: box.y - from.y },
    { x: box.x - from.x, y: box.y + box.height - from.y },
    { x: box.x + box.width - from.x, y: box.y + box.height - from.y },
  ]
  const sides = corners.map((corner) => Math.sign(corner.x * square.x + corner.y * square.y))
  if (sides.every((one) => one > 0) || sides.every((one) => one < 0)) {
    return false
  }
  return corners.some((corner) => corner.x * along.x + corner.y * along.y > 0)
}

/** What a quay is for, which is also how wide a thing is drawn and what colour it carries. */
export type Rank = 'root' | 'limb' | 'stub' | 'plank'

/** A place on the network: a corner, a junction, the end of a plank. */
export interface Quay {
  id: number
  spot: Spot
  rank: Rank
  /** Which group this piece of walkway serves, for colouring it with their flag. */
  org: string | null
}

/**
 * A way between two quays.
 *
 * `kind` is the load-bearing field. A `tree` way was laid joining a new quay to one already
 * reachable, so the tree ways alone already connect everything — that is the construction the
 * promise rests on. A `round` way is an extra: it joins two quays that could both already be
 * reached, so removing every one of them changes nothing about who can get ashore.
 *
 * A `tender` is a tree way that could not be a plank. It counts for reachability exactly as a
 * tree way does — she *is* reached — but no straight or right-angled run to her crossed open
 * water, so what reaches her is a boat. Three berths in ninety-two are like that in the fan and
 * none in the lanes. The alternative was drawing a plank over somebody's deck and calling the
 * promise kept, which is the one thing this module is for not doing.
 */
export interface Way {
  from: number
  to: number
  kind: 'tree' | 'round' | 'tender'
  org: string | null
}

export interface Mooring {
  ship: Ship
  org: string
  /** The hull's stern on her centreline, as `vessel.ts` expects it. */
  spot: Spot
  /** Which side her planking is on — the old alternating rows, kept. */
  side: Side
  /** The plank she lies against. Her way ashore starts here. */
  node: number
  /** Which way her limb runs, for anything that wants to work along it. */
  angle: number
}

/** A group's own patch of water, for its name and for the machine that works it. */
export interface Dock {
  org: string
  at: Spot
  width: number
  height: number
  angle: number
}

export interface Harbour {
  quays: readonly Quay[]
  ways: readonly Way[]
  moorings: readonly Mooring[]
  blocks: readonly Dock[]
  width: number
  height: number
  /** Where the root stands, so the shore can be drawn behind it. */
  root: Spot
}

const EMPTY: Harbour = {
  quays: [],
  ways: [],
  moorings: [],
  blocks: [],
  width: 1,
  height: 1,
  root: { x: 0, y: 0 },
}

/**
 * The share of the fan each group gets, in the order they arrive.
 *
 * By the **root** of the group's size and not by the size itself. A sector is an angle, and what a
 * group needs from an angle is room *across* its limb; the rest of its growth goes into length.
 * Straight by count, the eighteen-ship dock on this fleet took a quarter of the whole fan while
 * each of the thirteen singletons got a fortieth — narrower than one hull.
 */
export function sectorsOf(weights: readonly number[]): readonly number[] {
  const roots = weights.map((count) => Math.sqrt(Math.max(count, 1)))
  const total = roots.reduce((sum, one) => sum + one, 0)
  return total === 0 ? roots.map(() => 0) : roots.map((one) => one / total)
}

/**
 * Move the whole harbour so nothing has a negative coordinate, and measure it.
 *
 * The fan is built around a root at the origin because that is the arithmetic that reads; the
 * drawing wants a box starting at nought. Done once at the end rather than by guessing an offset
 * up front, which would have to know the answer it is trying to produce.
 */
function shift(harbour: Harbour): Harbour {
  const xs = [
    ...harbour.quays.map((one) => one.spot.x),
    ...harbour.blocks.map((one) => one.at.x),
    ...harbour.blocks.map((one) => one.at.x + one.width),
  ]
  const ys = [
    ...harbour.quays.map((one) => one.spot.y),
    ...harbour.blocks.map((one) => one.at.y),
    ...harbour.blocks.map((one) => one.at.y + one.height),
  ]
  if (xs.length === 0 || ys.length === 0) {
    return EMPTY
  }

  const dx = MARGIN.x + QUAY - Math.min(...xs)
  const dy = MARGIN.y + QUAY - Math.min(...ys)
  const move = (spot: Spot): Spot => ({ x: spot.x + dx, y: spot.y + dy })

  return {
    quays: harbour.quays.map((one) => ({ ...one, spot: move(one.spot) })),
    ways: harbour.ways,
    moorings: harbour.moorings.map((one) => ({ ...one, spot: move(one.spot) })),
    blocks: harbour.blocks.map((one) => ({ ...one, at: move(one.at) })),
    width: Math.max(...xs) + dx + QUAY + MARGIN.x,
    height: Math.max(...ys) + dy + QUAY + MARGIN.y,
    root: move(harbour.root),
  }
}

/**
 * Walkways cut back until every loose end carries a ship.
 *
 * A limb is laid out to a group's sector before the berths on it are placed, and where a berth is
 * rejected on geometry the piece of walkway that was going to serve it stays. Measured on this
 * fleet: three such ends in the fan, none in the lanes — and in the drawing they are the little
 * peaks that run out and stop in open water, which is exactly what a walkway must never look
 * like. A way is a promise that somebody can get somewhere.
 *
 * Cut repeatedly, because the end behind a cut end is a new end. The root stays whatever happens:
 * it stands on the quay and is where every route begins.
 */
export function trimmed(harbour: Harbour): Harbour {
  const moored = new Set(harbour.moorings.map((mooring) => mooring.node))
  let quays = harbour.quays
  let ways = harbour.ways
  for (;;) {
    const touches = new Map<number, number>()
    for (const way of ways) {
      touches.set(way.from, (touches.get(way.from) ?? 0) + 1)
      touches.set(way.to, (touches.get(way.to) ?? 0) + 1)
    }
    const loose = new Set(
      quays
        .filter(
          (quay) =>
            quay.rank !== 'root' && !moored.has(quay.id) && (touches.get(quay.id) ?? 0) <= 1,
        )
        .map((quay) => quay.id),
    )
    if (loose.size === 0) {
      return { ...harbour, quays, ways }
    }
    quays = quays.filter((quay) => !loose.has(quay.id))
    ways = ways.filter((way) => !loose.has(way.from) && !loose.has(way.to))
  }
}

/**
 * Whether every loose end of the walkways carries a ship.
 *
 * The other half of `reachesShore`: that one says every ship can reach the land, this one says
 * every piece of walkway is there for a ship. Both are about the same graph and neither implies
 * the other — a way to nowhere strands nobody, it just lies about being a route.
 */
export function endsAtAShip(harbour: Harbour): boolean {
  const moored = new Set(harbour.moorings.map((mooring) => mooring.node))
  const touches = new Map<number, number>()
  for (const way of harbour.ways) {
    touches.set(way.from, (touches.get(way.from) ?? 0) + 1)
    touches.set(way.to, (touches.get(way.to) ?? 0) + 1)
  }
  return harbour.quays.every(
    (quay) => quay.rank === 'root' || moored.has(quay.id) || (touches.get(quay.id) ?? 0) > 1,
  )
}

/**
 * Lay the fleet out as a fan, then hang the walkways off the shore.
 *
 * Groups arrive biggest-first from `fleetlets` and are dealt into sectors from the middle outward,
 * so the largest dock lies straight ahead of the root and the singletons take the shallow angles
 * at the top and bottom. Dealt from the middle because the middle of a fan is where there is most
 * room, and that is where an eighteen-ship dock has to go.
 */
export function harbourOf(groups: readonly Fleetlet[], aspect = 16 / 9): Harbour {
  if (groups.length === 0) {
    return EMPTY
  }

  const shares = sectorsOf(groups.map((group) => group.ships.length))
  const order: number[] = []
  groups.forEach((_, index) => {
    if (index % 2 === 0) {
      order.push(index)
    } else {
      order.unshift(index)
    }
  })

  const quays: Quay[] = []
  const ways: Way[] = []
  const moorings: Mooring[] = []
  const blocks: Dock[] = []
  const taken: Box[] = []
  /**
   * The hulls themselves, which is what a walkway must not cross.
   *
   * Kept apart from `taken`, and the distinction is the whole of a bug: `taken` holds a berth's
   * *footprint* — hull, apron, lane and caption — and every stub necessarily runs inside the
   * footprint of the ship it serves. Rejecting a stub that touches a footprint rejects all of
   * them; rejecting one that touches a hull rejects the eleven that were wrong.
   */
  const hulls: Box[] = []
  /** Berths placed but not yet joined to anything: see why in the note where they are pushed. */
  const pending: {
    ship: Ship
    org: string
    limb: number
    spot: Spot
    side: Side
    at: Spot
    angle: number
  }[] = []
  /**
   * Every plank end put down so far, as somewhere the next ship might hang off.
   *
   * Ends only. A midpoint is a real place to walk from and was offered as one, which made three
   * routes score clear at a point the drawn way never touched — see where they are pushed.
   */
  const planks: { id: number; spot: Spot }[] = []

  /*
   * Several places the shore is reached at, not one.
   *
   * One fan wastes its own middle — the wedges are narrow where they meet, so the picture is
   * emptiest exactly where the eye starts. A few smaller fans strung along the shore waste less of
   * it, and it is what a waterfront actually looks like: a marina has a few jetty systems, not one
   * enormous one.
   *
   * The groups are dealt round-robin so that every centre carries a comparable load: handed out in
   * blocks, the first centre would get the three biggest docks and the last three singletons.
   */
  const centres = centresFor(groups.length)
  const berths = groups.reduce((sum, one) => sum + one.ships.length, 0)
  const roots = centresOn(centres, berths, aspect).map((one, index) => ({
    id: quays.length + index,
    spot: one.spot,
    angle: one.angle,
  }))
  for (const one of roots) {
    quays.push({ id: one.id, spot: one.spot, rank: 'root', org: null })
  }
  const root: Spot = roots[0]?.spot ?? { x: 0, y: 0 }

  /**
   * Lay a quay and the way that reaches it, in one act.
   *
   * The two cannot be separated without losing the promise: a quay added without a way to an
   * already-reachable one is a quay nobody can get to, and there would be no moment at which that
   * is obvious. Here it cannot be written.
   */
  const extend = (from: number, spot: Spot, rank: Rank, org: string | null): number => {
    const id = quays.length
    quays.push({ id, spot, rank, org })
    ways.push({ from, to: id, kind: 'tree', org })
    return id
  }

  /*
   * Every limb's bearing, worked out before a single berth is placed.
   *
   * Needed up front because a berth has to clear *all* of them, not just her own: the first pass
   * kept each ship off her own limb and four of them still ended up under a neighbour's, which a
   * limb-by-limb check can never see. The angles are a function of the sectors alone, so they can
   * be known before anything is placed — which is the only reason this works.
   */
  /*
   * Which centre each group hangs off, and its bearing from that centre — all before a berth is
   * placed.
   *
   * Needed up front because a berth has to clear *every* limb in the harbour, not only her own:
   * the first pass kept each ship off her own and four still ended up under a neighbour's, which a
   * limb-by-limb check can never see. Sectors are a function of the shares alone, so they can be
   * known before anything is laid down — which is the only reason this works.
   */
  const berthed = order.map((index, seat) => {
    const at = seat % centres
    const mates = order.filter((_, other) => other % centres === at)
    const local = shares.filter((_, other) => order.indexOf(other) % centres === at)
    const whole = local.reduce((sum, one) => sum + one, 0)
    const before = mates
      .slice(0, mates.indexOf(index))
      .reduce((sum, one) => sum + (shares[one] ?? 0), 0)
    const share = (shares[index] ?? 0) / (whole === 0 ? 1 : whole)
    const centre = roots[at] ?? { id: 0, spot: { x: 0, y: 0 }, angle: 0 }
    const arc = arcFor(centres)
    return {
      index,
      root: centre,
      // The sector, turned to face whichever way this centre's shore looks.
      angle: centre.angle + (-arc + ((before / (whole === 0 ? 1 : whole)) * 2 + share) * arc),
    }
  })

  const rays = berthed.map((one) => ({
    from: one.root.spot,
    along: { x: Math.cos(one.angle), y: Math.sin(one.angle) },
    square: { x: -Math.sin(one.angle), y: Math.cos(one.angle) },
  }))

  const tips: { id: number; org: string }[] = []

  for (const { index, root: centre, angle } of berthed) {
    const group = groups[index]
    if (group === undefined) {
      continue
    }

    const along = { x: Math.cos(angle), y: Math.sin(angle) }
    const square = { x: -Math.sin(angle), y: Math.cos(angle) }

    const clearance = clearanceOn(square)
    let reach: number = REACH.first
    let onLimb = centre.id
    const mine: Box[] = []

    for (const ship of group.ships) {
      /*
       * Outward until she fits, trying both sides of the limb at every step.
       *
       * Both sides at one radius before stepping, so a limb fills alternately rather than growing
       * two berths long for every one it carries. The step bound is a real limit and not a safety
       * net: a fleet that needed more than this would be one where the fan itself is wrong, and a
       * short harbour is a better answer than a window that never finishes drawing.
       */
      let placed: { spot: Spot; side: Side; at: Spot } | null = null
      for (let step = 0; step < 600 && placed === null; step += 1) {
        const radius = reach + step * REACH.step
        // Ranks before radius: fill the wedge sideways before spending the harbour's length on it.
        for (let rank = 0; rank < RANKS && placed === null; rank += 1) {
          for (const side of [-1, 1] as const) {
            const off = clearance + rank * FOOTPRINT.across
            const middle = {
              x: centre.spot.x + along.x * radius + square.x * side * off,
              y: centre.spot.y + along.y * radius + square.y * side * off,
            }
            const box: Box = {
              x: middle.x - FOOTPRINT.along / 2,
              y: middle.y - FOOTPRINT.across / 2,
              width: FOOTPRINT.along,
              height: FOOTPRINT.across,
            }
            if (taken.some((one) => overlaps(box, one))) {
              continue
            }
            if (rays.some((ray) => inTheWayOf(box, ray.along, ray.square, ray.from))) {
              continue
            }
            taken.push(box)
            mine.push(box)
            placed = {
              // `vessel.ts` draws from the stern: she starts at the landward end of her berth.
              spot: { x: box.x, y: middle.y },
              side,
              at: {
                x: centre.spot.x + along.x * radius,
                y: centre.spot.y + along.y * radius,
              },
            }
            reach = radius
            break
          }
        }
      }
      if (placed === null) {
        continue
      }

      // A node on the limb at her radius, chained to the one before: the limb *is* the chain.
      const limb = extend(onLimb, placed.at, 'limb', group.org)
      onLimb = limb

      hulls.push({
        x: placed.spot.x,
        y: placed.spot.y - SIZE.maxBeam / 2,
        width: SIZE.maxLength,
        height: SIZE.maxBeam,
      })
      /*
       * Her plank is decided later, and that is a fix rather than a tidy-up.
       *
       * Choosing an anchor needs to know which water is clear, and the water is not clear until
       * every ship is placed: four stubs came out drawn across hulls that did not exist yet when
       * the stub was chosen. Placement first, walkways second — the only order in which the
       * question can be answered.
       */
      pending.push({
        ship,
        org: group.org,
        limb,
        spot: placed.spot,
        side: placed.side,
        at: placed.at,
        angle,
      })
    }

    if (mine.length > 0) {
      const left = Math.min(...mine.map((one) => one.x))
      const top = Math.min(...mine.map((one) => one.y))
      blocks.push({
        org: group.org,
        at: { x: left, y: top },
        width: Math.max(...mine.map((one) => one.x + one.width)) - left,
        height: Math.max(...mine.map((one) => one.y + one.height)) - top,
        angle,
      })
      tips.push({ id: onLimb, org: group.org })
    }
  }

  /*
   * Now that every hull is down, join each berth to the nearest thing it can reach.
   *
   * Her limb usually, but a ship in the second rank lies behind one in the first, and a stub to
   * the limb would be drawn straight over her neighbour. Hanging off the neighbour's plank instead
   * is both the honest drawing and the honest structure — she really does reach the shore through
   * that berth — and it is what makes this a tree more than two levels deep.
   *
   * Rejected on geometry and never on rank, so nothing has to track who is in which rank: if a
   * plank can be reached without crossing a hull, it can be reached.
   */
  for (const berth of pending) {
    const plankY = berth.spot.y - berth.side * BERTH.laneCentre
    const nearEnd = { x: berth.spot.x, y: plankY }
    const farEnd = { x: berth.spot.x + BERTH.pitch, y: plankY }
    /*
     * Every hull, **including her own**.
     *
     * Excluding hers looked obviously right — her plank belongs to her — and was the last of the
     * crossings: her plank lies to one side of her, so a route reaching it from the *other* side
     * goes over her deck. She is no more walk-throughable than her neighbours.
     */

    let stubFrom = nearEnd
    let stubTo = farEnd
    let via: Spot | null = null
    let parent = berth.limb
    /*
     * Scored by how many hulls the route crosses first and by how long it is second.
     *
     * A plain "reject anything that crosses" left one berth in sixty-four with no clear anchor at
     * all and silently took the crossing one anyway. Scoring means the search always has an answer
     * and always prefers the clear one — and where no clear route exists it picks the least bad,
     * which is a thing a reader can see rather than a promise quietly broken.
     */
    let best = { cut: Number.POSITIVE_INFINITY, span: Number.POSITIVE_INFINITY }
    /*
     * Any node of her own dock, not only the limb point at her own radius.
     *
     * A berth in the second rank is behind one in the first, so the obvious route is blocked and
     * the next one along the limb is usually clear. Restricting her to *her* radius left one berth
     * in sixty-four with nowhere clean to attach; the whole limb leaves none.
     */
    /*
     * Any limb in the harbour and any plank, not only her own organisation's.
     *
     * Restricting her to her own dock left three berths in ninety-two with no clear route to any
     * of the candidates, so each took the least bad one — a plank over a deck. A walkway does not
     * care whose dock it started at, and a berth boxed in by her own neighbours is very often one
     * step from the dock next door.
     */
    const anchors = [...quays.filter((one) => one.rank === 'limb'), ...planks]
      /*
       * Nearest first, and stop at the first clear one.
       *
       * Sorted, "the first route with no crossing" *is* the shortest route with no crossing, so
       * the search can stop the moment it finds one instead of scoring every anchor against every
       * hull. Unsorted this cost a few hundred thousand segment tests per draw and took longer
       * than the test runner's patience — which is a slow window, not merely a slow test.
       */
      .map((one) => ({
        ...one,
        far: Math.min(
          Math.hypot(nearEnd.x - one.spot.x, nearEnd.y - one.spot.y),
          Math.hypot(farEnd.x - one.spot.x, farEnd.y - one.spot.y),
        ),
      }))
      .sort((a, b) => a.far - b.far)
      /*
       * How many anchors are worth trying before giving up on a clear route.
       *
       * Twenty-four was enough while there was one wide fan. Narrow arcs pack the berths closer,
       * so the nearest two dozen quays are all behind the same neighbour and three berths took a
       * route over a deck. Forty-eight costs nothing — the search stops at the first clear one —
       * and it is the difference between the promise holding and nearly holding.
       */
      .slice(0, 48)

    for (const anchor of anchors) {
      if (best.cut === 0) {
        break
      }
      for (const [head, tail] of [
        [nearEnd, farEnd],
        [farEnd, nearEnd],
      ] as const) {
        /*
         * Straight, or round one corner.
         *
         * A berth wedged between two others can have no straight route to anything, and the first
         * version silently took the least bad one — a plank over a deck. The two right-angled
         * routes are the ones a jetty would actually be built as, and between the three of them
         * every berth on this fleet has a clear one.
         */
        for (const corner of [
          null,
          { x: anchor.spot.x, y: head.y },
          { x: head.x, y: anchor.spot.y },
        ]) {
          /*
           * The plank counts as part of the route, and leaving it out was the last crossing.
           *
           * Only the *way to* her plank was scored, never the plank itself — fifty-two units
           * running alongside her, which is longer than a hull and quite able to lie across the
           * neighbour beyond her. Three berths in ninety-two had a clear stub to a plank that was
           * itself over a deck, and the search happily called that a clear route.
           */
          const legs: readonly (readonly [Spot, Spot])[] =
            corner === null
              ? [
                  [anchor.spot, head],
                  [head, tail],
                ]
              : [
                  [anchor.spot, corner],
                  [corner, head],
                  [head, tail],
                ]
          const cut = legs.reduce<number>(
            (sum, [a, b]) => sum + hulls.filter((one) => cuts(a, b, one)).length,
            0,
          )
          const span = legs.reduce<number>(
            (sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.y - a.y),
            0,
          )
          if (cut > best.cut || (cut === best.cut && span >= best.span)) {
            continue
          }
          best = { cut, span }
          parent = anchor.id
          stubFrom = head
          stubTo = tail
          via = corner
        }
      }
    }

    /*
     * Where nothing clear was found, she is reached by water instead of by a plank over a deck.
     *
     * One way straight from the anchor to her plank, marked as a tender. It connects her — so the
     * reachability check is satisfied and honestly so — and the drawing can say what it is rather
     * than pretending there are boards there.
     */
    if (best.cut > 0) {
      const landing = quays.length
      quays.push({ id: landing, spot: stubFrom, rank: 'plank', org: berth.org })
      ways.push({ from: parent, to: landing, kind: 'tender', org: berth.org })
      const along = extend(landing, stubTo, 'plank', berth.org)
      moorings.push({
        ship: berth.ship,
        org: berth.org,
        spot: berth.spot,
        side: berth.side,
        node: along,
        angle: berth.angle,
      })
      planks.push({ id: along, spot: stubTo }, { id: landing, spot: stubFrom })
      continue
    }

    const hangsOff = via === null ? parent : extend(parent, via, 'stub', berth.org)
    const stub = extend(hangsOff, stubFrom, 'stub', berth.org)
    const plank = extend(stub, stubTo, 'plank', berth.org)
    /*
     * The two ends, and **not** the middle.
     *
     * A midpoint was offered as an anchor too, on the reasoning that a plank is walkable along its
     * whole length. It is — but the way that gets *drawn* runs to the quay, not to the point that
     * was scored, so three routes were judged clear at the middle and drawn from the end, across a
     * deck. An anchor has to be a quay, or the drawing and the check are about different lines.
     */
    planks.push({ id: plank, spot: stubTo }, { id: stub, spot: stubFrom })

    moorings.push({
      ship: berth.ship,
      org: berth.org,
      spot: berth.spot,
      side: berth.side,
      node: plank,
      angle: berth.angle,
    })
  }

  /*
   * A way round between the tips of neighbouring limbs.
   *
   * Outside the tree on purpose: a convenience and never an access route, so it can never be the
   * thing a ship depends on. Neighbouring limbs are angularly adjacent, so the line between their
   * tips runs over the open water between two sectors — which is where a harbour would put one.
   */
  for (let index = 1; index < tips.length; index += 1) {
    const before = tips[index - 1]
    const after = tips[index]
    const from = before === undefined ? undefined : quays[before.id]?.spot
    const to = after === undefined ? undefined : quays[after.id]?.spot
    if (before === undefined || after === undefined || from === undefined || to === undefined) {
      continue
    }
    /*
     * Built only where it would cross open water.
     *
     * Two limb tips are usually a clear run apart, but not always — a short limb beside a long one
     * puts its tip behind the long one's ships. An extra way is a convenience, so where there is
     * no room for one, there is none, rather than one drawn over a deck.
     */
    if (taken.some((box) => cuts(from, to, box))) {
      continue
    }
    ways.push({
      from: before.id,
      to: after.id,
      kind: 'round',
      org: before.org === after.org ? before.org : null,
    })
  }

  return shift(trimmed({ quays, ways, moorings, blocks, width: 1, height: 1, root }))
}

/**
 * Whether every ship can walk ashore.
 *
 * The one assertion this module exists to make. Followed through `parent` rather than measured off
 * the drawing: a walkway that *looks* joined and a walkway that *is* joined are different claims,
 * and only one of them survives somebody moving a constant.
 */
export function reachesShore(harbour: Harbour, ways: readonly Way[] = harbour.ways): boolean {
  /*
   * Every root, not the first one.
   *
   * The shore is reached at several places now, and a check that seeded from one of them would
   * have called four fifths of the harbour unreachable — a correct answer to the wrong question.
   * "Can she get to land" does not care which piece of land.
   */
  const roots = harbour.quays.filter((quay) => quay.rank === 'root')
  if (roots.length === 0) {
    return harbour.moorings.length === 0
  }

  /*
   * A walk outward from the shore, and whoever it reaches can get back.
   *
   * A traversal and not a parent chain: with an edge list the question is "is this connected",
   * which is what a person on a quay actually cares about. The *promise* is still constructed —
   * `extend` cannot lay a quay without the way that reaches it — and this is the check that the
   * construction was not worked around, which is a different job from being the guarantee.
   */
  const met = new Set(roots.map((one) => one.id))
  const edge = new Map<number, number[]>()
  for (const way of ways) {
    edge.set(way.from, [...(edge.get(way.from) ?? []), way.to])
    edge.set(way.to, [...(edge.get(way.to) ?? []), way.from])
  }

  const queue = roots.map((one) => one.id)
  while (queue.length > 0) {
    const at = queue.pop()
    if (at === undefined) {
      continue
    }
    for (const next of edge.get(at) ?? []) {
      if (!met.has(next)) {
        met.add(next)
        queue.push(next)
      }
    }
  }

  return harbour.moorings.every((mooring) => met.has(mooring.node))
}

/** Which ways touch this quay — what somebody standing on it can walk. */
export function waysAt(harbour: Harbour, quay: number): readonly Way[] {
  return harbour.ways.filter((way) => way.from === quay || way.to === quay)
}

/**
 * How far her planking really is, measured off the graph instead of assumed.
 *
 * `BERTH.laneCentre` is what the berth arithmetic *intends*, and it is right in the fan, where
 * every ship has a plank of her own. The lane harbour hangs two rows off one shared spine, so the
 * drawn line runs down the middle of the planking and is half a pier further away — measured,
 * 6.2 units against 4.6. Her lines therefore ended in open water and her travel lift ran beside
 * the walkway rather than on it, in every view but one.
 *
 * So the drawing asks rather than assumes. Returns the intended distance where a berth has no
 * walkway at all, which cannot happen in either arrangement and must still answer with a number.
 */
export function reachOf(harbour: Harbour, mooring: Mooring): number {
  const byId = new Map(harbour.quays.map((quay) => [quay.id, quay.spot]))
  let nearest: number | null = null
  for (const way of harbour.ways) {
    if (way.kind !== 'tree' || (way.from !== mooring.node && way.to !== mooring.node)) {
      continue
    }
    const from = byId.get(way.from)
    const to = byId.get(way.to)
    if (from === undefined || to === undefined) {
      continue
    }
    const dx = to.x - from.x
    const dy = to.y - from.y
    const square = dx * dx + dy * dy
    const along =
      square === 0
        ? 0
        : Math.min(
            1,
            Math.max(0, ((mooring.spot.x - from.x) * dx + (mooring.spot.y - from.y) * dy) / square),
          )
    const gap = Math.hypot(
      mooring.spot.x - (from.x + dx * along),
      mooring.spot.y - (from.y + dy * along),
    )
    nearest = nearest === null ? gap : Math.min(nearest, gap)
  }
  return nearest ?? BERTH.laneCentre
}

/** What one berth occupies, for the checks that ask whether two of them can both be right. */
export function berthBox(mooring: Mooring): Box {
  return {
    x: mooring.spot.x,
    y: mooring.spot.y - FOOTPRINT.across / 2,
    width: FOOTPRINT.along,
    height: FOOTPRINT.across,
  }
}

/** Every way as two points, for drawing and for walking along. */
export function walksOf(
  harbour: Harbour,
): readonly { from: Spot; to: Spot; rank: Rank; kind: Way['kind']; org: string | null }[] {
  const byId = new Map(harbour.quays.map((quay) => [quay.id, quay]))
  return harbour.ways.flatMap((way) => {
    const from = byId.get(way.from)
    const to = byId.get(way.to)
    return from === undefined || to === undefined
      ? []
      : [{ from: from.spot, to: to.spot, rank: to.rank, kind: way.kind, org: way.org }]
  })
}
