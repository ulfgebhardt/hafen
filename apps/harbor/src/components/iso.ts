/**
 * The isometric grid the harbour is laid out on.
 *
 * Pure arithmetic, and that is the point: an isometric scene is mostly *placement*, and placement
 * is the part a test can hold. What Pixi does afterwards is stroke the shapes this returns.
 *
 * The projection is the standard 2:1 dimetric one — the same ratio every tile-based game uses,
 * because at 2:1 a diagonal is exactly one pixel down per two across and the edges stay crisp
 * instead of shimmering. A true 30° isometric looks better in a still and worse on a screen.
 */

/** A place in the world: `x` and `y` across the ground, `z` up. */
export interface Spot {
  x: number
  y: number
  z?: number
}

/** Where that lands on the screen. */
export interface Flat {
  x: number
  y: number
}

/**
 * How wide and tall one grid cell is drawn.
 *
 * 2:1. Height is not a third value: a body's height is `z`, and giving the grid its own vertical
 * unit is how two parts of a scene end up disagreeing about how tall a metre is.
 */
export const TILE = { width: 64, height: 32 } as const

/** World to screen. */
export function project(spot: Spot): Flat {
  const z = spot.z ?? 0
  return {
    x: (spot.x - spot.y) * (TILE.width / 2),
    y: (spot.x + spot.y) * (TILE.height / 2) - z,
  }
}

/**
 * Screen back to the ground plane, for answering "what is under the pointer".
 *
 * Only the ground: a point on screen is a *line* in the world once height is involved, and
 * guessing which body along it was meant is what hit areas are for. This is the floor, and the
 * scene tests its bodies against that.
 */
export function unproject(flat: Flat): Spot {
  const halfWidth = TILE.width / 2
  const halfHeight = TILE.height / 2
  return {
    x: (flat.x / halfWidth + flat.y / halfHeight) / 2,
    y: (flat.y / halfHeight - flat.x / halfWidth) / 2,
  }
}

/**
 * Drawing order: back to front.
 *
 * The painter's algorithm, and there is no alternative in a 2D renderer — Pixi has no depth
 * buffer, so whatever is drawn last is in front. Sorted by `x + y` because that is the axis
 * running away from the viewer; `z` breaks the tie, so a crane on a quay is drawn after the quay
 * it stands on rather than through it.
 */
export function depth(spot: Spot): number {
  return spot.x + spot.y + (spot.z ?? 0) / 1000
}

export function byDepth(a: Spot, b: Spot): number {
  return depth(a) - depth(b)
}

/**
 * Where each ship lies along the piers.
 *
 * Berths run *along* a pier, two rows facing each other, the way a real basin is filled — which
 * is also why this is a layout and not a grid: ships alternate sides, so the eye reads pairs and
 * not a table.
 */
export interface Pier {
  /** Which pier, counting away from the viewer. */
  index: number
  /** Where the pier starts and how far it runs. */
  from: Spot
  length: number
}

export interface Berth {
  spot: Spot
  /** Which side of the pier: `-1` near, `+1` far. */
  side: -1 | 1
  pier: number
}

/** How many ships tie up along one side of one pier. */
export const PER_SIDE = 6

/**
 * How far apart two berths sit along a pier, in grid cells.
 *
 * Has to exceed the longest hull `vessel.ts` will draw, or ships overlap — which is exactly what
 * happened at 2.2 against a maximum length of 3.2: the basin read as a pile. The margin on top is
 * for the crates that stand on the quay beside a ship.
 */
export const BERTH_SPACING = 4.2

/**
 * How far apart two piers are.
 *
 * Two rows of ships face each other across one pier, and a caption sits under each row — so the
 * gap has to hold a hull, a pier, another hull, and two lines of text.
 */
export const PIER_SPACING = 8

/**
 * Berths for `count` ships, filling pier by pier.
 *
 * Filled in order, so the caller's sorting decides who gets the front berths — and the front is
 * where the biggest and most prominent ships belong. The layout does not sort; it places.
 */
export function berthsFor(count: number): readonly Berth[] {
  const out: Berth[] = []
  for (let index = 0; index < count; index += 1) {
    const pier = Math.floor(index / (PER_SIDE * 2))
    const withinPier = index % (PER_SIDE * 2)
    const side: -1 | 1 = withinPier % 2 === 0 ? -1 : 1
    const along = Math.floor(withinPier / 2)

    out.push({
      pier,
      side,
      spot: {
        x: 1 + along * BERTH_SPACING,
        y: pier * PIER_SPACING + (side === -1 ? 0 : 4.2),
      },
    })
  }
  return out
}

/** How many piers `count` ships need. */
export function pierCount(count: number): number {
  return Math.max(1, Math.ceil(count / (PER_SIDE * 2)))
}

/** The piers themselves, for drawing the concrete. */
export function piersFor(count: number): readonly Pier[] {
  return Array.from({ length: pierCount(count) }, (_, index) => ({
    index,
    // Between the two rows of berths it serves.
    from: { x: -0.4, y: index * PIER_SPACING + 2 },
    length: PER_SIDE * BERTH_SPACING + 1,
  }))
}

/**
 * The whole drawing's extent on screen, so the viewport can fit and clamp it.
 *
 * Computed from the corners of the grid rather than from the ships, because the quay and the
 * water reach past the outermost hull and a drawing that clipped them would look broken at the
 * edge.
 */
export function isoExtent(count: number): { width: number; height: number } {
  const piers = pierCount(count)
  const far = { x: PER_SIDE * BERTH_SPACING + 3, y: piers * PIER_SPACING + 3 }

  // The four corners of the ground rectangle, projected.
  const corners = [
    project({ x: 0, y: 0 }),
    project({ x: far.x, y: 0 }),
    project({ x: 0, y: far.y }),
    project(far),
  ]
  const xs = corners.map((corner) => corner.x)
  const ys = corners.map((corner) => corner.y)

  return {
    width: Math.max(...xs) - Math.min(...xs) + TILE.width,
    height: Math.max(...ys) - Math.min(...ys) + TILE.height * 4,
  }
}

/** Where the drawing's left edge sits, so nothing is projected to a negative x. */
export function isoOrigin(count: number): Flat {
  const piers = pierCount(count)
  return {
    x: project({ x: 0, y: piers * PIER_SPACING + 3 }).x * -1 + TILE.width / 2,
    y: TILE.height,
  }
}
