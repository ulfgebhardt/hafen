import { describe, expect, it } from 'vitest'

import {
  heldView,
  clampPan,
  clampZoom,
  fitScale,
  isPannable,
  MAX_SCALE,
  MIN_SCALE,
  MIN_ZOOM,
  wheelPixels,
  wheelZoom,
  wholeScale,
  ZOOM_STEP,
  zoomAt,
} from './viewport'

const FLEET = { width: 1900, height: 1300 }

describe(fitScale, () => {
  /**
   * The whole harbour, in the room there is. It used to floor at `MIN_SCALE` so captions stayed
   * letters, and that was the wrong default: the first thing a person wants from a harbour is its
   * *shape*, and a view that opens cropped looks broken rather than detailed. Reading a caption is
   * one notch of the wheel away; an edge that was never drawn is not.
   */
  it('shows the whole drawing, however small the window', () => {
    expect(fitScale(FLEET, { width: 680, height: 430 })).toBe(430 / 1300)
    expect(fitScale(FLEET, { width: 50, height: 50 })).toBe(50 / 1900)
  })

  it('fills a window that has room to spare', () => {
    const scale = fitScale({ width: 400, height: 300 }, { width: 800, height: 600 })

    expect(scale).toBe(2)
  })

  it('stops at the point where strokes get fat and nothing is gained', () => {
    expect(fitScale({ width: 10, height: 10 }, { width: 800, height: 600 })).toBe(MAX_SCALE)
  })

  it('follows the tighter of the two axes', () => {
    // Wide window, short: the height decides.
    expect(fitScale({ width: 100, height: 100 }, { width: 900, height: 150 })).toBe(1.5)
  })

  it('answers something usable for an empty drawing', () => {
    expect(fitScale({ width: 0, height: 0 }, { width: 800, height: 600 })).toBe(MIN_SCALE)
  })
})

describe(clampPan, () => {
  const view = { width: 680, height: 430 }

  /** An axis that fits is centred and immovable — drifting it off would be for nothing. */
  it('centres an axis that fits and ignores the offset', () => {
    const at = clampPan({ x: -400, y: -400 }, { width: 200, height: 100 }, view, 1)

    expect(at.x).toBe((680 - 200) / 2)
    expect(at.y).toBe((430 - 100) / 2)
  })

  /** Scrolling into grey is how a viewer loses track of where they are. */
  it('never lets an edge leave the window', () => {
    const tooFarLeft = clampPan({ x: 500, y: 500 }, FLEET, view, 1)

    expect(tooFarLeft).toStrictEqual({ x: 0, y: 0 })

    const tooFarRight = clampPan({ x: -9999, y: -9999 }, FLEET, view, 1)

    expect(tooFarRight).toStrictEqual({ x: 680 - 1900, y: 430 - 1300 })
  })

  it('leaves a position in range alone', () => {
    expect(clampPan({ x: -300, y: -200 }, FLEET, view, 1)).toStrictEqual({ x: -300, y: -200 })
  })

  /** The scale changes how much does not fit, so the clamp has to know it. */
  it('clamps against the drawn size, not the drawing', () => {
    const at = clampPan({ x: -9999, y: -9999 }, { width: 400, height: 300 }, view, 2)

    expect(at.x).toBe(680 - 800)
    expect(at.y).toBe(430 - 600)
  })
})

describe(isPannable, () => {
  it('is true only where there is somewhere to go', () => {
    expect(isPannable(FLEET, { width: 680, height: 430 }, 1)).toBe(true)
    expect(isPannable({ width: 200, height: 100 }, { width: 680, height: 430 }, 1)).toBe(false)
  })

  it('counts an overflow on either axis', () => {
    const view = { width: 680, height: 430 }

    expect(isPannable({ width: 2000, height: 100 }, view, 1)).toBe(true)
    expect(isPannable({ width: 200, height: 2000 }, view, 1)).toBe(true)
  })
})

describe(clampZoom, () => {
  /**
   * Further out than `fitScale` will go on its own: that floor is where captions stop being
   * letters, which is the right default — but somebody who deliberately zooms out is asking for
   * the shape of the fleet, and a tool that refuses is a tool arguing with its user.
   */
  it('lets a person go further out than the automatic floor', () => {
    expect(clampZoom(0.5)).toBe(0.5)
    expect(MIN_ZOOM).toBeLessThan(MIN_SCALE)
  })

  it('stops at both ends', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(99)).toBe(MAX_SCALE)
  })

  /**
   * The whole harbour has to fit if somebody keeps zooming out, however large the fleet gets. The
   * floor is therefore measured from the drawing and the window and not picked — a standing
   * minimum is a number that is right until the day it is not.
   */
  it('gives way to a fleet that needs more room than the standing floor', () => {
    expect(clampZoom(0.01, 0.08)).toBe(0.08)
  })

  it('never loosens the floor for a drawing that already fits', () => {
    expect(clampZoom(0.01, 4)).toBe(MIN_ZOOM)
  })
})

describe(wholeScale, () => {
  it('is the scale at which both axes fit, with no floor at all', () => {
    expect(wholeScale({ width: 4000, height: 1000 }, { width: 400, height: 400 })).toBe(0.1)
    expect(wholeScale({ width: 100, height: 100 }, { width: 400, height: 400 })).toBe(4)
  })

  it('answers something usable for a harbour with nothing in it', () => {
    expect(wholeScale({ width: 0, height: 0 }, { width: 400, height: 400 })).toBe(MIN_SCALE)
  })
})

describe(zoomAt, () => {
  /**
   * The thing under the pointer stays under it. Without that the view lurches, and whatever
   * somebody was looking at leaves the screen — the difference between a map and a slideshow.
   */
  it('keeps the point under the pointer fixed', () => {
    const at = { x: 300, y: 200 }
    const pan = { x: -100, y: -50 }

    const zoomed = zoomAt(pan, 1, 2, at)

    // Where the world point under `at` was before, and where it is after.
    const before = { x: (at.x - pan.x) / 1, y: (at.y - pan.y) / 1 }
    const after = { x: (at.x - zoomed.x) / 2, y: (at.y - zoomed.y) / 2 }

    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('changes nothing when the scale does not', () => {
    expect(zoomAt({ x: -10, y: -20 }, 1.5, 1.5, { x: 5, y: 5 })).toStrictEqual({ x: -10, y: -20 })
  })
})

describe(heldView, () => {
  /** The ship comes back on the same pixel *and* at the same size — the second half was missing. */
  it('puts the spot back where it was, at the scale it was', () => {
    const view = heldView({ x: 400, y: 300, scale: 2 }, { x: 100, y: 50 }, MIN_ZOOM)

    expect(view.zoom).toBe(2)
    expect(view.pan.x + 100 * view.zoom).toBe(400)
    expect(view.pan.y + 50 * view.zoom).toBe(300)
  })

  /** Clamped like a wheel turn: past the largest scale is not a size anything is legible at. */
  it('stays within what a wheel could reach', () => {
    expect(heldView({ x: 0, y: 0, scale: 99 }, { x: 0, y: 0 }, MIN_ZOOM).zoom).toBe(MAX_SCALE)
    expect(heldView({ x: 0, y: 0, scale: 0.01 }, { x: 0, y: 0 }, MIN_ZOOM).zoom).toBe(MIN_ZOOM)
  })

  /** And still on the spot after clamping, because the pan is worked out from the clamped scale. */
  it('keeps the spot under the hold when the scale had to give', () => {
    const view = heldView({ x: 400, y: 300, scale: 99 }, { x: 100, y: 50 }, MIN_ZOOM)

    expect(view.pan.x + 100 * view.zoom).toBe(400)
  })
})

describe(wheelPixels, () => {
  it('passes pixels through', () => {
    expect(wheelPixels(42, 0, 800)).toBe(42)
  })

  it('turns lines and pages into pixels', () => {
    expect(wheelPixels(3, 1, 800)).toBe(48)
    expect(wheelPixels(-1, 2, 800)).toBe(-800)
  })
})

describe(wheelZoom, () => {
  it('is one step for one notch of a mouse wheel, in either direction', () => {
    expect(wheelZoom(-100)).toBeCloseTo(ZOOM_STEP)
    expect(wheelZoom(100)).toBeCloseTo(1 / ZOOM_STEP)
  })

  /**
   * The trackpad case. A pinch arrives as many small events, and each of them used to be a whole
   * step: thirty events, thirty steps, a factor of 66 for one gesture.
   */
  it('is a sliver of a step for the few pixels a pinch event carries', () => {
    const pinch = Array.from({ length: 30 }, () => wheelZoom(-3)).reduce((a, b) => a * b, 1)

    expect(pinch).toBeCloseTo(ZOOM_STEP ** 0.9)
  })

  it('never goes further than one notch per event', () => {
    expect(wheelZoom(-1000)).toBeCloseTo(ZOOM_STEP)
  })

  it('changes nothing for no movement', () => {
    expect(wheelZoom(0)).toBe(1)
  })
})
