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
 * **Between the ends of the planks, not the middles of the cells.** A ship lies along her plank,
 * and her mooring lines, her crane and her stack all assume that plank runs level with her. Joined
 * at the middle, two thirds of the edges arrived at a slant and the berth hung off a diagonal it
 * was never built for. Joined at the ends, every berth keeps a level plank, the diagonals run in
 * the water between two berths, and the network reads as what it is: a honeycomb, two level edges
 * and four slanted ones to every cell.
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
import { GAP } from './lanes'
import { cuts, MARGIN, QUAY, shoreOf } from './moorings'
import { BERTH, BLOCK } from './plan'

import type { Box, Dock, Harbour, Mooring, Quay, Rank, Shore, Way } from './moorings'
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
 * **One cell in the middle, and it is the name's.** This went two ways before it settled. An
 * *eye* that grew with the basin kept the shape a ring and made every basin a wide donut with its
 * ships pushed to the rim — the opposite of what the heart of a project looks like. Filling the
 * middle with a ship fixed the crowding and left the name nowhere to go but above the basin, where
 * it was lost among twenty-three others and, on a tight row, under a hull.
 *
 * One cell. The rings are full from the first one out, so the middle is crowded; and the name
 * stands in open water, which is the only place a name can be read.
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
  const cells: Cell[] = []
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
 * Across, because that is where it was worse: a column already carries a whole caption between two
 * hulls, and a row carried only the plank.
 *
 * Along, because the diagonal ways run **between** two berths of a row (see `latticeWays`): from
 * one plank's end down past her caption to the plank below. At 1.3 the gap was a third of what
 * that run needs and the way cut the neighbour's caption; 1.5 is the first round figure that
 * clears it (`clears a berth with every lattice way` measures it).
 */
export const SLACK = { along: 1.5, across: 1.5 } as const

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
   * In the middle, which is the one cell no ship stands in.
   */
  label: Spot
  /**
   * How wide the name may be there.
   *
   * The gap between the two nearest hulls and **not** the basin's width: a berth starts half a
   * pitch before its cell's middle, so the open water across the centre is two lattice steps less
   * one berth. Cut to the basin instead, the name ran under the ships either side of it.
   */
  room: number
}

export function basinOf(count: number): Basin {
  const cells = cellsFor(count)
  if (cells.length === 0) {
    return { cells, width: 1, height: 1, middle: { x: 0, y: 0 }, label: { x: 0, y: 0 }, room: 0 }
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
    label: middle,
    room: 2 * (LATTICE.along - BERTH.pitch / 2),
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
 * first member, which is a tie-break and not a name — on this fleet that made `H-E-L-F-A-Movement`,
 * *one* repository, the name of a group of fourteen. Naming it after the organisation holding most
 * of it is a reading, and still not a *name*: three basins came out called `IT4Change`, because an
 * organisation can hold pieces of several projects and does.
 *
 * The largest repository by project score is the one a person would say. The Ocelot cluster comes
 * out as `Ocelot-Social`, which is what it is called. Ties by path, so two snapshots agree.
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
 * a project of 14. The accident is worth naming — `IT4Change/InfCloud` holds exactly one commit,
 * and that commit is also the root of `webcraftmedia/jahrweiser`, because two repositories
 * initialised from the same scaffold at the same moment get the same hash. Fifteen ships joined a
 * project over an empty repository.
 *
 * Taking families alone under-groups just as badly: 65 of the 72 families on this fleet are a
 * single repository, and a harbour of 65 lone boats has thrown away the one thing anybody could
 * read off it.
 *
 * Family first, organisation for the rest: 23 basins, the largest 15, nine of them alone. The
 * Ocelot cluster stands as its own fourteen, and `IT4Change` and `webcraftmedia` stand beside it
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

/** The candidate widths a layout is searched over, as a count of the widest basin. */
const LANES = [1, 2, 3, 4, 5]

/**
 * How much open water stands round a basin, in lattice cells.
 *
 * This went both ways before it settled, and both ends were wrong for the same reason: a ring is
 * round and its box is not, so what the numbers say and what the eye sees are different things.
 *
 * Boxes edge to edge left a channel between two rings the width of two empty corners, and the
 * picture read as crowded middles with meaningless gaps between them. Letting the boxes *nest* —
 * each basin standing a fifth of its width inside its neighbour — closed that, and closed it too
 * far: the rings touched, and a harbour of twenty-three projects read as one field of ships.
 *
 * A moat instead, measured in the lattice's own units so it scales with everything else: a clear
 * cell of water on every side, which is the smallest gap that cannot be mistaken for a place a
 * ship could stand. What a reader gets back is the thing the basins are for — twenty-three
 * countable clusters.
 */
export const MOAT = { along: 1.4, across: 1.2 } as const

/**
 * Every berth's plank is on the same side of her.
 *
 * The lattice gives each cell a mooring post at its own middle and the hull hangs below it. Facing
 * the planks outward from the ring would read better and is not safe: rows are half a block apart,
 * which holds one plank, one lane and one caption, and a row whose caption lands where the row
 * below wants its plank is two things in one place.
 */
const SIDE: Side = 1

/** The two ends of a cell's plank, and which way is which. */
type End = 'west' | 'east'

/**
 * Which plank ends a lattice edge joins, for the three directions that point down or east.
 *
 * The other three are the same edges seen from the far cell, so walking these three from every
 * cell lays each edge exactly once.
 *
 * - Due east: this plank's east end to the neighbour's west end, level.
 * - Down and east: east end to east end. The way leaves past her bow and drops through the water
 *   between her and her east neighbour — the west end would have taken it across her own hull.
 * - Down and west: west end to west end, the mirror of that.
 */
export const JOINS: readonly { step: Cell; from: End; to: End }[] = [
  { step: { q: 1, r: 0 }, from: 'east', to: 'west' },
  { step: { q: 0, r: 1 }, from: 'east', to: 'east' },
  { step: { q: -1, r: 1 }, from: 'west', to: 'west' },
]

/** One end of a cell's plank, in the basin's own coordinates. */
export function endOf(cell: Cell, end: End): Spot {
  const middle = spotOf(cell)
  return { x: middle.x + ((end === 'east' ? 1 : -1) * BERTH.pitch) / 2, y: middle.y }
}

/**
 * The lattice edges among these cells, as pairs of plank ends.
 *
 * Only between cells that are both there: a part-filled outer ring has neighbours missing, and an
 * edge to an empty cell would be a way to nowhere.
 */
export function latticeWays(
  cells: readonly Cell[],
): readonly { from: Cell; fromEnd: End; to: Cell; toEnd: End }[] {
  const key = (cell: Cell): string => `${String(cell.q)}.${String(cell.r)}`
  const present = new Set(cells.map((cell) => key(cell)))
  const out: { from: Cell; fromEnd: End; to: Cell; toEnd: End }[] = []
  for (const cell of cells) {
    for (const join of JOINS) {
      const other = { q: cell.q + join.step.q, r: cell.r + join.step.r }
      if (present.has(key(other))) {
        out.push({ from: cell, fromEnd: join.from, to: other, toEnd: join.to })
      }
    }
  }
  return out
}

/**
 * What a berth occupies, measured from her cell's middle: plank, hull and caption.
 *
 * The same rectangle `scene.ts` gives her as a hit area, so "a way does not cross a berth" and "a
 * click on a way does not land on a ship" are one statement.
 */
export function berthAround(middle: Spot): Box {
  return {
    x: middle.x - BERTH.pitch / 2,
    y: middle.y - BERTH.pier,
    width: BERTH.pitch,
    height: BERTH.pier + BERTH.lane + BERTH.caption,
  }
}

/**
 * The directions a way may leave a plank end towards the shore: the lattice's own three.
 *
 * Level, or along one of the two diagonals — a spur at any other angle is the line the honeycomb
 * stops at. Outward only: a west end leaves westward, an east end eastward, so no spur starts back
 * across the plank it belongs to.
 */
export function bearingsOf(end: End): readonly Spot[] {
  const sign = end === 'east' ? 1 : -1
  return [
    { x: sign, y: 0 },
    { x: (sign * LATTICE.along) / 2, y: -LATTICE.across },
    { x: (sign * LATTICE.along) / 2, y: LATTICE.across },
  ]
}

/**
 * How far a ray goes before it reaches the shore, in multiples of its bearing.
 *
 * The shore is a frame round the whole picture, so every ray reaches it somewhere; what this picks
 * is the side it reaches first.
 */
export function toShore(from: Spot, bearing: Spot, shore: Shore): number {
  const reach = (edge: number, at: number, by: number): number =>
    by === 0 ? Number.POSITIVE_INFINITY : (edge - at) / by
  const across = bearing.x > 0 ? shore.right : shore.left
  const down = bearing.y > 0 ? shore.bottom : shore.top
  return Math.min(reach(across, from.x, bearing.x), reach(down, from.y, bearing.y))
}

/**
 * A channel of open water across the whole harbour, between two rows of basins.
 *
 * Every basin in a row is hung from the row's top, so below the deepest of them and above the next
 * row lies a strip that nothing stands in from shore to shore. A spur that cannot reach land
 * directly reaches one of these, and the channel carries it on.
 */
export interface Channel {
  y: number
}

/** One way ashore a basin could take, before the shortest is chosen. */
export interface Landing {
  /** Where the spur leaves the basin. */
  from: Spot
  /** Where it ends: on the shore, or on a channel's line. */
  to: Spot
  /** The channel it ends on, if it does not reach land itself. */
  channel: Channel | null
  /** The whole walk to land: the spur, and the channel's run to its nearer end. */
  length: number
}

/**
 * Every way ashore from these plank ends that crosses nothing, shortest first.
 *
 * "From the nearest waypoint to the nearest shore", made exact: each plank end, each of its three
 * outward bearings, the ray followed until it meets land or a channel. A ray that passes through a
 * berth — her own basin's or anybody else's — or through another basin's water is not a way, it
 * is a line drawn over something.
 *
 * Ending on a channel costs the run along it as well, to whichever shore is nearer. So a basin on
 * the outside of the harbour goes straight to the land beside it, and one in the middle drops into
 * the channel below or above it.
 */
export function landingsFrom(
  ends: readonly Spot[],
  bearingsAt: (index: number) => readonly Spot[],
  shore: Shore,
  channels: readonly Channel[],
  blocked: readonly Box[],
): readonly Landing[] {
  const out: Landing[] = []
  ends.forEach((from, index) => {
    for (const bearing of bearingsAt(index)) {
      const ashore = toShore(from, bearing, shore)
      /*
       * The first channel the ray crosses is where it ends: that channel *is* the nearest
       * waypoint. Allowed to fly on, the shortest walk was sometimes a diagonal across a whole
       * row of basins to the south shore — shorter on paper, and a line through the harbour.
       */
      let end: { at: number; channel: Channel | null } = { at: ashore, channel: null }
      if (bearing.y !== 0) {
        for (const channel of channels) {
          const at = (channel.y - from.y) / bearing.y
          if (at > 0 && at < end.at) {
            end = { at, channel }
          }
        }
      }
      const to = { x: from.x + bearing.x * end.at, y: from.y + bearing.y * end.at }
      if (blocked.some((box) => cuts(from, to, box))) {
        continue
      }
      const spur = Math.hypot(to.x - from.x, to.y - from.y)
      const run = end.channel === null ? 0 : Math.min(to.x - shore.left, shore.right - to.x)
      out.push({ from, to, channel: end.channel, length: spur + run })
    }
  })
  return out.sort((a, b) => a.length - b.length)
}

/**
 * Which ways are the tree and which are extra, decided by walking out from the land.
 *
 * A plank is one place with two ends, so it is walked as one: reaching either end reaches both,
 * and the plank itself is always part of the tree. Walked end by end instead, the plank came out
 * `round` whenever both its ends were first reached by diagonals — and the plank is what her lines
 * are measured to and what is drawn under her.
 */
function treeOf(
  quays: readonly Quay[],
  ways: readonly { from: number; to: number; org: string | null; plank: boolean }[],
  unitOf: ReadonlyMap<number, number>,
): readonly Way[] {
  const unit = (node: number): number => unitOf.get(node) ?? node
  const touching = new Map<number, number[]>()
  ways.forEach((way, index) => {
    if (way.plank) {
      return
    }
    for (const end of [unit(way.from), unit(way.to)]) {
      touching.set(end, [...(touching.get(end) ?? []), index])
    }
  })

  const reached = new Set<number>()
  const tree = new Set<number>()
  const queue = quays.filter((one) => one.rank === 'root').map((one) => unit(one.id))
  for (const root of queue) {
    reached.add(root)
  }
  // The queue grows while it is walked, and an array iterator sees what is appended to it.
  for (const here of queue) {
    for (const index of touching.get(here) ?? []) {
      const way = ways[index]
      if (way === undefined) {
        continue
      }
      const there = unit(way.from) === here ? unit(way.to) : unit(way.from)
      if (!reached.has(there)) {
        reached.add(there)
        tree.add(index)
        queue.push(there)
      }
    }
  }

  return ways.map((way, index) => ({
    from: way.from,
    to: way.to,
    org: way.org,
    kind: way.plank || tree.has(index) ? 'tree' : 'round',
  }))
}

function lay(kindreds: readonly Kindred[], basins: readonly Basin[], room: number): Harbour {
  const left = MARGIN.x + QUAY + GAP.x

  /*
   * First where every basin stands, and only then the ways.
   *
   * A spur runs to the nearest shore, and the east and south shores are where they are only once
   * the last basin is placed. Laid in one pass, the first basin would have to guess them.
   */
  const placed: { kindred: Kindred; basin: Basin; west: number; top: number; row: number }[] = []
  const rows: { top: number; height: number }[] = []
  let x = left
  let y = MARGIN.y + GAP.y
  let far = left
  kindreds.forEach((kindred, index) => {
    const basin = basins[index]
    if (basin === undefined || basin.cells.length === 0) {
      return
    }
    const current = rows.at(-1)
    if (current === undefined || (x !== left && x + basin.width > left + room)) {
      if (current !== undefined) {
        y = current.top + current.height + LATTICE.across * MOAT.across
      }
      x = left
      rows.push({ top: y, height: 0 })
    }
    const row = rows.length - 1
    const at = rows[row]
    if (at !== undefined) {
      at.height = Math.max(at.height, basin.height)
    }
    placed.push({ kindred, basin, west: x, top: y, row })
    far = Math.max(far, x + basin.width)
    x += basin.width + LATTICE.along * MOAT.along
  })

  const last = rows.at(-1)
  const width = Math.max(1, far + MARGIN.x)
  const height = Math.max(
    1,
    (last === undefined ? MARGIN.y : last.top + last.height) +
      LATTICE.across * MOAT.across +
      MARGIN.y,
  )
  const shore = shoreOf(width, height)
  // The middle of the moat below every row but the last, whose moat is the south shore's water.
  const channels: Channel[] = rows
    .slice(0, -1)
    .map((row) => ({ y: row.top + row.height + (LATTICE.across * MOAT.across) / 2 }))

  const middleOf = (one: (typeof placed)[number], cell: Cell): Spot => {
    const spot = spotOf(cell)
    return { x: one.west + one.basin.middle.x + spot.x, y: one.top + one.basin.middle.y + spot.y }
  }
  const filled = (one: (typeof placed)[number]): readonly Cell[] =>
    one.basin.cells.slice(0, one.kindred.ships.length)
  const berths = placed.map((one) => filled(one).map((cell) => berthAround(middleOf(one, cell))))
  const waters = placed.map((one): Box => ({
    x: one.west,
    y: one.top,
    width: one.basin.width,
    height: one.basin.height,
  }))

  const quays: Quay[] = []
  const ways: { from: number; to: number; org: string | null; plank: boolean }[] = []
  const moorings: Mooring[] = []
  const blocks: Dock[] = []
  const quay = (spot: Spot, rank: Rank, org: string | null): number => {
    quays.push({ id: quays.length, spot, rank, org })
    return quays.length - 1
  }
  /** Which plank ends belong to one cell, so the tree below can treat a plank as one place. */
  const unitOf = new Map<number, number>()
  const onChannel = new Map<Channel, { node: number; x: number }[]>()

  placed.forEach((one, index) => {
    const org = one.kindred.orgs[0] ?? null
    const ends = new Map<string, { west: number; east: number }>()
    const key = (cell: Cell): string => `${String(cell.q)}.${String(cell.r)}`

    filled(one).forEach((cell, index2) => {
      const ship = one.kindred.ships[index2]
      if (ship === undefined) {
        return
      }
      const middle = middleOf(one, cell)
      const west = quay({ x: middle.x - BERTH.pitch / 2, y: middle.y }, 'plank', org)
      const east = quay({ x: middle.x + BERTH.pitch / 2, y: middle.y }, 'plank', org)
      unitOf.set(west, west)
      unitOf.set(east, west)
      ends.set(key(cell), { west, east })
      ways.push({ from: west, to: east, org, plank: true })

      moorings.push({
        ship,
        org: ship.org === '' ? NO_ORG : ship.org,
        spot: { x: middle.x - BERTH.pitch / 2, y: middle.y + SIDE * BERTH.laneCentre },
        side: SIDE,
        /*
         * The east end, because her own plank is the only way there that passes near her: the
         * west end also carries the diagonal to the row below, which runs closer to her stern than
         * her plank does, and `reachOf` would have hung her lines off it.
         */
        node: east,
        angle: 0,
      })
    })

    for (const edge of latticeWays(filled(one))) {
      const a = ends.get(key(edge.from))
      const b = ends.get(key(edge.to))
      if (a !== undefined && b !== undefined) {
        ways.push({ from: a[edge.fromEnd], to: b[edge.toEnd], org, plank: false })
      }
    }

    blocks.push({
      org: one.kindred.name,
      at: { x: one.west, y: one.top },
      width: one.basin.width,
      height: one.basin.height,
      angle: 0,
      label: { x: one.west + one.basin.label.x, y: one.top + one.basin.label.y },
      room: one.basin.room,
    })

    /*
     * One spur ashore, from whichever plank end has the shortest clear walk to land.
     *
     * Blocked by every berth in the harbour and by every *other* basin's water: a spur through a
     * neighbour's ring would be a way that seems to belong to it.
     */
    const starts = [...ends.values()].flatMap((pair) => [
      { node: pair.west, end: 'west' as const },
      { node: pair.east, end: 'east' as const },
    ])
    const blocked = [...berths.flat(), ...waters.filter((_, other) => other !== index)]
    const spots = starts.map((start) => quays[start.node]?.spot ?? { x: 0, y: 0 })
    const landings = landingsFrom(
      spots,
      (at) => bearingsOf(starts[at]?.end ?? 'east'),
      shore,
      channels,
      blocked,
    )
    /*
     * There is always one. Every basin in a row hangs from the row's top, so her topmost berth
     * stands on that line with nothing of any basin above it, and a diagonal up from either end of
     * her plank meets the channel above or the north shore in open water. `reaches the shore from
     * every berth, on planks and not by boat` holds that up; this guard is for the type checker.
     */
    const best = landings[0]
    const start = best === undefined ? undefined : starts[spots.indexOf(best.from)]
    if (best === undefined || start === undefined) {
      return
    }
    if (best.channel === null) {
      const land = quay(best.to, 'root', null)
      unitOf.set(land, land)
      ways.push({ from: land, to: start.node, org: null, plank: false })
    } else {
      const corner = quay(best.to, 'stub', null)
      unitOf.set(corner, corner)
      ways.push({ from: corner, to: start.node, org: null, plank: false })
      onChannel.set(best.channel, [
        ...(onChannel.get(best.channel) ?? []),
        { node: corner, x: best.to.x },
      ])
    }
  })

  /*
   * Each channel carries its spurs to the nearer shore, each to the next waypoint on the way.
   *
   * Not one way from shore to shore: a channel with two spurs near its west end would then run the
   * whole width of the harbour to an east shore nobody on it is going to. Sorted by distance, so a
   * spur joins the next one out instead of laying its own line beside it.
   */
  for (const [channel, corners] of onChannel) {
    const middle = (shore.left + shore.right) / 2
    const west = corners.filter((one) => one.x <= middle).sort((a, b) => a.x - b.x)
    const east = corners.filter((one) => one.x > middle).sort((a, b) => b.x - a.x)
    for (const [side, run] of [
      [shore.left, west],
      [shore.right, east],
    ] as const) {
      const first = run[0]
      if (first === undefined) {
        continue
      }
      const land = quay({ x: side, y: channel.y }, 'root', null)
      unitOf.set(land, land)
      let behind = land
      for (const corner of run) {
        ways.push({ from: behind, to: corner.node, org: null, plank: false })
        behind = corner.node
      }
    }
  }

  return {
    quays,
    ways: treeOf(quays, ways, unitOf),
    moorings,
    blocks,
    width,
    height,
    root: quays.find((one) => one.rank === 'root')?.spot ?? { x: shore.left, y: shore.top },
  }
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
