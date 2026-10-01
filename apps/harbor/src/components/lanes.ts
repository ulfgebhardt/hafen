/**
 * The harbour in lanes: docks packed edge to edge, walkways at right angles.
 *
 * The **second** of the two arrangements this window offers, kept rather than replaced. It packs
 * far tighter than the fan — measured, 49 ships in 505 × 295 against 558 × 618 — because a
 * rectangle wastes nothing and a wedge wastes its middle. What it cannot do is let a walkway run
 * at an angle: with blocks edge to edge, any diagonal crosses the block between its ends.
 *
 * So the two answer different questions and both are worth having. This one asks "what is on this
 * page, laid out as small as it will go"; the fan asks "what does the fleet look like, grouped by
 * who owns it". Neither is a draft of the other.
 *
 * It emits the same graph as `moorings.ts` — quays and ways — so everything downstream of the
 * layout is written once.
 *
 * This replaced the full-width piers. Those laid ninety hulls on a ruled grid, which answered
 * "how many" and nothing else — a repository's neighbours were whoever happened to sort next to
 * it. Here the fleet is grouped by organisation, and the harbour is built *around* the groups:
 * land along the west and south, one trunk walkway on the quay, a branch out to each group, and
 * inside a group a spine per row of berths.
 *
 * **The walkways are a tree, not a drawing.** Every node names its parent and the root stands on
 * the quay, so "every ship can reach the shore" is true by construction and provable by following
 * parents — not something a renderer happens to achieve and a later change quietly breaks. The
 * extra paths *between* neighbours (`crossings`) are deliberately outside that tree: they are
 * additional ways round, and nothing depends on them, so adding or dropping one can never strand
 * a ship.
 *
 * The berth arithmetic inside a group is the old one, unchanged and re-used (`BERTH`, `BLOCK`,
 * `contentHeight`, the alternating `Side`). That is what keeps `vessel.ts` — hull, cargo, crates,
 * gangway, the mark placement and every hit test — working without knowing any of this happened.
 */

import { MARGIN, QUAY, trimmed } from './moorings'
import { BERTH, BLOCK, contentHeight, rowsAt } from './plan'

import type { Fleetlet } from './flags'
import type { Dock, Harbour, Mooring, Quay, Rank, Way } from './moorings'
import type { Side, Spot } from './plan'

/** Water between two docks. */
export const GAP = { x: 11, y: 9 } as const

/** Where the trunk runs: the middle of the west quay, from the north end down to the south one. */
export const TRUNK_X = MARGIN.x + QUAY / 2

/** The shape a group's block is laid out towards. Slightly wide, because a berth is wide. */
export const BLOCK_ASPECT = 1.35

/**
 * How many berths stand side by side in one group.
 *
 * Searched and not estimated, for the reason the old `columnsFor` gives: the arithmetic that
 * turns rows into height is not a constant times the row count — an odd row ends half a block —
 * so a closed form drifts. Nine multiplications per group cannot be wrong about themselves.
 */
export function columnsIn(count: number): number {
  if (count <= 1) {
    return 1
  }
  let best = 1
  let closest = Number.POSITIVE_INFINITY
  for (let columns = 1; columns <= count; columns += 1) {
    const width = columns * BERTH.pitch
    const height = contentHeight(rowsAt(count, columns))
    const off = Math.abs(width / height - BLOCK_ASPECT)
    if (off < closest) {
      closest = off
      best = columns
    }
  }
  return best
}

export interface Block {
  org: string
  columns: number
  rows: number
  width: number
  height: number
}

export function blockOf(group: Fleetlet): Block {
  const columns = columnsIn(group.ships.length)
  const rows = rowsAt(group.ships.length, columns)
  return {
    org: group.org,
    columns,
    rows,
    width: columns * BERTH.pitch,
    height: contentHeight(rows),
  }
}

/**
 * A walkway node. `parent` is the one thing that makes this a harbour and not a scatter of piers.
 *
 * `null` only for the root, which stands on the quay. Everything else hangs off something that
 * eventually does, which is what "jedes Boot hat Zugang zum Ufer" means when it is checked rather
 * than hoped for.
 */
/**
 * The ranks a lane harbour uses, mapped onto the shared four.
 *
 * `moorings.ts` names them for a fan — root, limb, stub, plank — and a lane harbour has a trunk,
 * an avenue, a riser and a spine. They are the same four jobs in the same order, so they share the
 * vocabulary rather than doubling it: the drawing asks "how wide is this and whose is it", and
 * that question has one answer for both layouts.
 */
const AS: Record<'trunk' | 'avenue' | 'riser' | 'spine', Rank> = {
  trunk: 'limb',
  avenue: 'limb',
  riser: 'stub',
  spine: 'plank',
}

/** The candidate widths a layout is searched over, as a count of the widest group's blocks. */
const LANES = [1, 2, 3, 4, 5, 6]

function layout(groups: readonly Fleetlet[], blocks: readonly Block[], room: number): Harbour {
  const left = MARGIN.x + QUAY + GAP.x
  const quays: Quay[] = []
  const ways: Way[] = []
  const moorings: Mooring[] = []
  const placed: (Block & { at: Spot; label: Spot })[] = []

  /** The root stands on the quay, and it is the only node with no parent. */
  quays.push({ id: 0, spot: { x: TRUNK_X, y: MARGIN.y }, rank: 'root', org: null })

  /**
   * Lay a quay and the way that reaches it, in one act.
   *
   * The same helper the fan uses, and for the same reason: a quay added without a way to an
   * already-reachable one is a quay nobody can get to, and there would be no moment at which that
   * is obvious. Here it cannot be written.
   */
  const extend = (from: number, spot: Spot, rank: keyof typeof AS, org: string | null): number => {
    const id = quays.length
    quays.push({ id, spot, rank: AS[rank], org })
    ways.push({ from, to: id, kind: 'tree', org })
    return id
  }

  let x = left
  let y = MARGIN.y + GAP.y
  let laneTop = y
  let laneHeight = 0
  let lastTrunk = 0
  let avenue = 0
  const laneStubs: { id: number; org: string }[] = []

  /*
   * A lane gets an avenue before anything hangs off it.
   *
   * The first arrangement ran each group's branch straight from the quay to the middle of its
   * block, and on a two-lane harbour those diagonals crossed the blocks in between — a walkway
   * drawn over somebody else's ships. The tree is orthogonal now: down the quay, out along the
   * gap *above* a lane, then down the gap *beside* a group. None of the three bands holds a hull,
   * so no plank is ever drawn over one.
   *
   * Right angles are a legibility choice and not a rule: the extra ways round below are diagonal
   * on purpose, because nothing depends on them and they are what makes the network look grown
   * rather than ruled.
   */
  const openLane = (): void => {
    const onTrunk = extend(lastTrunk, { x: TRUNK_X, y: y - GAP.y / 2 }, 'trunk', null)
    lastTrunk = onTrunk
    avenue = onTrunk
  }

  const closeLane = (): void => {
    /*
     * Neighbours in a lane get a way to each other along the lane's southern edge.
     *
     * Straight from riser to riser at first, and that was wrong for a reason only the drawing
     * showed: two risers stand at different depths, so the line between them ran diagonally across
     * whichever block lay in between — a walkway over somebody else's ships. It runs in the gap
     * under the lane now, which is open water by construction.
     *
     * Outside the tree on purpose: it is a convenience and never an access route, so it can never
     * be the thing a ship depends on. Between two different organisations it is still drawn — the
     * quays of a real harbour are not fenced off from one another either.
     */
    const along = laneTop + laneHeight + GAP.y / 2
    for (let index = 1; index < laneStubs.length; index += 1) {
      const before = laneStubs[index - 1]
      const after = laneStubs[index]
      if (before === undefined || after === undefined) {
        continue
      }
      const from = quays[before.id]?.spot
      const to = quays[after.id]?.spot
      if (from !== undefined && to !== undefined) {
        /*
         * A way round along the lane's southern edge, and it needs two corners of its own.
         *
         * The risers it joins stand at different depths, so the line between them would run
         * diagonally across whichever block lies between. Down, across, up: three ways in the gap
         * under the lane, which is open water by construction.
         */
        const west = quays.length
        quays.push({ id: west, spot: { x: from.x, y: along }, rank: 'stub', org: before.org })
        const east = quays.length
        quays.push({ id: east, spot: { x: to.x, y: along }, rank: 'stub', org: after.org })
        const shared = before.org === after.org ? before.org : null
        ways.push(
          { from: before.id, to: west, kind: 'round', org: before.org },
          { from: west, to: east, kind: 'round', org: shared },
          { from: east, to: after.id, kind: 'round', org: after.org },
        )
      }
    }
    laneStubs.length = 0
  }

  groups.forEach((group, index) => {
    const block = blocks[index]
    if (block === undefined) {
      return
    }

    if (x === left) {
      openLane()
    } else if (x + block.width > left + room) {
      closeLane()
      x = left
      y = laneTop + laneHeight + GAP.y
      laneTop = y
      laneHeight = 0
      openLane()
    }

    /*
     * Out along the avenue to this group, then down the gap beside its block.
     *
     * Two nodes and not one, so the corner is a real place: the avenue carries the whole lane and
     * the riser carries one organisation, and drawing them at different weights is the difference
     * between a harbour and a diagram.
     */
    const corner = extend(avenue, { x: x - GAP.x / 2, y: y - GAP.y / 2 }, 'avenue', null)

    laneStubs.push({ id: corner, org: group.org })

    /*
     * One spine per pier inside the group, and the berths hang off it exactly as before.
     *
     * Every spine's parent is the group's stub, so the group is a fan and not a chain: losing one
     * spine cannot strand the rows below it. Rows come in pairs around a spine — that is the whole
     * point of the old block arithmetic, and it is kept.
     */
    /*
     * The riser is a **chain** down the gap, and each spine leaves it at its own depth.
     *
     * One riser node at the foot of the block was enough to connect everything and looked wrong
     * in a way no test saw: every spine edge then ran from that one foot to its own pier, which is
     * a diagonal straight across the block — the tree drawing walkways over other people's ships,
     * while the check that was supposed to catch that only looked at the *extra* ways. It looks at
     * both now.
     *
     * A node per pier costs four numbers and makes every segment either vertical or horizontal,
     * which is also what a real quay is.
     */
    const spines: number[] = []
    const piers = Math.floor(block.rows / 2) + 1
    let onRiser = corner
    for (let pier = 0; pier < piers; pier += 1) {
      const level = y + pier * BLOCK + BERTH.pier / 2
      const step = extend(onRiser, { x: x - GAP.x / 2, y: level }, 'riser', group.org)
      onRiser = step

      // The spine runs the whole length of the planking, not to its middle: the far end is also
      // where the second way down the dock attaches.
      spines.push(extend(step, { x: x + block.width, y: level }, 'spine', group.org))
    }

    /*
     * The denser half of the network: a second way down the group, along its eastern edge.
     *
     * Joining the spines straight to each other ran the line down the middle of the block and
     * across every row in it. Down the far gap it crosses nothing, and it is what a real quay of
     * this shape has — a way in at each end, so one blocked pier does not shut the dock.
     */
    const far = x + block.width + GAP.x / 2
    for (let pier = 1; pier < spines.length; pier += 1) {
      const before = spines[pier - 1]
      const after = spines[pier]
      const from = before === undefined ? undefined : quays[before]?.spot
      const to = after === undefined ? undefined : quays[after]?.spot
      if (before === undefined || after === undefined || from === undefined || to === undefined) {
        continue
      }
      // A second way down the dock along its eastern edge, so one blocked pier does not shut it.
      const north = quays.length
      quays.push({ id: north, spot: { x: far, y: from.y }, rank: 'stub', org: group.org })
      const south = quays.length
      quays.push({ id: south, spot: { x: far, y: to.y }, rank: 'stub', org: group.org })
      ways.push(
        { from: before, to: north, kind: 'round', org: group.org },
        { from: north, to: south, kind: 'round', org: group.org },
        { from: south, to: after, kind: 'round', org: group.org },
      )
    }

    group.ships.forEach((ship, seat) => {
      const column = seat % block.columns
      const row = Math.floor(seat / block.columns)
      const top = y + Math.floor(row / 2) * BLOCK
      const side: Side = row % 2 === 0 ? 1 : -1
      /*
       * Which pier she actually lies against, and it is **not** `row / 2`.
       *
       * An even row lies south of its own pier; an odd row lies *north of the next one*. Half the
       * fleet was therefore filed against a pier it does not touch — invisible, because any spine
       * reaches the shore and the connectivity check passed regardless. That is exactly the kind
       * of wrong a structural test does not catch on its own, so it now has a test of its own.
       */
      const node = spines[Math.floor((row + 1) / 2)] ?? corner

      moorings.push({
        ship,
        org: group.org,
        side,
        node,
        // A lane harbour has no bearing: every ship lies on an east–west spine, so zero is the
        // truth here and not a placeholder.
        angle: 0,
        spot: {
          x: x + column * BERTH.pitch,
          y: side === 1 ? top + BERTH.pier + BERTH.laneCentre : top + BLOCK - BERTH.laneCentre,
        },
      })
    })

    placed.push({ ...block, at: { x, y }, label: { x: x + block.width / 2, y: y - 6 } })
    laneHeight = Math.max(laneHeight, block.height)
    x += block.width + GAP.x
  })

  closeLane()

  const width = Math.max(...placed.map((one) => one.at.x + one.width), MARGIN.x + QUAY) + GAP.x
  const height = Math.max(...placed.map((one) => one.at.y + one.height), MARGIN.y) + QUAY + GAP.y

  // Durch dieselbe Schere wie der Faecher: ein Steg, der im Wasser endet, ist in beiden
  // Anordnungen dieselbe Luege. Hier faellt heute nichts weg, und genau das soll so bleiben.
  return trimmed({
    quays,
    ways,
    moorings,
    blocks: placed.map((one): Dock => ({ ...one, angle: 0 })),
    width,
    height,
    root: { x: TRUNK_X, y: MARGIN.y },
  })
}

/**
 * Lay the groups out in lanes, then hang the walkways off the quay.
 *
 * Groups arrive biggest-first from `fleetlets`, and they are placed in that order: the eighteen
 * lie nearest the root, the singletons furthest out. A harbour that put the big group at the far
 * end would spend the whole picture getting there.
 */
export function harbourOf(groups: readonly Fleetlet[], aspect = 16 / 9): Harbour {
  const blocks = groups.map((group) => blockOf(group))
  if (blocks.length === 0) {
    return {
      quays: [],
      ways: [],
      moorings: [],
      blocks: [],
      width: 1,
      height: 1,
      root: { x: 0, y: 0 },
    }
  }

  const widest = Math.max(...blocks.map((one) => one.width))
  let best = layout(groups, blocks, widest + GAP.x)
  let closest = Number.POSITIVE_INFINITY
  for (const lanes of LANES) {
    const laid = layout(groups, blocks, lanes * (widest + GAP.x))
    const off = Math.abs(laid.width / laid.height - aspect)
    if (off < closest) {
      closest = off
      best = laid
    }
  }
  return best
}

/*
 * `reachesShore`, `waysAt` and `walksOf` are not repeated here.
 *
 * They read a `Harbour`, and a `Harbour` is a `Harbour` whichever layout made it — which is the
 * point of both of them emitting one graph. Two copies of a reachability check is two chances to
 * have a different opinion about whether a ship can get ashore.
 */
