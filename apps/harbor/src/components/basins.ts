/**
 * A kindred as a **basin**: her repositories on a hexagonal lattice round an empty middle.
 *
 * The third arrangement, and the first whose unit is not an organisation. Lanes pack docks into
 * rows and the fan gave each dock a wedge; both answer "whose is this". A basin answers the
 * question `kin.ts` made askable — *which repositories are the same project* — by drawing the
 * fourteen Leuchtturm repositories as one ring round one centre instead of as fourteen entries
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

import { familiesOf, shipPoints } from '@hafen/core'

import { NO_ORG } from './flags'
import { GAP, TRUNK_X } from './lanes'
import { MARGIN, QUAY, trimmed } from './moorings'
import { BERTH, BLOCK } from './plan'

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
 * Where a kindred's ships stand: from the middle outward, ring by ring.
 *
 * **The middle is a berth, not a hole.** It was kept clear for the kindred's name at first, and
 * the eye grew with the basin so the shape stayed a ring — which made every basin a wide donut
 * with its ships pushed to the rim. That is the opposite of what the middle of a project looks
 * like: the heart of one is where the work is, and it is crowded. The name moved above the basin,
 * where every other dock in this window carries its own.
 *
 * Which ship lands where is `kindredsOf`: nearest the middle is the one somebody touched last. So
 * the radius is a reading rather than the order the repositories happened to be filed in.
 *
 * A part-filled outer ring is left part-filled rather than spread over two: a ring that is
 * obviously the newest is a reading — this project grew last — and a ring thinned out to look
 * tidy would be the drawing arranging the measurement.
 */
export function cellsFor(count: number): readonly Cell[] {
  if (count <= 0) {
    return []
  }
  const cells: Cell[] = [{ q: 0, r: 0 }]
  for (let ring = 1; cells.length < count; ring += 1) {
    cells.push(...ringCells(ring).slice(0, count - cells.length))
  }
  return cells.slice(0, count)
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
   * Above the basin, because the middle is a berth: it held the name while the eye was kept
   * clear, and keeping an eye clear is exactly what stopped the heart of a project from looking
   * like one.
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
    label: { x: middle.x, y: -6 },
  }
}

/**
 * How long a ship has lain, for sorting — and never having sailed at all is the far end.
 *
 * `null` is a repository with no commit to date: it has no age, and the one thing it certainly is
 * not is the liveliest thing in its project.
 */
export function laidUp(ship: Ship): number {
  return ship.rustDays ?? Number.POSITIVE_INFINITY
}

/** The organisation a repository is filed under, with the unfiled ones given somewhere to be. */
function orgOf(ship: Ship): string {
  return ship.org === '' ? NO_ORG : ship.org
}

/**
 * What a family is called: **the biggest repository in it**.
 *
 * Two namings were tried and both named the wrong thing. `familiesOf` takes the alphabetically
 * first member, which is a tie-break and not a name — on this fleet that made `Lotsenverein-Movement`,
 * *one* repository, the name of a group of fourteen. Naming it after the organisation holding most
 * of it is a reading, and still not a *name*: three basins came out called `Wattenmeer`, because an
 * organisation can hold pieces of several projects and does.
 *
 * The largest repository by project score is the one a person would say. The Leuchtturm cluster comes
 * out as `Leuchtturm`, which is what it is called. Ties by path, so two snapshots agree.
 */
export function nameFor(ships: readonly Ship[]): string {
  const biggest = [...ships].sort(
    (a, b) => shipPoints(b).project - shipPoints(a).project || a.path.localeCompare(b.path),
  )[0]
  return biggest?.name ?? NO_ORG
}

/**
 * What shares a basin: the measured **family** where there is one, and the organisation otherwise.
 *
 * Both ends alone are wrong, and both were tried.
 *
 * Lifting families to whole *organisations* over-merges badly: one tie between two repositories
 * drags both their organisations in entire, so a single accidental edge made a basin of 45 out of
 * a project of 14. The accident is worth naming — `Wattenmeer/Funkraum` holds exactly one commit,
 * and that commit is also the root of `werkstatt/kalender`, because two repositories
 * initialised from the same scaffold at the same moment get the same hash. Fifteen ships joined a
 * project over an empty repository.
 *
 * Taking families alone under-groups just as badly: 65 of the 72 families on this fleet are a
 * single repository, and a harbour of 65 lone boats has thrown away the one thing anybody could
 * read off it.
 *
 * Family first, organisation for the rest: 23 basins, the largest 15, nine of them alone. The
 * Leuchtturm cluster stands as its own fourteen, and `Wattenmeer` and `werkstatt` stand beside it
 * as their own docks instead of being swallowed by it.
 */
export function kindredsOf(ships: readonly Ship[]): readonly Kindred[] {
  const sorted = (mine: readonly Ship[]): readonly Ship[] =>
    [...mine].sort((a, b) => laidUp(a) - laidUp(b) || a.path.localeCompare(b.path))

  const held = new Set<string>()
  const out: Kindred[] = []
  for (const family of familiesOf(ships)) {
    // A family of one is not a family: it is a repository nothing ties to anything, and it belongs
    // with the others of its organisation rather than alone in a basin of its own.
    if (family.ships.length < 2) {
      continue
    }
    for (const ship of family.ships) {
      held.add(ship.path)
    }
    out.push({
      name: nameFor(family.ships),
      orgs: [...new Set(family.ships.map((ship) => orgOf(ship)))].sort(),
      ships: sorted(family.ships),
    })
  }

  const byOrg = new Map<string, Ship[]>()
  for (const ship of ships) {
    if (!held.has(ship.path)) {
      byOrg.set(orgOf(ship), [...(byOrg.get(orgOf(ship)) ?? []), ship])
    }
  }
  for (const [org, mine] of byOrg) {
    out.push({ name: org, orgs: [org], ships: sorted(mine) })
  }

  return out.sort((a, b) => b.ships.length - a.ships.length || a.name.localeCompare(b.name))
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
export function harbourOf(ships: readonly Ship[], aspect = 16 / 9): Harbour {
  const kindreds = kindredsOf(ships)
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
