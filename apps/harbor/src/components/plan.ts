/**
 * The harbour seen from above, as a plan.
 *
 * This replaces the isometric grid, and the reason is a measurement anybody can repeat by looking:
 * seen at 2:1 from a corner, a hull is a box with a box on it, and a basin of ninety of them reads
 * as a housing estate. From above it does not — a ship from above is a long shape with a point at
 * one end, which is the one silhouette nobody mistakes for a building, and deck cargo becomes a
 * grid of coloured rectangles, which is exactly what a container terminal looks like in an aerial
 * photograph.
 *
 * The projection is therefore no projection at all: world units times `UNIT`. That is not a
 * simplification for its own sake. An isometric scene spends most of its arithmetic on placement
 * and drawing order, and both of those disappear here — there is no depth, so there is no
 * painter's algorithm, and nothing can be drawn through anything else.
 *
 * What the plan is a plan *of* is a real harbour and not a ruled sheet: land along the top, piers
 * running out from it with a row of berths on either side, a fairway between them, and a
 * breakwater closing the basin. Berths on both sides of a pier is the whole reason for the shape —
 * it is what every marina from the air looks like, it halves the water spent per ship, and it
 * gives a row of hulls something to be a row *of*.
 *
 * `x` runs along the piers, `y` across them. Every ship lies bow-to-starboard — the same way
 * round, always, because length stands for the project score and two lengths are only comparable
 * if the eye does not have to rotate one of them first.
 */

/** A place on the plan. No `z`: from above there is none, and an unused axis is one that lies. */
export interface Spot {
  x: number
  y: number
}

/** Where that lands on screen. */
export interface Flat {
  x: number
  y: number
}

/**
 * Pixels per world unit at scale 1.
 *
 * Chosen so the shortest hull is about a hundred pixels and one container stays above four — under
 * that a bay is a smudge and the contract stops being readable, which is the one thing the deck is
 * for. The viewport scales from here; this is the floor it scales from.
 */
export const UNIT = 5

/**
 * One berth's share of the plan, in world units.
 *
 * A pier is read outwards from its own planking: the concrete, the ship lying against it, her
 * caption, then the fairway. The pier is where everything *to do* stands — open demands and
 * uncommitted work both — so it is the band the eye crosses on the way to the ship.
 */
export const BERTH = {
  /** Along the pier, one berth's stern to the next one's. Must clear the longest hull. */
  pitch: 38,
  /**
   * Depth of the pier itself: planking, bollards, and whatever is waiting to go aboard.
   *
   * One pier serves two rows, so **each side gets half of it** and the two never share a square
   * metre. They did: both ships at a column drew their boxes from the same corner of the same
   * planking, and a berth with open demands on one side and a stash on the other came out as one
   * illegible pile. Half each is the only arrangement that needs no arbitration between two ships
   * that do not know about each other.
   */
  pier: 14,
  /** The water a hull lies in, measured across. Holds a snug hull and one standing right off. */
  lane: 12,
  /**
   * Where a snug hull's centreline sits, measured from the pier edge.
   *
   * Not the middle of the lane: the lane is asymmetric on purpose, because lying *off* the pier is
   * the thing the hygiene reading says and there has to be room to say it. A hull at her widest
   * leaves a metre of water when snug, and the rest of the lane is what untidiness costs.
   * Stated here rather than read from `SIZE`, which would make the grid import the ships.
   */
  laneCentre: 4.6,
  /** Two lines of caption, outboard of the ship. */
  caption: 9,
  /** Open water between two piers' outboard rows. */
  fairway: 6,
} as const

/**
 * One pier and the two rows of berths it serves, top to bottom.
 *
 * The pier, the row lying against its south side with their captions below them, the fairway, then
 * the captions and row belonging to the *next* pier's north side. So a block holds two rows of
 * ships and the piers fall between them — which is why there is always one pier more than there
 * are blocks.
 */
export const BLOCK =
  BERTH.pier + BERTH.lane + BERTH.caption + BERTH.fairway + BERTH.caption + BERTH.lane

/** The promenade along the top of the basin, where the piers start. */
export const LAND = 8

/** The breakwater closing the basin at the bottom. */
export const MOLE = 7

/** Water around the whole plan, so nothing sits flush against an edge. */
export const MARGIN = { x: 4, y: 3 } as const

/** The shape the plan is laid out towards. Asked for, and the reason `columnsFor` exists. */
export const ASPECT = 16 / 9

export function project(spot: Spot): Flat {
  return { x: spot.x * UNIT, y: spot.y * UNIT }
}

/**
 * Screen back to the plan.
 *
 * Exact, unlike its isometric predecessor: without a third axis a point on screen is a point in
 * the world and not a line through it.
 */
export function unproject(flat: Flat): Spot {
  return { x: flat.x / UNIT, y: flat.y / UNIT }
}

/** Where the first pier's planking begins. */
export const CONTENT_TOP = MARGIN.y + LAND

/** How many rows of berths `count` ships need at `columns` wide. */
export function rowsAt(count: number, columns: number): number {
  return Math.max(1, Math.ceil(Math.max(count, 1) / columns))
}

/**
 * How deep the berths themselves reach, for `rows` of them.
 *
 * Counted to the last thing actually drawn and not in whole blocks. A block is two rows, so an odd
 * row count fills half of one — rounding up put a whole empty pier and its fairway under the last
 * ship, which is what the harbour looked like at seventeen: a third of the basin was water nothing
 * was ever going to lie in.
 */
export function contentHeight(rows: number): number {
  const pairs = Math.floor(rows / 2)
  return rows % 2 === 0
    ? // The last row lies *above* a pier, so that pier is the bottom of the drawing.
      pairs * BLOCK + BERTH.pier
    : pairs * BLOCK + BERTH.pier + BERTH.lane + BERTH.caption
}

/** How many piers `rows` of berths need. One serves two rows, and the first row needs one above. */
export function pierCount(rows: number): number {
  return Math.floor(rows / 2) + 1
}

/** The plan's size in world units for a given column count, land and breakwater included. */
export function shapeAt(count: number, columns: number): { width: number; height: number } {
  return {
    width: MARGIN.x * 2 + columns * BERTH.pitch,
    height: CONTENT_TOP + contentHeight(rowsAt(count, columns)) + MOLE + MARGIN.y,
  }
}

/**
 * How many berths stand side by side.
 *
 * Searched rather than estimated. The closed form is easy to write and was wrong: the land, the
 * breakwater and the margins are a fixed height that a ratio of pitches cannot see, so the formula
 * drifted square as the fleet grew — exactly the failure it was supposed to prevent. Trying every
 * column count and keeping the one whose actual plan lands nearest 16:9 is a handful of
 * multiplications per draw and cannot be wrong about its own arithmetic.
 */
export function columnsFor(count: number): number {
  if (count <= 0) {
    return 1
  }

  let best = 1
  let closest = Number.POSITIVE_INFINITY
  for (let columns = 1; columns <= count; columns += 1) {
    const shape = shapeAt(count, columns)
    const off = Math.abs(shape.width / shape.height - ASPECT)
    if (off < closest) {
      closest = off
      best = columns
    }
  }
  return best
}

export function rowsFor(count: number): number {
  return rowsAt(count, columnsFor(count))
}

/**
 * Which side of her pier a ship lies on.
 *
 * `1` is the row below a pier — her planking is to the north, so everything on it is drawn towards
 * her own negative `y`. `-1` is the row above the next pier, which is the same ship mirrored. The
 * scene flips one container and nothing else: a hull, her cargo grid and her crates are all
 * symmetric about the centreline, so the mirror costs no second drawing.
 */
export type Side = 1 | -1

export interface Berth {
  /** The hull's stern, on her centreline, with the ship lying snug against her pier. */
  spot: Spot
  /** Where the planking is, relative to her: `1` north of her, `-1` south. */
  side: Side
  column: number
  row: number
}

/**
 * A berth per ship, filling row by row.
 *
 * Filled in the order given, so the caller's sorting decides who lies in the front row — and the
 * front row is the top one, where a reader starts. The layout does not sort; it places.
 */
export function berthsFor(count: number): readonly Berth[] {
  const columns = columnsFor(count)
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const top = CONTENT_TOP + Math.floor(row / 2) * BLOCK
    const side: Side = row % 2 === 0 ? 1 : -1

    return {
      column,
      row,
      side,
      spot: {
        x: MARGIN.x + column * BERTH.pitch,
        y: side === 1 ? top + BERTH.pier + BERTH.laneCentre : top + BLOCK - BERTH.laneCentre,
      },
    }
  })
}

export interface Pier {
  index: number
  /** The landward corner: the planking runs `length` along and `depth` down from here. */
  from: Spot
  length: number
  depth: number
}

/**
 * The piers: one per pair of rows, and one more for the first row to lie against.
 *
 * Exactly as many as are used. A pier with no ship on either side is a pier drawn from the
 * arithmetic rather than from the harbour, and at seventeen ships that was a third of the basin.
 * Full width even where the last row is half empty, though — a pier that stopped where the ships
 * stop would move every time a repository was added.
 */
export function piersFor(count: number): readonly Pier[] {
  const columns = columnsFor(count)
  const length = MARGIN.x * 2 + columns * BERTH.pitch

  return Array.from({ length: pierCount(rowsAt(count, columns)) }, (_, index) => ({
    index,
    length,
    depth: BERTH.pier,
    from: { x: 0, y: CONTENT_TOP + index * BLOCK },
  }))
}

/** The whole plan in pixels, so the viewport can fit and clamp it. */
export function planExtent(count: number): { width: number; height: number } {
  const shape = shapeAt(count, columnsFor(count))
  return { width: shape.width * UNIT, height: shape.height * UNIT }
}
