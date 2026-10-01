/**
 * A kindred as a **basin**: her repositories on a hexagonal lattice round an empty middle.
 *
 * The third arrangement, and the first whose unit is not an organisation. Lanes pack docks into
 * rows and the fan gave each dock a wedge; both answer "whose is this". A basin answers the
 * question `kin.ts` made askable — *which repositories are the same project* — by drawing the
 * fourteen Ocelot-Social repositories as one ring round one centre instead of as fourteen entries
 * in a list sorted by owner.
 *
 * **A hexagon, and the lattice edges are the walkways.** Two earlier shapes failed, and both for
 * the same reason: they drew a ring and then had to invent a way network for it. An ellipse built
 * out of rows left the middle open only where a row happened to fall, and its planks were still
 * rows of planking with the ring merely implied. On a hex lattice a ring *is* a ring — ring `k`
 * holds exactly `6k` cells all the same distance from the middle — and every cell has six
 * neighbours, so the ways are not designed at all: they are the edges between berths that happen
 * to be next to each other.
 *
 * **Stretched, because a ship is not round.** A hull is drawn axis-aligned — `scene.ts` sets
 * `body.rotation` from `yawOf` alone, a degree or two of list — so a berth is four times wider
 * than it is deep. The lattice is stretched to match: a column is one berth pitch, a row is half a
 * block, and odd rows are offset by half a pitch. That is a hexagonal lattice in every way that
 * matters here (six neighbours, rings of `6k`) drawn on cells the shape of the thing standing in
 * them.
 *
 * Nothing is searched and nothing has to be checked afterwards: two ships are in two cells, and
 * two cells are a pitch apart.
 */

import { NO_ORG } from './flags'
import { GAP, TRUNK_X } from './lanes'
import { MARGIN, QUAY, trimmed } from './moorings'
import { BERTH, BLOCK } from './plan'

import type { Fleetlet } from './flags'
import type { Dock, Harbour, Mooring, Quay, Rank, Way } from './moorings'
import type { Side, Spot } from './plan'
import type { Ship } from '@hafen/core'

/** One cell of the lattice, in axial coordinates with the middle of its basin at the origin. */
export interface Cell {
  q: number
  r: number
}

/** How far a cell is from the middle — which ring it is on. */
export function ringOf(cell: Cell): number {
  return (Math.abs(cell.q) + Math.abs(cell.q + cell.r) + Math.abs(cell.r)) / 2
}

/**
 * The six directions on the lattice, in a fixed order.
 *
 * Fixed because the order decides where the second ship of a ring stands, and a basin that dealt
 * them differently between two draws would be a picture that moved without anything being
 * measured. East first, so a ring begins beside the name rather than above it.
 */
export const STEPS: readonly Cell[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
]

/**
 * The cells of ring `k`, walked once round.
 *
 * `6k` of them, which is the property the whole shape rests on: a ring is a ring, not an ellipse
 * approximated by rows. Ring nought is the middle itself and holds no ship — the kindred's name
 * goes there, and a ring whose middle were full would need its name outside it, where a label
 * belongs to whichever shape the eye picks.
 */
export function ringCells(k: number): readonly Cell[] {
  if (k <= 0) {
    return []
  }
  const cells: Cell[] = []
  // Start on the ring's east side, then walk the six sides of the hexagon.
  let at: Cell = { q: k, r: 0 }
  for (let side = 0; side < 6; side += 1) {
    // The side that walks *away* from where the ring was entered, which is two steps round.
    const step = STEPS[(side + 2) % 6] ?? STEPS[0]
    for (let along = 0; along < k; along += 1) {
      cells.push(at)
      at = { q: at.q + (step?.q ?? 0), r: at.r + (step?.r ?? 0) }
    }
  }
  return cells
}

/**
 * Which ring a basin starts on — how big the eye is.
 *
 * It was always one, and that is a hole of a single cell: on a kindred of forty-five it came out
 * as a blob with a dent, because four rings round one empty cell is a disc. The eye has to grow
 * with the basin or the shape stops being a ring at the size where a ring is worth drawing.
 *
 * Half the root of the count: it leaves roughly as much open water in the middle as there is
 * occupied ring round it, at every size. Measured on this fleet — 45 ships start on ring 3 and
 * fill three rings, 15 start on 2, 9 on 2, 3 on 1, and a kindred of one is one ship beside a name.
 */
export function eyeFor(count: number): number {
  // A ring of one or two is not a ring. They stand in the middle, and their name goes above them
  // like any other dock's — an eye kept clear for two ships would be a hole with nothing round it.
  return count <= 2 ? 0 : Math.max(1, Math.round(Math.sqrt(count) / 2))
}

/**
 * Where a kindred's ships stand: outward, ring by ring, leaving the eye clear.
 *
 * A part-filled outer ring is left part-filled rather than spread over two: a ring that is
 * obviously the newest is a reading — this project grew last — and a ring thinned out to look
 * tidy would be the drawing arranging the measurement.
 */
export function cellsFor(count: number): readonly Cell[] {
  if (count <= 0) {
    return []
  }
  const eye = eyeFor(count)
  const cells: Cell[] = eye === 0 ? [{ q: 0, r: 0 }] : []
  for (let ring = Math.max(1, eye); cells.length < count; ring += 1) {
    cells.push(...ringCells(ring).slice(0, count - cells.length))
  }
  return cells
}

/**
 * The water between two berths, as a multiple of what they strictly need.
 *
 * At exactly one pitch and half a block, neighbouring hulls touch: the lattice was tight enough
 * that the ring read as a raft rather than as ships lying at their own berths. There has to be
 * visible water between two of them or "these are ninety-two separate repositories" is something
 * the picture contradicts.
 *
 * Across more than along, because that is where it was worse: a column already carries a whole
 * caption between two hulls, and a row carried only the plank.
 */
export const SLACK = { along: 1.3, across: 1.5 } as const

/**
 * How far apart two cells stand, in world units.
 *
 * A column is one berth pitch; a row is half a block, which is exactly what a plank, a lane of
 * water and a caption need — then both are opened up by `SLACK`. Odd rows are offset by half a
 * pitch, which is what makes the lattice hexagonal rather than square.
 */
export const LATTICE = {
  along: BERTH.pitch * SLACK.along,
  across: (BLOCK / 2) * SLACK.across,
} as const

/** A cell's middle, in the basin's own coordinates. */
export function spotOf(cell: Cell): Spot {
  return { x: (cell.q + cell.r / 2) * LATTICE.along, y: cell.r * LATTICE.across }
}

/** A basin laid out: which cell each ship stands in, and how much room the whole thing takes. */
export interface Basin {
  cells: readonly Cell[]
  width: number
  height: number
  /** The middle, as an offset from the top-left of the basin's own box. */
  middle: Spot
  /**
   * Where the name goes, as the same kind of offset.
   *
   * In the eye where there is one, and above the box where there is not — a basin of one or two
   * has no middle to keep clear, and a name written over its only ship is a name nobody can read.
   */
  label: Spot
}

export function basinOf(count: number): Basin {
  const cells = cellsFor(count)
  if (cells.length === 0) {
    return { cells, width: 1, height: 1, middle: { x: 0, y: 0 }, label: { x: 0, y: 0 } }
  }
  const spots = cells.map((cell) => spotOf(cell))
  // A berth stands *from* her spot, so her box reaches a pitch to the east and a row down.
  const left = Math.min(...spots.map((spot) => spot.x)) - LATTICE.along / 2
  const right = Math.max(...spots.map((spot) => spot.x)) + LATTICE.along / 2
  const top = Math.min(...spots.map((spot) => spot.y))
  const foot = Math.max(...spots.map((spot) => spot.y)) + LATTICE.across
  const middle = { x: -left, y: -top }
  return {
    cells,
    width: right - left,
    height: foot - top,
    middle,
    label: eyeFor(count) === 0 ? { x: middle.x, y: -6 } : middle,
  }
}

/**
 * The kindreds of this fleet, each with every ship that belongs to it.
 *
 * Groups arrive already ordered kindred-first from `fleetlets`, so collecting them in arrival
 * order keeps an organisation's ships together on the ring: the basin is the project, and the
 * owners are still readable as runs round it.
 */
export function kindredsOf(groups: readonly Fleetlet[]): readonly Kindred[] {
  const byName = new Map<string, Kindred>()
  for (const group of groups) {
    const held = byName.get(group.kindred)
    byName.set(group.kindred, {
      name: group.kindred,
      orgs: [...(held?.orgs ?? []), group.org],
      ships: [...(held?.ships ?? []), ...group.ships],
    })
  }
  return [...byName.values()]
}

/** One project's worth of repositories, however many organisations they are filed under. */
export interface Kindred {
  name: string
  orgs: readonly string[]
  ships: readonly Ship[]
}

/**
 * The ranks a basin harbour uses, mapped onto the shared four.
 *
 * The same four jobs in the same order as the fan's root/limb/stub/plank, so the drawing asks
 * "how wide is this and whose is it" once. A third vocabulary for a third arrangement would be
 * three answers to one question.
 */
const AS: Record<'trunk' | 'spur' | 'edge', Rank> = {
  trunk: 'limb',
  spur: 'stub',
  edge: 'plank',
}

/** The candidate widths a layout is searched over, as a count of the widest basin. */
const LANES = [1, 2, 3, 4, 5]

/**
 * How far a basin's neighbour may stand inside its box.
 *
 * A ring is round and its box is not, so the four corners of every basin are open water. Packing
 * the boxes edge to edge therefore left a gap between two rings the width of two empty corners —
 * the picture had its ships crowded round their own middles and a channel of nothing between the
 * kindreds, which reads as the space meaning something. It does not.
 *
 * The boxes are allowed to nest instead, and the amount is measured rather than chosen: at this
 * share no two berths of neighbouring basins overlap on the fleet this was built for, and the
 * test says so rather than the eye.
 */
const NEST = 0.78

/**
 * Every berth's plank is on the same side of her.
 *
 * The lattice gives each cell a mooring post at its own middle and the hull hangs below it. Facing
 * the planks outward from the ring would read better and is not safe: rows are half a block apart,
 * which holds one plank, one lane and one caption, and a row whose caption lands where the row
 * below wants its plank is two things in one place.
 */
const SIDE: Side = 1

function lay(kindreds: readonly Kindred[], basins: readonly Basin[], room: number): Harbour {
  const left = MARGIN.x + QUAY + GAP.x
  const quays: Quay[] = []
  const ways: Way[] = []
  const moorings: Mooring[] = []
  const blocks: Dock[] = []

  quays.push({ id: 0, spot: { x: TRUNK_X, y: MARGIN.y }, rank: 'root', org: null })

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
  let far = left

  kindreds.forEach((kindred, index) => {
    const basin = basins[index]
    if (basin === undefined || basin.cells.length === 0) {
      return
    }

    if (x !== left && x + basin.width > left + room) {
      x = left
      y = laneTop + laneHeight * NEST + GAP.y
      laneTop = y
      laneHeight = 0
    }
    const west = x
    const top = y
    const org = kindred.orgs[0] ?? null

    /*
     * One node down the shore for this basin, and one spur from it.
     *
     * The trunk is a chain along the quay so every spur leaves it at its own depth: a single node
     * with spurs fanning out of it would run each of them diagonally across whatever lies between.
     */
    lastTrunk = extend(lastTrunk, { x: TRUNK_X, y: top }, 'trunk', null)

    /*
     * A mooring post per cell, and a **way per lattice edge**.
     *
     * This is the part the hexagon was chosen for. Nothing here decides where a walkway goes: two
     * berths that are neighbours on the lattice are joined, and that is the whole network. The
     * first edge to reach a cell is its `tree` way — so the graph is spanning by construction, in
     * the order the cells are dealt, which is outward from the middle — and every further edge is
     * a `round` way, an extra path that nothing depends on.
     */
    const post = new Map<string, number>()
    const key = (cell: Cell): string => `${String(cell.q)}.${String(cell.r)}`
    const at = (cell: Cell): Spot => {
      const spot = spotOf(cell)
      return { x: west + basin.middle.x + spot.x, y: top + basin.middle.y + spot.y }
    }

    basin.cells.forEach((cell, index2) => {
      const ship = kindred.ships[index2]
      if (ship === undefined) {
        return
      }
      const spot = at(cell)
      let node = post.get(key(cell))
      if (node === undefined) {
        const joined = STEPS.map((step) =>
          post.get(key({ q: cell.q + step.q, r: cell.r + step.r })),
        ).filter((one): one is number => one !== undefined)
        node =
          joined[0] !== undefined
            ? extend(joined[0], spot, 'edge', org)
            : extend(lastTrunk, spot, 'spur', org)
        post.set(key(cell), node)
        // Every other neighbour already standing is an extra way round.
        for (const other of joined.slice(1)) {
          ways.push({ from: other, to: node, kind: 'round', org })
        }
      }

      moorings.push({
        ship,
        org: ship.org === '' ? NO_ORG : ship.org,
        spot: { x: spot.x - BERTH.pitch / 2, y: spot.y + SIDE * BERTH.laneCentre },
        side: SIDE,
        node,
        angle: 0,
      })
    })

    blocks.push({
      org: kindred.name,
      at: { x: west, y: top },
      width: basin.width,
      height: basin.height,
      angle: 0,
      // In the eye, which is what the eye is kept clear for: the ring is the project, the name
      // is its. A basin too small to have an eye says so and puts its name above itself.
      label: { x: west + basin.label.x, y: top + basin.label.y },
    })

    x += basin.width * NEST + GAP.x
    far = Math.max(far, west + basin.width)
    laneHeight = Math.max(laneHeight, basin.height)
  })

  return trimmed({
    quays,
    ways,
    moorings,
    blocks,
    width: Math.max(1, far + MARGIN.x),
    height: Math.max(1, laneTop + laneHeight + GAP.y + MARGIN.y),
    root: { x: TRUNK_X, y: MARGIN.y },
  })
}

/**
 * The fleet as basins: one ring per project, packed.
 *
 * The same contract the other arrangements meet — quays, ways, moorings, blocks — so everything
 * downstream of the layout is written once and knows nothing about which of them drew it.
 */
export function harbourOf(groups: readonly Fleetlet[], aspect = 16 / 9): Harbour {
  const kindreds = kindredsOf(groups)
  const basins = kindreds.map((kindred) => basinOf(kindred.ships.length))
  if (basins.length === 0) {
    return lay([], [], 1)
  }

  const widest = Math.max(...basins.map((one) => one.width))
  let best = lay(kindreds, basins, widest)
  let closest = Number.POSITIVE_INFINITY
  for (const lanes of LANES) {
    const laid = lay(kindreds, basins, lanes * (widest + GAP.x))
    const off = Math.abs(laid.width / laid.height - aspect)
    if (off < closest) {
      closest = off
      best = laid
    }
  }
  return best
}
