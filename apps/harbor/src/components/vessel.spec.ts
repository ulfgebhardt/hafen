import { NO_WORK } from '@hafen/core'
import { describe, expect, it } from 'vitest'

import { BERTH } from './plan'
import { quest, ship } from './testing'
import {
  apronOf,
  BEAM_CEILING,
  beamShare,
  BERTH_SLACK,
  BAYS_ACROSS,
  boxOn,
  bridgeOf,
  cargoOf,
  CONTAINER,
  deckOf,
  DECK,
  fieldOf,
  heapLevel,
  forgeLoad,
  gangwayOf,
  hasGangway,
  hasPlume,
  hullMarks,
  hullOf,
  within,
  landedOf,
  LANDED_PER_ROW,
  LENGTH_CEILING,
  MARK_ROW,
  MAX_YAW,
  mooringOf,
  offsetOf,
  outlineOf,
  pierRowY,
  pierMarks,
  pierRows,
  questAt,
  SEAM,
  SIZE,
  yawOf,
} from './vessel'

import type { Box } from './vessel'
import type { QuestResult } from '@hafen/core'

const strewn = { dirty: true, stash: 3, ahead: 2 } as const

/** `count` demands this ship still owes, which is what stands on her apron. */
const owing = (count: number): QuestResult[] =>
  Array.from({ length: count }, (_, index) => quest(`q${String(index)}`, 'violated'))

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
  const worked = (commits: number, authors = 1) =>
    ship({ ledger: { total: { ...NO_WORK, commits, authors }, own: NO_WORK } })

  /**
   * Length is the history, beam is the people, and the two must be able to disagree: a repository
   * can be long and lonely, or short and crowded.
   */
  it('takes her length from the commits and her beam from the authors', () => {
    const quiet = hullOf(worked(10, 1))
    const long = hullOf(worked(3000, 1))
    const crowded = hullOf(worked(10, 200))

    expect(long.length).toBeGreaterThan(quiet.length)
    expect(long.beam).toBe(quiet.beam)
    expect(crowded.beam).toBeGreaterThan(quiet.beam)
    expect(crowded).toHaveLength(quiet.length)
  })

  /**
   * Bounded at both ends: a fleet's busiest repository must not need its own row, and its
   * quietest still has to look like a ship.
   */
  it('stops at both ends of its range', () => {
    const huge = hullOf(worked(LENGTH_CEILING * 5, BEAM_CEILING * 5))

    expect(huge.length).toBeLessThanOrEqual(SIZE.maxLength)
    expect(huge.beam).toBeLessThanOrEqual(SIZE.maxBeam)
  })

  /**
   * And the range is wide, which is the whole reason this was changed.
   *
   * The readings span 18 447 to one in commits and 488 to one in authors; the drawing turned that
   * into a length range of 1.69 and a beam range of 1.29. Ninety-two ships came out looking like
   * ninety-two of the same ship.
   */
  it('varies enough to be seen', () => {
    const least = hullOf(worked(1, 1))
    const most = hullOf(worked(LENGTH_CEILING, BEAM_CEILING))

    expect(most.length / least.length).toBeGreaterThan(3)
    expect(most.beam / least.beam).toBeGreaterThan(2.5)
  })

  it('does not let a repository with no work at all go negative', () => {
    // `Hull.length` is a ship's length, not an array's — `toHaveLength` would be nonsense here.
    /* eslint-disable vitest/prefer-to-have-length */
    expect(hullOf(worked(0, 0)).length).toBe(SIZE.minLength)
    expect(hullOf(worked(-5, -5)).length).toBe(SIZE.minLength)
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
    const hull = hullOf(ship())
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
    const cargo = cargoOf(subject, hullOf(subject))

    expect(cargo.map((box) => box.quest.id)).toStrictEqual(['a'])
  })

  it('carries nothing where nothing binds', () => {
    const subject = ship({ quests: [quest('a', 'notApplicable')] })

    expect(cargoOf(subject, hullOf(subject))).toStrictEqual([])
  })

  it('carries nothing where nothing has been achieved', () => {
    const subject = ship({ quests: [quest('a', 'violated'), quest('b', 'waiting')] })

    expect(cargoOf(subject, hullOf(subject))).toStrictEqual([])
  })

  it('stows from aft forward', () => {
    const subject = ship({ quests: [quest('a', 'met'), quest('b', 'met'), quest('c', 'met')] })
    const cargo = cargoOf(subject, hullOf(subject))

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
    const hull = hullOf(subject)

    expect(cargoOf(subject, hull)).toHaveLength(15)

    for (const box of cargoOf(subject, hull)) {
      expect(box.spot.x - box.along / 2).toBeGreaterThanOrEqual(hull.length * DECK.from - 0.001)
      expect(box.spot.x + box.along / 2).toBeLessThanOrEqual(hull.length * DECK.to + 0.001)
      // 0.86 of the half beam is where the taper has reached by the forward end of the deck.
      expect(Math.abs(box.spot.y) + box.across / 2).toBeLessThanOrEqual((hull.beam / 2) * 0.86)
    }
  })
})

describe(boxOn, () => {
  const worked = (commits: number, authors = 1) =>
    hullOf(ship({ ledger: { total: { ...NO_WORK, commits, authors }, own: NO_WORK } }))

  /**
   * There is always water between two crates, and that is the point of them.
   *
   * A share of the beam alone was not enough, and the small ships showed it: at a beam of 2.6 the
   * gap came to four hundredths of a unit — three boxes drawn as one block, and a reader counting
   * demands off a hull counts one.
   */
  it.each([1, 50, 4000, 20000])('leaves a visible gap at %i commits', (commits) => {
    const box = boxOn(worked(commits, commits))

    expect(box.gap).toBeGreaterThanOrEqual(SEAM)
    // And a gap nobody can see beside a box is no gap: it has to be a real share of one.
    expect(box.gap / box.across).toBeGreaterThan(0.15)
  })

  /**
   * And the stack never goes over the side.
   *
   * The gap is sized first and the boxes take what is left, which makes that true by construction:
   * sizing the box first lets the two add up to more deck than there is.
   */
  it.each([1, 50, 4000, 20000])('keeps the stack on the deck at %i commits', (commits) => {
    const hull = worked(commits, commits)
    const box = boxOn(hull)
    const spread = BAYS_ACROSS * box.across + (BAYS_ACROSS - 1) * box.gap

    expect(spread).toBeLessThanOrEqual(hull.beam * CONTAINER.deck + 1e-9)
  })

  /** A big ship carries big crates: the box is a share of her, the gap only has a floor. */
  it('grows the crates with the ship', () => {
    expect(boxOn(worked(20000, 500)).across).toBeGreaterThan(boxOn(worked(1, 1)).across * 2)
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

    const owed = landedOf(subject, hullOf(subject))
      .map((box) => box.quest.id)
      .sort((a, b) => a.localeCompare(b))

    expect(owed).toStrictEqual(['b', 'c', 'd'])
  })

  it('leaves the pier clear when everything is met', () => {
    const clean = ship({ quests: [quest('a', 'met')] })

    expect(landedOf(clean, hullOf(clean))).toStrictEqual([])
  })

  it('puts the worst nearest the stern, where reading starts', () => {
    const subject = ship({ quests: [quest('offen', 'waiting'), quest('kaputt', 'violated')] })

    expect(landedOf(subject, hullOf(subject))[0]?.quest.id).toBe('kaputt')
  })

  /**
   * On the apron ahead of her bow, and inside her own berth.
   *
   * It used to stand on the planking, which is what made the planking fourteen units deep and gave
   * the harbour two kinds of walkway. The berth is what bounds it now: clear of the stem at one
   * end and of the next ship's stern at the other, so no two stacks can run together.
   */
  it('stacks every box on her own apron, ahead of her stem', () => {
    const many = Array.from({ length: 11 }, (_, index) => quest(`q${String(index)}`, 'violated'))
    const subject = ship({ quests: many })
    const hull = hullOf(subject)

    for (const box of landedOf(subject, hull)) {
      expect(box.spot.x - box.along / 2).toBeGreaterThanOrEqual(hull.length)
      expect(box.spot.x + box.along / 2).toBeLessThan(BERTH.pitch)
      // Narrower than the ship it waits for: a wider stack reads as two ships' cargo run together.
      expect(Math.abs(box.spot.y) + box.across / 2).toBeLessThan(SIZE.maxBeam)
    }
  })

  it('wraps into a second row rather than running into the next berth', () => {
    const many = Array.from({ length: LANDED_PER_ROW + 1 }, (_, index) =>
      quest(`q${String(index)}`, 'violated'),
    )
    const subject = ship({ quests: many })
    const boxes = landedOf(subject, hullOf(subject))

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

    expect(bridgeOf(many, hullOf(many)).along).toBeGreaterThan(bridgeOf(few, hullOf(few)).along)
    // Twelve is where it stops: a sixtieth demand buys exactly as much deckhouse as the twelfth.
    expect(bridgeOf(huge, hullOf(huge)).along).toBeCloseTo(
      (bridgeOf(many, hullOf(many)).along * (0.09 + 12 * 0.0068)) / (0.09 + 11 * 0.0068),
    )
  })

  /** Aft, and clear of where the cargo starts — otherwise the block would sit on a container. */
  it('stands aft of the cargo', () => {
    const subject = ship({ quests: [quest('a', 'met')] })
    const hull = hullOf(subject)
    const block = bridgeOf(subject, hull)

    expect(block.spot.x + block.along / 2).toBeLessThanOrEqual(hull.length * DECK.from)
    expect(block.across).toBeLessThan(hull.beam)
  })

  it('still gives a block to a ship nothing is demanded of', () => {
    expect(bridgeOf(ship(), hullOf(ship())).along).toBeGreaterThan(0)
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
  const hull = hullOf(subject)
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

describe('what waits and what she is', () => {
  const busy = ship({
    ahead: 2,
    behind: 1,
    stash: 1,
    docks: ['/docks/one'],
    submodules: [{ path: 'lib', state: 'aboard' as const, at: 'aaaaaaaa', url: null }],
    working: { staged: 0, unstaged: 0, untracked: 0, conflicted: 1 },
  })
  const hull = hullOf(busy)

  /**
   * The complaint this answers: a flag for unpushed commits and a wake for commits upstream hung
   * on the hull, so a repository with *more* left to do came out the more interesting drawing.
   */
  it('puts everything there is to do on the planking', () => {
    const waiting = pierMarks(busy, hullOf(busy)).map((box) => box.kind)

    expect(waiting).toContain('pennant')
    expect(waiting).toContain('drag')
    expect(waiting).toContain('stash')
  })

  /** What stays aboard is what she *is*: a stop, the trees she owns, the repositories she carries. */
  it('leaves only what she is on the hull', () => {
    const carried = new Set(hullMarks(busy, hull).map((box) => box.kind))

    expect([...carried].sort()).toStrictEqual(['boat', 'damage', 'tender'])
  })

  /** Every mark lands in exactly one of the two, or a click would answer twice. */
  it('draws nothing in both places', () => {
    const onPier = new Set(pierMarks(busy, hullOf(busy)).map((box) => box.kind))

    for (const box of hullMarks(busy, hull)) {
      expect(onPier.has(box.kind)).toBe(false)
    }
  })
})

describe(gangwayOf, () => {
  /**
   * It has to reach: a ship standing off because her tree is untidy is exactly the ship with a
   * loaded pier, so the plank grows with the gap.
   */
  it('runs from her side to the planking, however far off she lies', () => {
    const hull = hullOf(ship())
    const snug = gangwayOf(hull, 0)
    const off = gangwayOf(hull, 2)

    expect(snug.from.y).toBe(-hull.beam / 2)
    expect(snug.to.y).toBeLessThan(snug.from.y)
    expect(off.to.y).toBeLessThan(snug.to.y)
    expect(off.from.x).toBe(snug.from.x)
  })
})

describe(apronOf, () => {
  const hull = hullOf(ship())
  const stack = (count: number): readonly Box[] => landedOf(ship({ quests: owing(count) }), hull)

  /** Nothing waiting is not an empty platform: an empty platform says something stood here. */
  it('has no platform where nothing waits', () => {
    expect(apronOf([])).toBeNull()
  })

  it('covers everything on it, with a margin all round', () => {
    const items = stack(5)
    const apron = apronOf(items)

    for (const item of items) {
      expect(item.spot.x - item.along / 2).toBeGreaterThan(
        (apron?.spot.x ?? 0) - (apron?.along ?? 0) / 2,
      )
      expect(item.spot.y + item.across / 2).toBeLessThan(
        (apron?.spot.y ?? 0) + (apron?.across ?? 0) / 2,
      )
    }
  })

  /**
   * Measured off what stands there, not off a row count: two different pieces of code put things
   * on this apron, and a platform derived from one left the other standing on open water.
   */
  it('reaches round a row that came from somewhere else', () => {
    const marks = [{ spot: { x: 40, y: pierRowY(MARK_ROW) }, along: 1, across: 0.8 }]
    const withMarks = apronOf([...stack(2), ...marks])
    const without = apronOf(stack(2))

    expect(withMarks?.across).toBeGreaterThan(without?.across ?? 0)
  })
})

describe(within, () => {
  /** The one shape here whose edge is not a rectangle, so it needs a real test. */
  it('knows the inside of a hull from the outside of it', () => {
    const outline = outlineOf(40, 10)

    expect(within(outline, { x: 20, y: 0 })).toBe(true)
    expect(within(outline, { x: 20, y: 9 })).toBe(false)
    // Past the bow, where a hull has already tapered away to a point.
    expect(within(outline, { x: 39, y: 4 })).toBe(false)
  })
})

describe(deckOf, () => {
  /**
   * A hull somebody can actually walk. The smallest one in the harbour is nine by two and a half
   * and has **no walkable deck at all** — which is honest: a dinghy has no promenade, and the
   * figures simply stay ashore. `deckOf` says that with `null` rather than with a ring of one.
   */
  const hull = hullOf(
    ship({ ledger: { total: { ...NO_WORK, commits: 4000, authors: 120 }, own: NO_WORK } }),
  )

  /**
   * Two faults with one cause, and this is the measurement that replaces both.
   *
   * The deck was a ring at seven hand-picked fractions of her length and `0.82` of her half beam.
   * That is clear of the widest *cargo* stack and not of the deckhouse at `0.72`, so figures
   * walked through it; and a ring that turns at `x * 0.95` is outside a hull whose bow starts
   * tapering at `0.82`.
   */
  it('keeps every spot inside her outline', () => {
    const ground = deckOf(hull, [])
    const outline = hull.outline

    expect(ground).not.toBeNull()

    for (const spot of ground?.spots ?? []) {
      expect(within(outline, spot)).toBe(true)
    }
  })

  it('leaves out every spot that something stands on', () => {
    // A worked hull, because the smallest one has no walkable deck at all — see below.
    const loaded = ship({
      ledger: { total: { ...NO_WORK, commits: 4000, authors: 120 }, own: NO_WORK },
      quests: Array.from({ length: 8 }, (_, i) => quest(`q${String(i)}`, 'met')),
    })
    const standing = [...cargoOf(loaded, hull), bridgeOf(loaded, hull)]
    const ground = deckOf(hull, standing)

    expect(ground).not.toBeNull()

    for (const spot of ground?.spots ?? []) {
      for (const box of standing) {
        const over =
          Math.abs(spot.x - box.spot.x) < box.along / 2 &&
          Math.abs(spot.y - box.spot.y) < box.across / 2

        expect(over).toBe(false)
      }
    }
  })

  /** Walkable means connected: a spot nobody can step to is a figure standing in one place. */
  it('joins what it keeps into one walk', () => {
    const ground = deckOf(hull, [])

    expect(ground?.links.length).toBeGreaterThan(0)
    expect(ground?.gate).toBeGreaterThanOrEqual(0)
  })

  /** The gate is at the foot of the plank, so coming aboard is one step from it. */
  it('opens where the gangway lands', () => {
    const ground = deckOf(hull, [])
    const gate = ground?.spots[ground.gate]
    const landing = { x: hull.length * 0.22, y: -hull.beam / 2 }

    const away = (spot: { x: number; y: number }) =>
      Math.hypot(spot.x - landing.x, spot.y - landing.y)

    expect(gate).toBeDefined()

    for (const spot of ground?.spots ?? []) {
      expect(away(gate ?? landing)).toBeLessThanOrEqual(away(spot) + 1e-9)
    }
  })

  /** A hull too small to stand on is nothing to walk, not an empty ground to join to a plank. */
  it('is nothing where no cell fits inside her at all', () => {
    expect(deckOf({ length: 0.2, beam: 0.2, outline: outlineOf(0.2, 0.2) }, [])).toBeNull()
  })
})

describe(fieldOf, () => {
  const hull = hullOf(ship())
  const stack = (count: number): readonly Box[] => landedOf(ship({ quests: owing(count) }), hull)

  it('has no ground where there is no platform', () => {
    expect(fieldOf([], null)).toBeNull()
  })

  /**
   * The claim the whole arrangement rests on: a figure on the apron is on ground, never on a
   * package and never on water. Both are true by construction — a blocked cell is not in the
   * grid, and the grid does not reach past the platform.
   */
  it('puts no standing place on a package', () => {
    const items = stack(9)
    const field = fieldOf(items, apronOf(items))

    for (const spot of field?.spots ?? []) {
      for (const item of items) {
        const over =
          Math.abs(spot.x - item.spot.x) < item.along / 2 &&
          Math.abs(spot.y - item.spot.y) < item.across / 2

        expect(over).toBe(false)
      }
    }
  })

  it('keeps every standing place on the platform', () => {
    const items = stack(5)
    const apron = apronOf(items)
    const field = fieldOf(items, apron)

    for (const spot of field?.spots ?? []) {
      expect(Math.abs(spot.x - (apron?.spot.x ?? 0))).toBeLessThanOrEqual((apron?.along ?? 0) / 2)
      expect(Math.abs(spot.y - (apron?.spot.y ?? 0))).toBeLessThanOrEqual((apron?.across ?? 0) / 2)
    }
  })

  /** Freely: every place is reachable from every other, or somebody is standing on an island. */
  it('joins all of its ground together', () => {
    const items = stack(9)
    const field = fieldOf(items, apronOf(items))
    const neighbours = new Map<number, number[]>()
    for (const [one, other] of field?.links ?? []) {
      neighbours.set(one, [...(neighbours.get(one) ?? []), other])
      neighbours.set(other, [...(neighbours.get(other) ?? []), one])
    }
    const seen = new Set<number>([field?.gate ?? 0])
    const todo = [field?.gate ?? 0]
    while (todo.length > 0) {
      for (const next of neighbours.get(todo.pop() ?? 0) ?? []) {
        if (!seen.has(next)) {
          seen.add(next)
          todo.push(next)
        }
      }
    }

    expect(seen.size).toBe(field?.spots.length)
  })

  /** The gate is the way on: the spot nearest the planking, which lies towards -y. */
  it('opens towards the planking', () => {
    const items = stack(4)
    const field = fieldOf(items, apronOf(items, -8))
    const gate = field?.spots[field.gate]

    expect(gate?.y).toBe(Math.min(...(field?.spots ?? []).map((spot) => spot.y)))
  })
})

describe(apronOf, () => {
  const hull = hullOf(ship())

  /** An apron that stops short of the walkway is an island: somebody on it got there by jumping. */
  it('reaches the planking where it is told where that is', () => {
    const items = landedOf(ship({ quests: owing(3) }), hull)
    const alone = apronOf(items)
    const joined = apronOf(items, -9)

    expect(joined?.across).toBeGreaterThan(alone?.across ?? 0)
    expect((joined?.spot.y ?? 0) - (joined?.across ?? 0) / 2).toBeCloseTo(-9)
  })

  /** And never shrinks to meet it: a plank inside the stack would cut the platform in half. */
  it('ignores a planking that lies inside the stack', () => {
    const items = landedOf(ship({ quests: owing(3) }), hull)

    expect(apronOf(items, 0)?.across).toBe(apronOf(items)?.across)
  })
})

describe(heapLevel, () => {
  /**
   * The two scales differ on purpose. Measured over the 71 repositories this fleet could read:
   * issues run 0 at the median and 51 at the ninetieth percentile, pull requests 0 and 14 — so
   * ten issues is a quiet repository and ten pull requests is a queue.
   */
  it('reads ten issues as few and ten pull requests as many', () => {
    expect(heapLevel('issue', 10)).toBeLessThan(heapLevel('pull', 10))
  })

  it('has nothing to show where nothing is open', () => {
    expect(heapLevel('issue', 0)).toBe(0)
    expect(heapLevel('pull', 0)).toBe(0)
  })

  it('climbs with the count and stops at the top rung', () => {
    const climbs = [0, 1, 4, 5, 25, 100, 400].map((count) => heapLevel('issue', count))

    expect(climbs).toStrictEqual([0, 1, 1, 2, 3, 4, 5])
    expect(heapLevel('issue', 100000)).toBe(5)
  })

  /** A negative count cannot happen and must not invent a heap if it ever does. */
  it('takes nonsense as nothing', () => {
    expect(heapLevel('pull', -3)).toBe(0)
  })
})

describe(hasGangway, () => {
  const remote = { name: 'origin', url: 'git@github.com:o/r.git', forge: 'github' as const }

  /** The question is whether anybody can reach her from anywhere else. */
  it('gives a plank to a ship with a remote', () => {
    expect(hasGangway(ship({ remotes: [remote] }))).toBe(true)
    expect(hasGangway(ship({ remotes: [] }))).toBe(false)
  })

  /**
   * And never off her working tree. Six repositories here have no remote at all; before this,
   * each of them grew a gangway the moment somebody left one untracked file lying about, and lost
   * it again on the next `git clean`.
   */
  it('does not read a dirty tree as a way aboard', () => {
    const open = { staged: 2, unstaged: 3, untracked: 12, conflicted: 0 }

    expect(hasGangway(ship({ remotes: [], dirty: true, working: open, stash: 4 }))).toBe(false)
    expect(hasGangway(ship({ remotes: [remote], dirty: false }))).toBe(true)
  })

  /** Any remote, because the plank asks for a way to the shore and not for where she came from. */
  it('counts a remote that is not the origin', () => {
    expect(
      hasGangway(
        ship({ remotes: [{ name: 'upstream', url: 'git@github.com:o/r.git', forge: 'github' }] }),
      ),
    ).toBe(true)
  })
})

describe(forgeLoad, () => {
  const hull = hullOf(ship())

  /** Nothing open is nothing on the apron — an empty row would say "asked and found none". */
  it('puts nothing on the apron where nothing is open', () => {
    expect(forgeLoad(hull, 0, 0)).toStrictEqual([])
  })

  /** A question and a crate of code: two kinds, and the row says which is which. */
  it('heaps issues and pull requests apart', () => {
    const boxes = forgeLoad(hull, 300, 2)
    const issues = boxes.filter((box) => box.kind === 'issue')
    const pulls = boxes.filter((box) => box.kind === 'pull')

    expect(issues).toHaveLength(5)
    expect(pulls).toHaveLength(1)
    expect(Math.min(...pulls.map((box) => box.spot.x))).toBeGreaterThan(
      Math.max(...issues.map((box) => box.spot.x)),
    )
  })

  /** The pile grows upward in rows rather than sideways for ever. */
  it('stacks a full heap in two rows', () => {
    const rows = new Set(
      forgeLoad(hull, 300, 0)
        .filter((box) => box.kind === 'issue')
        .map((box) => box.spot.y),
    )

    expect(rows.size).toBe(2)
  })

  /**
   * Beyond the other rows, because these are what other people left open here — and because the
   * side that merges with the walkway has to stay the side a person walks on.
   */
  it('stands beyond the rows that belong to the repository itself', () => {
    const boxes = forgeLoad(hull, 1, 0)

    expect(boxes[0]?.spot.y).toBeGreaterThan(pierRowY(MARK_ROW))
  })

  /** Two heaps that slid together as one shrank would be one heap that changes shape. */
  it('keeps the second heap in its place however small the first one is', () => {
    const full = forgeLoad(hull, 300, 300).filter((box) => box.kind === 'pull')
    const thin = forgeLoad(hull, 1, 300).filter((box) => box.kind === 'pull')

    expect(thin.map((box) => box.spot.x)).toStrictEqual(full.map((box) => box.spot.x))
  })
})

describe(beamShare, () => {
  /**
   * Heavy-tailed like everything else here, so logarithmic like everything else here: 1 author at
   * the bottom, 3 at the median, 8 at the third quartile and 488 at the top.
   */
  it('spends its width where the repositories actually are', () => {
    expect(beamShare(1)).toBe(0)
    expect(beamShare(3)).toBeGreaterThan(0.12)
    expect(beamShare(BEAM_CEILING)).toBeCloseTo(1)
    expect(beamShare(BEAM_CEILING * 9)).toBe(1)
  })

  /** A repository nobody could be counted in is drawn narrow, never at an invented middle. */
  it('takes no answer as the bottom of the range', () => {
    expect(beamShare(null)).toBe(0)
  })

  /**
   * Two readings, and they have to be able to disagree — which the reading this replaced could
   * not. Off lines of text, the widest ship in the harbour was `addons/AddOns`: 3 663 532 lines,
   * 68 commits, **one author**. A folder of downloaded game addons drawn as the broadest hull in
   * the basin. A reading of people only grows when people turn up.
   */
  it('widens for a crowd and not for bulk', () => {
    const crowded = hullOf(
      ship({
        lines: 200,
        ledger: { total: { ...NO_WORK, commits: 68, authors: 110 }, own: NO_WORK },
      }),
    )
    const vast = hullOf(
      ship({
        lines: 3_663_532,
        ledger: { total: { ...NO_WORK, commits: 68, authors: 1 }, own: NO_WORK },
      }),
    )

    expect(crowded.beam).toBeGreaterThan(vast.beam)
    expect(crowded).toHaveLength(vast.length)
  })
})
