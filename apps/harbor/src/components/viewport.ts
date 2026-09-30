/**
 * How much of the drawing fits, and where in it we are looking.
 *
 * The first version scaled the whole fleet into the window and called it done. That was wrong
 * twice over: at ninety hulls it lands around 35 %, and it gets *worse* the better the screen —
 * a 2.25× display has fewer CSS pixels, so the harbour shrank exactly on the machine the zoom
 * was added for. A lines plan is not read by shrinking it until it fits; it is read at a size
 * where the labels are letters, and you move across it.
 */

export interface Extent {
  width: number
  height: number
}

export interface Pan {
  x: number
  y: number
}

/**
 * Never below this. Under 1 the 9 px captions stop being letters, which is the whole thing the
 * picture is for.
 */
export const MIN_SCALE = 1

/** Above this the strokes are fat and nothing more is legible. */
export const MAX_SCALE = 2.5

/**
 * How far a person may zoom out by hand, below what `fitScale` would choose.
 *
 * Further than the automatic floor on purpose: `MIN_SCALE` is where captions stop being letters,
 * and that is the right *default*, but somebody who deliberately zooms out is asking for the
 * shape of the fleet and not for its labels. A tool that refuses that is a tool arguing with its
 * user.
 */
export const MIN_ZOOM = 0.35

/** One notch of the wheel, as a factor. Multiplicative, so zooming feels the same at any size. */
export const ZOOM_STEP = 1.15

/**
 * The scale at which the whole drawing fits, with no floor at all.
 *
 * Separate from `fitScale` because the two answer different questions: `fitScale` picks the
 * *default*, and a default that shrinks ninety captions into smudges is a bad default. This one
 * answers "how far out is everything visible at once", which is a thing somebody asks for
 * deliberately, and a tool that refuses it is a tool arguing with its user.
 */
export function wholeScale(world: Extent, view: Extent): number {
  if (world.width <= 0 || world.height <= 0) {
    return MIN_SCALE
  }
  return Math.min(view.width / world.width, view.height / world.height)
}

/**
 * A zoom factor clamped to what is useful.
 *
 * The floor is the lower of the standing one and whatever it takes to see the whole harbour, so a
 * fleet large enough to need less than `MIN_ZOOM` can still be zoomed until it fits. Measured from
 * the drawing and the window rather than picked, because "everything fits" is a fact about those
 * two and about nothing else.
 */
export function clampZoom(scale: number, floor = MIN_ZOOM): number {
  return Math.min(Math.max(scale, Math.min(MIN_ZOOM, floor)), MAX_SCALE)
}

/**
 * Zooming towards a point, so the thing under the pointer stays under it.
 *
 * Without this the view lurches: zooming around the origin moves whatever somebody was looking
 * at off the screen, which is the difference between a map and a slideshow.
 */
export function zoomAt(pan: Pan, from: number, to: number, at: Pan): Pan {
  const ratio = to / from
  return {
    x: at.x - (at.x - pan.x) * ratio,
    y: at.y - (at.y - pan.y) * ratio,
  }
}

/**
 * The scale to draw at: shrink to fit, but never past legibility.
 *
 * Small drawings are still enlarged to fill the window — three ships in a big window centred at
 * 1× would look like a mistake.
 */
export function fitScale(world: Extent, view: Extent): number {
  if (world.width <= 0 || world.height <= 0) {
    return MIN_SCALE
  }
  const fit = Math.min(view.width / world.width, view.height / world.height)
  return Math.min(Math.max(fit, MIN_SCALE), MAX_SCALE)
}

/**
 * Where the drawing may sit, given how much of it does not fit.
 *
 * An axis that fits is centred and cannot be moved — panning along it would drift the picture
 * off for no reason. An axis that does not fit is clamped so an edge never leaves the window:
 * scrolling into grey is how a viewer loses track of where they are.
 */
export function clampPan(pan: Pan, world: Extent, view: Extent, scale: number): Pan {
  const axis = (offset: number, size: number, window: number): number => {
    const drawn = size * scale
    if (drawn <= window) {
      return (window - drawn) / 2
    }
    return Math.min(0, Math.max(window - drawn, offset))
  }

  return {
    x: axis(pan.x, world.width, view.width),
    y: axis(pan.y, world.height, view.height),
  }
}

/** Whether an axis can be moved at all — the scene only listens for a drag when it can. */
export function isPannable(world: Extent, view: Extent, scale: number): boolean {
  return world.width * scale > view.width || world.height * scale > view.height
}
