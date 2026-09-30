import { describe, expect, it } from 'vitest'

import { BERTH } from './plan'
import { quest, ship } from './testing'
import {
  BERTH_SLACK,
  bridgeOf,
  cargoOf,
  DECK,
  hasPlume,
  hullOf,
  landedOf,
  LANDED_PER_ROW,
  LENGTH_CEILING,
  MAX_YAW,
  mooringOf,
  offsetOf,
  outlineOf,
  pierRows,
  pierRowY,
  questAt,
  SIZE,
  yawOf,
} from './vessel'

const strewn = { dirty: true, stash: 3, ahead: 2 } as const

describe(outlineOf, () => {
  /**
   * The silhouette is the whole reason for the change of view: a long shape with a point at one
   * end is the one thing nobody mistakes for a building, which is what the isometric boxes were.
   */
  it('has one point at the stem and a flat transom', () => {
    const outline = outlineOf(30, 6)
    const stem = outline.filter((point) => point.x === 30)
    const transom = outline.filter((point) => point.x === 0)

    expect(stem).toStrictEqual([{ x: 30, y: 0 }])
    expect(transom).toHaveLength(2)
  })

  it('stays within its own length and beam', () => {
    const outline = outlineOf(24, 7)

    for (const point of outline) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(24)
      expect(Math.abs(point.y)).toBeLessThanOrEqual(3.5)
    }
  })

  it('is symmetric about the centreline', () => {
    const outline = outlineOf(30, 6)
    const port = outline.filter((point) => point.y < 0)
    const starboard = outline.filter((point) => point.y > 0)

    const along = (points: readonly { x: number }[]): number[] =>
      points.map((point) => point.x).sort((a, b) => a - b)

    expect(along(port)).toStrictEqual(along(starboard))
  })
})

describe(hullOf, () => {
  /**
   * Length follows the project score — the one place being busy buys space. Bounded at both ends:
   * a repository with eighteen thousand points must not need its own row, and one with four
   * commits still has to look like a ship.
   */
  it('grows with the score and stops', () => {
    const small = hullOf(ship(), 10)
    const big = hullOf(ship(), 3000)
    const huge = hullOf(ship(), LENGTH_CEILING * 5)

    expect(big.length).toBeGreaterThan(small.length)
    expect(big.beam).toBeGreaterThan(small.beam)
    expect(small.length).toBeGreaterThanOrEqual(SIZE.minLength)
    expect(huge.length).toBeLessThanOrEqual(SIZE.maxLength)
    expect(huge.beam).toBeLessThanOrEqual(SIZE.maxBeam)
  })

  it('does not let a repository with no work at all go negative', () => {
    // `Hull.length` is a ship's length, not an array's — `toHaveLength` would be nonsense here.
    /* eslint-disable vitest/prefer-to-have-length */
    expect(hullOf(ship(), 0).length).toBe(SIZE.minLength)
    expect(hullOf(ship(), -5).length).toBe(SIZE.minLength)
    /* eslint-enable vitest/prefer-to-have-length */
  })
})

describe(offsetOf, () => {
  /**
   * The gamification lever. What somebody can fix in two minutes has to be what moves the picture
   * most — so a clean tree lies against the concrete and a strewn one stands right off it.
   */
  it('lies snug when the tree is clean and stands off when it is not', () => {
    expect(offsetOf(ship())).toBe(0)
    expect(offsetOf(ship(strewn))).toBeGreaterThan(1)
    expect(offsetOf(ship(strewn))).toBeLessThanOrEqual(BERTH_SLACK)
  })
})

describe(yawOf, () => {
  it('lies straight when the tree is clean', () => {
    expect(yawOf(ship())).toBe(0)
  })

  /**
   * Small, and the side is a function of the path and never random: past about three degrees it
   * stops reading as a badly moored ship and starts reading as a broken renderer, and a hull that
   * swung the other way between two readings of the same harbour would make the picture
   * untrustworthy.
   */
  it('swings a little, always the same way for the same repository', () => {
    const subject = ship({ ...strewn, path: '/tmp/some/repo' })

    expect(Math.abs(yawOf(subject))).toBeGreaterThan(0)
    expect(Math.abs(yawOf(subject))).toBeLessThanOrEqual(MAX_YAW)
    expect(yawOf(subject)).toBe(yawOf(ship({ ...strewn, path: '/tmp/some/repo' })))
  })
})

describe(mooringOf, () => {
  /**
   * The lines have to reach the quay wherever the ship is lying, which is why the offset is passed
   * in rather than read again here: the scene has already placed the body with it, and two
   * readings of one number are two chances to disagree about where the quay is.
   */
  it('runs to the quay edge and leads away from the ship', () => {
    const hull = hullOf(ship(), 400)
    const lines = mooringOf(hull, 1.8)

    expect(lines).toHaveLength(2)

    for (const line of lines) {
      expect(line.to.y).toBe(-BERTH.laneCentre - 1.8)
    }

    expect(lines[0]?.to.x).toBeLessThan(0)
    expect(lines[1]?.to.x).toBeGreaterThan(hull.length)
  })
})

describe(cargoOf, () => {
  /**
   * Aboard means done. Everything still owed stands on the pier, and that split is the whole
   * picture in one sentence — the same division the task list makes in words.
   */
  it('carries what is met and nothing else', () => {
    const subject = ship({
      quests: [
        quest('a', 'met'),
        quest('b', 'violated'),
        quest('c', 'unmeasured'),
        quest('d', 'notApplicable'),
      ],
    })
    const cargo = cargoOf(subject, hullOf(subject, 100))

    expect(cargo.map((box) => box.quest.id)).toStrictEqual(['a'])
  })

  it('carries nothing where nothing binds', () => {
    const subject = ship({ quests: [quest('a', 'notApplicable')] })

    expect(cargoOf(subject, hullOf(subject, 100))).toStrictEqual([])
  })

  it('carries nothing where nothing has been achieved', () => {
    const subject = ship({ quests: [quest('a', 'violated'), quest('b', 'waiting')] })

    expect(cargoOf(subject, hullOf(subject, 100))).toStrictEqual([])
  })

  it('stows from aft forward', () => {
    const subject = ship({ quests: [quest('a', 'met'), quest('b', 'met'), quest('c', 'met')] })
    const cargo = cargoOf(subject, hullOf(subject, 100))

    expect(cargo[0]?.spot.x).toBeLessThanOrEqual(cargo[2]?.spot.x ?? 0)
  })

  /**
   * Every box aboard, on the shortest hull there is, however many there are. The bays are squeezed
   * to the deck they have rather than stowed over the side — which is the one failure a drawing
   * cannot explain away.
   */
  it('keeps every container on the deck, on the smallest hull', () => {
    const many = Array.from({ length: 15 }, (_, index) => quest(`q${String(index)}`, 'met'))
    const subject = ship({ quests: many })
    const hull = hullOf(subject, 0)

    expect(cargoOf(subject, hull)).toHaveLength(15)

    for (const box of cargoOf(subject, hull)) {
      expect(box.spot.x - box.along / 2).toBeGreaterThanOrEqual(hull.length * DECK.from - 0.001)
      expect(box.spot.x + box.along / 2).toBeLessThanOrEqual(hull.length * DECK.to + 0.001)
      // 0.86 of the half beam is where the taper has reached by the forward end of the deck.
      expect(Math.abs(box.spot.y) + box.across / 2).toBeLessThanOrEqual((hull.beam / 2) * 0.86)
    }
  })
})

describe(landedOf, () => {
  /**
   * Not measurable stands on the pier with the rest, and that is deliberate: a demand nothing
   * could answer is still a demand this repository has not satisfied, and leaving it ashore would
   * quietly turn the blind spot into a pass. What it is *not* is a violation, and the colour and
   * the sheet keep saying so.
   */
  it('lands everything binding that is not met', () => {
    const subject = ship({
      quests: [
        quest('a', 'met'),
        quest('b', 'violated'),
        quest('c', 'unmeasured'),
        quest('d', 'waiting'),
        quest('e', 'notApplicable'),
      ],
    })

    const owed = landedOf(subject)
      .map((box) => box.quest.id)
      .sort((a, b) => a.localeCompare(b))

    expect(owed).toStrictEqual(['b', 'c', 'd'])
  })

  it('leaves the pier clear when everything is met', () => {
    expect(landedOf(ship({ quests: [quest('a', 'met')] }))).toStrictEqual([])
  })

  it('puts the worst nearest the stern, where reading starts', () => {
    const subject = ship({ quests: [quest('offen', 'waiting'), quest('kaputt', 'violated')] })

    expect(landedOf(subject)[0]?.quest.id).toBe('kaputt')
  })

  /** On the planking and never in the water: the pier is between the hull and the land. */
  it('stands every box on the pier', () => {
    const many = Array.from({ length: 11 }, (_, index) => quest(`q${String(index)}`, 'violated'))

    for (const box of landedOf(ship({ quests: many }))) {
      expect(box.spot.y + box.across / 2).toBeLessThan(-BERTH.laneCentre)
      expect(box.spot.y - box.across / 2).toBeGreaterThan(-(BERTH.laneCentre + BERTH.pier))
      expect(box.spot.x - box.along / 2).toBeGreaterThan(0)
      expect(box.spot.x + box.along / 2).toBeLessThan(BERTH.pitch)
    }
  })

  it('wraps into a second row rather than running into the next berth', () => {
    const many = Array.from({ length: LANDED_PER_ROW + 1 }, (_, index) =>
      quest(`q${String(index)}`, 'violated'),
    )
    const boxes = landedOf(ship({ quests: many }))

    expect(boxes.at(-1)?.spot.y).toBe(pierRowY(1))
    expect(boxes.at(-1)?.spot.x).toBe(boxes[0]?.spot.x)
    expect(pierRows(LANDED_PER_ROW + 1)).toBe(2)
  })
})

describe(bridgeOf, () => {
  it('grows with the demands the ship is held to, and stops', () => {
    const few = ship({ quests: [quest('a', 'met')] })
    const many = ship({
      quests: Array.from({ length: 11 }, (_, index) => quest(`q${String(index)}`, 'met')),
    })
    const huge = ship({
      quests: Array.from({ length: 60 }, (_, index) => quest(`q${String(index)}`, 'met')),
    })

    expect(bridgeOf(many, hullOf(many, 1)).along).toBeGreaterThan(
      bridgeOf(few, hullOf(few, 1)).along,
    )
    expect(bridgeOf(huge, hullOf(huge, 1)).along).toBe(bridgeOf(many, hullOf(many, 1)).along + 0.16)
  })

  /** Aft, and clear of where the cargo starts — otherwise the block would sit on a container. */
  it('stands aft of the cargo', () => {
    const subject = ship({ quests: [quest('a', 'met')] })
    const hull = hullOf(subject, 1)
    const block = bridgeOf(subject, hull)

    expect(block.spot.x + block.along / 2).toBeLessThanOrEqual(hull.length * DECK.from)
    expect(block.across).toBeLessThan(hull.beam)
  })

  it('still gives a block to a ship nothing is demanded of', () => {
    expect(bridgeOf(ship(), hullOf(ship(), 1)).along).toBeGreaterThan(0)
  })
})

describe(hasPlume, () => {
  /** Earned, not decorative: both halves, because either alone is a different sentence. */
  it('needs every binding demand met and a clean tree', () => {
    expect(hasPlume(ship({ quests: [quest('a', 'met')] }))).toBe(true)
    expect(hasPlume(ship({ quests: [quest('a', 'met')], stash: 1 }))).toBe(false)
    expect(hasPlume(ship({ quests: [quest('a', 'violated')] }))).toBe(false)
  })

  it('is not earned by a ship nothing is demanded of', () => {
    expect(hasPlume(ship())).toBe(false)
  })
})

describe(questAt, () => {
  const subject = ship({ quests: [quest('a', 'met'), quest('b', 'met'), quest('c', 'met')] })
  const hull = hullOf(subject, 400)
  const boxes = cargoOf(subject, hull)

  it('answers with the demand whose box was hit', () => {
    for (const box of boxes) {
      expect(questAt(boxes, box.spot)).toBe(box.quest.id)
    }
  })

  /**
   * The whole of the rectangle and not only its middle: a click lands where a finger lands, and a
   * box that only answers at its centre is a box nobody can hit.
   */
  it('counts a corner of a box as the box', () => {
    const box = boxes[0]

    expect(box).toBeDefined()
    expect(
      questAt(boxes, {
        x: (box?.spot.x ?? 0) + (box?.along ?? 0) / 2 - 0.01,
        y: (box?.spot.y ?? 0) + (box?.across ?? 0) / 2 - 0.01,
      }),
    ).toBe(box?.quest.id)
  })

  /** A click on bare deck is an answer too: it means "this ship", not "this demand". */
  it('says nothing for a point between the boxes', () => {
    expect(questAt(boxes, { x: 0, y: 0 })).toBeNull()
    expect(questAt([], { x: 1, y: 1 })).toBeNull()
  })
})
