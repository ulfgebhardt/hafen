import { describe, expect, it } from 'vitest'

import { placePopup } from './popup'

describe(placePopup, () => {
  it('opens under the button, right-aligned to it, where there is room', () => {
    expect(placePopup({ left: 900, right: 1000, bottom: 40 }, 1440, 384)).toStrictEqual({
      top: 44,
      left: 616,
      width: 384,
    })
  })

  /** The Mac case: the button wrapped to the left of a new line. */
  it('moves right rather than past the left edge', () => {
    expect(placePopup({ left: 16, right: 120, bottom: 70 }, 1440, 384).left).toBe(16)
  })

  it('moves left rather than past the right edge', () => {
    const placed = placePopup({ left: 1400, right: 1500, bottom: 40 }, 1440, 384)

    expect(placed.left + placed.width).toBe(1424)
  })

  it('narrows to the window when the window is narrower than the popup', () => {
    expect(placePopup({ left: 10, right: 100, bottom: 40 }, 300, 384)).toStrictEqual({
      top: 44,
      left: 16,
      width: 268,
    })
  })
})
