/**
 * The berth arithmetic: how deep a row of ships is, and which way round one lies.
 *
 * What is left of a bigger file. It used to lay the *whole* harbour out as a ruled grid — piers
 * running the full width, a fairway between them, land at the top and a breakwater at the bottom —
 * and `moorings.ts` replaced every bit of that with one dock per organisation and a walkway tree.
 * The grid functions went with it rather than staying as dead exports with tests beside them,
 * which is the shape of code that looks maintained and is not.
 *
 * What survives is what a *berth* is, because that has not changed and `vessel.ts` is built on it.
 *
 * The top-down view itself is why this is so small: world units times `UNIT`, no projection. An
 * isometric scene spends most of its arithmetic on placement and drawing order, and both of those
 * disappear without a third axis — there is no depth, so there is no painter's algorithm, and
 * nothing can be drawn through anything else.
 *
 * `x` runs along a jetty, `y` across it. Every ship lies bow-to-starboard — the same way round,
 * always, because length stands for the project score and two lengths are only comparable if the
 * eye does not have to rotate one of them first.
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
  /**
   * Along the jetty, one berth's stern to the next one's.
   *
   * Widened from 38 once the cargo moved off the planking: what a ship still owes now stands on
   * the apron *ahead of her bow*, so a berth has to hold a hull and a stack, not a hull alone.
   * The scene zooms, so the cost of a wider berth is a smaller default scale and nothing else.
   */
  pitch: 52,
  /**
   * The planking itself — and it is now the *same* plank everywhere in the harbour.
   *
   * It was 14 units deep because it carried the cargo: every demand a ship still owed stood on it,
   * so the drawing had two kinds of walkway, a broad loaded one and a thin connecting one. One
   * kind was asked for, so the load moved to the apron ahead of each bow and the planking shrank
   * to what a plank is: something to walk on.
   */
  pier: 3.2,
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
 * The whole of one berth, in units around the hull's centreline: pier, water and caption.
 *
 * One rectangle for two jobs — what a click hits and what a search frames — so the frame lands on
 * the thing a click would pick by construction. The search used to draw a circle round the stern
 * with half a hull for a radius: it held the back half of the boat and none of the pier, and the
 * pier is where a repository's open debts stand.
 *
 * `side` mirrors it, the same way it mirrors the planking: at `1` the pier lies towards negative y.
 */
export function berthBox(side: Side): { x: number; y: number; width: number; height: number } {
  const towardsPier = BERTH.pier + BERTH.laneCentre
  const awayFromPier = BERTH.lane - BERTH.laneCentre + BERTH.caption
  return {
    x: -2,
    y: side === 1 ? -towardsPier : -awayFromPier,
    width: BERTH.pitch,
    height: towardsPier + awayFromPier,
  }
}

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

/**
 * The shape the plan is laid out towards when nobody says otherwise.
 *
 * A fallback and not the rule: the shape worth matching is the *window's*, and a constant 16:9 is
 * only right on a window that happens to be 16:9. Measured on this desktop the scene came out flat
 * and small in the height, because the plan was built for a shape the window did not have.
 */
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

/**
 * Which side of her pier a ship lies on.
 *
 * `1` is the row below a pier — her planking is to the north, so everything on it is drawn towards
 * her own negative `y`. `-1` is the row above the next pier, which is the same ship mirrored. The
 * scene flips one container and nothing else: a hull, her cargo grid and her crates are all
 * symmetric about the centreline, so the mirror costs no second drawing.
 */
export type Side = 1 | -1
