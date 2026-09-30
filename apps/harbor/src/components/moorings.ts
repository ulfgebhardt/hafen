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
 * **The walkways are a tree, not a drawing.** Every node names its parent and the root stands on
 * the shore, so "every ship can reach the shore" is true by construction and provable by following
 * parents — not something a renderer happens to achieve and a later change quietly breaks. The
 * extra paths between neighbours (`crossings`) are deliberately outside that tree: nothing depends
 * on them, so adding or dropping one can never strand a ship.
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
 */
export const FAN = 1.4

/** Where the first berth on a limb may stand, and how finely the search steps outward. */
export const REACH = { first: 22, step: 3 } as const

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

/** What one berth takes up: her hull, the apron ahead of her bow, her lane and her caption. */
export const FOOTPRINT = {
  along: BERTH.pitch,
  across: 2 * (BERTH.lane + BERTH.caption * 0.55),
} as const

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
export function inTheWayOf(box: Box, along: Spot, square: Spot): boolean {
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ]
  const sides = corners.map((corner) => Math.sign(corner.x * square.x + corner.y * square.y))
  if (sides.every((one) => one > 0) || sides.every((one) => one < 0)) {
    return false
  }
  return corners.some((corner) => corner.x * along.x + corner.y * along.y > 0)
}

/**
 * A walkway node. `parent` is the one thing that makes this a harbour and not a scatter of piers.
 *
 * `null` only for the root, which stands on the shore. Everything else hangs off something that
 * eventually does, which is what "jedes Boot hat Zugang zum Ufer" means when it is checked rather
 * than hoped for.
 */
export type Rank = 'root' | 'limb' | 'stub' | 'plank'

export interface Node {
  id: number
  parent: number | null
  spot: Spot
  rank: Rank
  /** Which group this piece of walkway serves, for colouring it with their flag. */
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

/** An extra way round, outside the tree. Nothing depends on one. */
export interface Crossing {
  from: Spot
  to: Spot
  /** Both ends belong to the same organisation, which is the denser half of the network. */
  within: boolean
  org: string | null
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
  nodes: readonly Node[]
  moorings: readonly Mooring[]
  crossings: readonly Crossing[]
  blocks: readonly Dock[]
  width: number
  height: number
  /** Where the root stands, so the shore can be drawn behind it. */
  root: Spot
}

const EMPTY: Harbour = {
  nodes: [],
  moorings: [],
  crossings: [],
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
    ...harbour.nodes.map((one) => one.spot.x),
    ...harbour.blocks.map((one) => one.at.x),
    ...harbour.blocks.map((one) => one.at.x + one.width),
  ]
  const ys = [
    ...harbour.nodes.map((one) => one.spot.y),
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
    nodes: harbour.nodes.map((one) => ({ ...one, spot: move(one.spot) })),
    moorings: harbour.moorings.map((one) => ({ ...one, spot: move(one.spot) })),
    crossings: harbour.crossings.map((one) => ({ ...one, from: move(one.from), to: move(one.to) })),
    blocks: harbour.blocks.map((one) => ({ ...one, at: move(one.at) })),
    width: Math.max(...xs) + dx + QUAY + MARGIN.x,
    height: Math.max(...ys) + dy + QUAY + MARGIN.y,
    root: move(harbour.root),
  }
}

/**
 * Lay the fleet out as a fan, then hang the walkways off the shore.
 *
 * Groups arrive biggest-first from `fleetlets` and are dealt into sectors from the middle outward,
 * so the largest dock lies straight ahead of the root and the singletons take the shallow angles
 * at the top and bottom. Dealt from the middle because the middle of a fan is where there is most
 * room, and that is where an eighteen-ship dock has to go.
 */
export function harbourOf(groups: readonly Fleetlet[]): Harbour {
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

  const nodes: Node[] = []
  const moorings: Mooring[] = []
  const crossings: Crossing[] = []
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
   * Ends *and* middles: an end is often round the wrong side of a neighbour, and a plank is
   * walkable along its whole length, so its middle is a real place to branch from. With ends
   * alone one berth in sixty-four had nowhere clear to attach.
   */
  const planks: { id: number; spot: Spot }[] = []

  const root: Spot = { x: 0, y: 0 }
  nodes.push({ id: 0, parent: null, spot: root, rank: 'root', org: null })

  /*
   * Every limb's bearing, worked out before a single berth is placed.
   *
   * Needed up front because a berth has to clear *all* of them, not just her own: the first pass
   * kept each ship off her own limb and four of them still ended up under a neighbour's, which a
   * limb-by-limb check can never see. The angles are a function of the sectors alone, so they can
   * be known before anything is placed — which is the only reason this works.
   */
  const bearings: number[] = []
  let sweep = -FAN
  for (const index of order) {
    const share = shares[index] ?? 0
    bearings.push(sweep + share * FAN)
    sweep += share * 2 * FAN
  }
  const rays = bearings.map((angle) => ({
    along: { x: Math.cos(angle), y: Math.sin(angle) },
    square: { x: -Math.sin(angle), y: Math.cos(angle) },
  }))

  let edge = -FAN
  const tips: { id: number; org: string }[] = []

  for (const index of order) {
    const group = groups[index]
    const share = shares[index]
    if (group === undefined || share === undefined) {
      continue
    }
    const angle = edge + (share * 2 * FAN) / 2
    edge += share * 2 * FAN

    const along = { x: Math.cos(angle), y: Math.sin(angle) }
    const square = { x: -Math.sin(angle), y: Math.cos(angle) }

    const clearance = clearanceOn(square)
    let reach: number = REACH.first
    let onLimb = 0
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
            const centre = {
              x: along.x * radius + square.x * side * off,
              y: along.y * radius + square.y * side * off,
            }
            const box: Box = {
              x: centre.x - FOOTPRINT.along / 2,
              y: centre.y - FOOTPRINT.across / 2,
              width: FOOTPRINT.along,
              height: FOOTPRINT.across,
            }
            if (taken.some((one) => overlaps(box, one))) {
              continue
            }
            if (rays.some((ray) => inTheWayOf(box, ray.along, ray.square))) {
              continue
            }
            taken.push(box)
            mine.push(box)
            placed = {
              // `vessel.ts` draws from the stern: she starts at the landward end of her berth.
              spot: { x: box.x, y: centre.y },
              side,
              at: { x: along.x * radius, y: along.y * radius },
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
      const limb = nodes.length
      nodes.push({ id: limb, parent: onLimb, spot: placed.at, rank: 'limb', org: group.org })
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
    const anchors = [
      ...nodes.filter((one) => one.org === berth.org && one.rank === 'limb'),
      ...planks,
    ]
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
      .slice(0, 24)

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
          const legs: readonly (readonly [Spot, Spot])[] =
            corner === null
              ? [[anchor.spot, head]]
              : [
                  [anchor.spot, corner],
                  [corner, head],
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

    let hangsOff = parent
    if (via !== null) {
      const corner = nodes.length
      nodes.push({ id: corner, parent, spot: via, rank: 'stub', org: berth.org })
      hangsOff = corner
    }
    const stub = nodes.length
    nodes.push({ id: stub, parent: hangsOff, spot: stubFrom, rank: 'stub', org: berth.org })
    const plank = nodes.length
    nodes.push({ id: plank, parent: stub, spot: stubTo, rank: 'plank', org: berth.org })
    planks.push(
      { id: plank, spot: stubTo },
      { id: stub, spot: stubFrom },
      { id: plank, spot: { x: (stubFrom.x + stubTo.x) / 2, y: stubFrom.y } },
    )

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
    const from = before === undefined ? undefined : nodes[before.id]?.spot
    const to = after === undefined ? undefined : nodes[after.id]?.spot
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
    crossings.push({
      from,
      to,
      within: before.org === after.org,
      org: before.org === after.org ? before.org : null,
    })
  }

  return shift({ nodes, moorings, crossings, blocks, width: 1, height: 1, root })
}

/**
 * Whether every ship can walk ashore.
 *
 * The one assertion this module exists to make. Followed through `parent` rather than measured off
 * the drawing: a walkway that *looks* joined and a walkway that *is* joined are different claims,
 * and only one of them survives somebody moving a constant.
 */
export function reachesShore(harbour: Harbour): boolean {
  const byId = new Map(harbour.nodes.map((node) => [node.id, node]))

  const ashore = (start: number): boolean => {
    let at = start
    // Bounded by the node count: a cycle would otherwise hang the window rather than fail a test.
    for (let step = 0; step <= harbour.nodes.length; step += 1) {
      const node = byId.get(at)
      if (node === undefined) {
        return false
      }
      if (node.parent === null) {
        return node.rank === 'root'
      }
      at = node.parent
    }
    return false
  }

  return harbour.moorings.every((mooring) => ashore(mooring.node))
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

/** The walkway segments, one per node that has a parent. For drawing only. */
export function walksOf(
  harbour: Harbour,
): readonly { from: Spot; to: Spot; rank: Rank; org: string | null }[] {
  const byId = new Map(harbour.nodes.map((node) => [node.id, node]))
  return harbour.nodes.flatMap((node) => {
    const parent = node.parent === null ? undefined : byId.get(node.parent)
    return parent === undefined
      ? []
      : [{ from: parent.spot, to: node.spot, rank: node.rank, org: node.org }]
  })
}
