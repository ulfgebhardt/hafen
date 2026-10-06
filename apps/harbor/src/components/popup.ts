/**
 * Where a popup opens: under its button, right-aligned to it, and never past the window's edge.
 *
 * Measured from the button rather than anchored to it in CSS. Anchored (`absolute right-0`) the
 * popup could only ever open to the left of its button, and the bar wraps differently with every
 * font and window width — on a Mac at 1440 px the button landed at the left of a new line and its
 * popup opened past the window's left edge.
 */

export interface Anchor {
  left: number
  right: number
  bottom: number
}

export interface Placed {
  top: number
  left: number
  width: number
}

/** Room kept to the window's edge, and between the button and the popup. */
const MARGIN = 16
const GAP = 4

export function placePopup(anchor: Anchor, view: number, wanted: number): Placed {
  const width = Math.max(0, Math.min(wanted, view - 2 * MARGIN))
  const left = Math.min(Math.max(anchor.right - width, MARGIN), view - MARGIN - width)
  return { top: anchor.bottom + GAP, left: Math.max(MARGIN, left), width }
}
