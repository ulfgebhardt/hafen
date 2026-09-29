import { describe, expect, it } from 'vitest'

import { draught, frames, HULL, MAX_DRAUGHT, outline, segments, storeys } from './hull'
import { quest, ship } from './testing'

describe(outline, () => {
  it('closes a hull inside its own dimensions', () => {
    const points = outline()

    expect(points.length).toBeGreaterThan(3)

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(HULL.length)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(HULL.depth)
    }
  })

  it('rakes the bow forward of the keel, which is what makes it a bow', () => {
    const points = outline()
    const deckBow = Math.max(...points.filter((point) => point.y === 0).map((point) => point.x))
    const keelBow = Math.max(
      ...points.filter((point) => point.y === HULL.depth).map((point) => point.x),
    )

    expect(deckBow).toBeGreaterThan(keelBow)
  })
})

describe(frames, () => {
  it('spaces them evenly between stem and stern', () => {
    const spacing = frames(5)
      .slice(1)
      .map((x, index) => x - (frames(5)[index] ?? 0))

    for (const gap of spacing) {
      expect(gap).toBeCloseTo(spacing[0] ?? 0, 6)
    }
  })

  it('keeps them inside the hull', () => {
    for (const x of frames()) {
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(HULL.length)
    }
  })
})

describe(segments, () => {
  /** The chosen reading: the deck is divided by what the ship actually owes. */
  it('gives one segment per binding quest', () => {
    const subject = ship({
      quests: [quest('a', 'met'), quest('b', 'violated'), quest('c', 'waiting')],
    })

    expect(segments(subject)).toHaveLength(3)
  })

  it('leaves out what does not apply, so it takes no room', () => {
    const subject = ship({ quests: [quest('a', 'met'), quest('b', 'notApplicable')] })
    const drawn = segments(subject)

    expect(drawn).toHaveLength(1)
    expect(drawn[0]?.verdict).toBe('met')
  })

  /**
   * Empty and not a full set of blanks: "never measured" and "measured and empty" must not look
   * alike, which is why the renderer draws a dashed deck for this case instead.
   */
  it('comes back empty for a ship nothing is demanded of', () => {
    expect(segments(ship())).toStrictEqual([])
    expect(segments(ship({ quests: [quest('a', 'notApplicable')] }))).toStrictEqual([])
  })

  it('tiles the deck without a gap or an overlap', () => {
    const subject = ship({
      quests: [quest('a', 'met'), quest('b', 'violated'), quest('c', 'unmeasured')],
    })
    const drawn = segments(subject)

    for (const [index, block] of drawn.slice(1).entries()) {
      const previous = drawn[index]

      expect(block.x).toBeCloseTo((previous?.x ?? 0) + (previous?.width ?? 0), 6)
    }
  })

  /** No measurement says one demand is bigger than another, so none of them is drawn wider. */
  it('gives every demand the same width', () => {
    const drawn = segments(
      ship({ quests: [quest('a', 'met'), quest('b', 'violated'), quest('c', 'waiting')] }),
    )

    for (const block of drawn) {
      expect(block.width).toBeCloseTo(drawn[0]?.width ?? 0, 6)
    }
  })

  it('puts the worst forward, the way the list reads', () => {
    const drawn = segments(ship({ quests: [quest('gut', 'met'), quest('kaputt', 'violated')] }))

    expect(drawn.map((block) => block.quest.id)).toStrictEqual(['kaputt', 'gut'])
  })

  it('stays inside the hull however many demands there are', () => {
    const many = Array.from({ length: 17 }, (_, index) => quest(`q${String(index)}`, 'met'))
    const drawn = segments(ship({ quests: many }))

    expect(drawn).toHaveLength(17)

    for (const block of drawn) {
      expect(block.x).toBeGreaterThan(0)
      expect(block.x + block.width).toBeLessThanOrEqual(HULL.length)
    }
  })
})

describe(storeys, () => {
  /** A measurement, not a flourish: a ship held to more demands is a bigger vessel. */
  it('grows with the number of binding demands', () => {
    const few = ship({ quests: [quest('a', 'met')] })
    const many = ship({
      quests: Array.from({ length: 11 }, (_, index) => quest(`q${String(index)}`, 'met')),
    })

    expect(storeys(many)).toBeGreaterThan(storeys(few))
  })

  it('still draws a bridge on a ship nothing is demanded of', () => {
    expect(storeys(ship())).toBe(1)
  })

  /** Capped, so one outlier does not set the scale for the whole harbour. */
  it('stops at four', () => {
    const huge = ship({
      quests: Array.from({ length: 60 }, (_, index) => quest(`q${String(index)}`, 'met')),
    })

    expect(storeys(huge)).toBe(4)
  })
})

describe(draught, () => {
  it('rides high when everything is met and sits low when nothing is', () => {
    const light = ship({ quests: [quest('a', 'met'), quest('b', 'met')] })
    const loaded = ship({ quests: [quest('a', 'violated'), quest('b', 'violated')] })

    expect(draught(loaded)).toBeGreaterThan(draught(light))
  })

  it('keeps the hull in the water at both extremes', () => {
    const cases = [
      ship(),
      ship({ quests: [quest('a', 'met')] }),
      ship({ quests: [quest('a', 'violated')] }),
      ship({ quests: [quest('a', 'notApplicable')] }),
    ]

    for (const subject of cases) {
      expect(draught(subject)).toBeGreaterThan(0)
      expect(draught(subject)).toBeLessThan(1)
    }
  })

  /**
   * The scene lays the caption out below `MAX_DRAUGHT`, so nothing may sink past it — that was
   * the bug: labels drawn across the hull of every laden ship.
   */
  it('never sinks past the depth the layout reserves', () => {
    const worst = ship({
      quests: Array.from({ length: 9 }, (_, index) => quest(`q${String(index)}`, 'violated')),
    })

    expect(draught(worst)).toBeLessThanOrEqual(MAX_DRAUGHT)
    expect(draught(worst)).toBeCloseTo(MAX_DRAUGHT, 6)
  })

  /** Waiting and unmeasured are open too: only `met` lightens a ship. */
  it('counts anything not met as load', () => {
    const waiting = ship({ quests: [quest('a', 'waiting')] })
    const met = ship({ quests: [quest('a', 'met')] })

    expect(draught(waiting)).toBeGreaterThan(draught(met))
  })
})
