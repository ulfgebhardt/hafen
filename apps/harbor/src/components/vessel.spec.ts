import { describe, expect, it } from 'vitest'

import { BERTH } from './plan'
import { quest, ship } from './testing'
import {
  apronOf,
  BEAM_CEILING,
  BEAM_FLOOR,
  beamShare,
  BERTH_SLACK,
  bridgeOf,
  cargoOf,
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
    // The beam is not in this: it follows the text in the tree, which these three share.
    expect(big.beam).toBe(small.beam)
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

    const owed = landedOf(subject, hullOf(subject, 0))
      .map((box) => box.quest.id)
      .sort((a, b) => a.localeCompare(b))

    expect(owed).toStrictEqual(['b', 'c', 'd'])
  })

  it('leaves the pier clear when everything is met', () => {
    const clean = ship({ quests: [quest('a', 'met')] })

    expect(landedOf(clean, hullOf(clean, 0))).toStrictEqual([])
  })

  it('puts the worst nearest the stern, where reading starts', () => {
    const subject = ship({ quests: [quest('offen', 'waiting'), quest('kaputt', 'violated')] })

    expect(landedOf(subject, hullOf(subject, 0))[0]?.quest.id).toBe('kaputt')
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
    const hull = hullOf(subject, 0)

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
    const boxes = landedOf(subject, hullOf(subject, 0))

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

describe('what waits and what she is', () => {
  const busy = ship({
    ahead: 2,
    behind: 1,
    stash: 1,
    docks: ['/docks/one'],
    submodules: [{ path: 'lib', state: 'aboard' as const, at: 'aaaaaaaa', url: null }],
    working: { staged: 0, unstaged: 0, untracked: 0, conflicted: 1 },
  })
  const hull = hullOf(busy, 400)

  /**
   * The complaint this answers: a flag for unpushed commits and a wake for commits upstream hung
   * on the hull, so a repository with *more* left to do came out the more interesting drawing.
   */
  it('puts everything there is to do on the planking', () => {
    const waiting = pierMarks(busy, hullOf(busy, 0)).map((box) => box.kind)

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
    const onPier = new Set(pierMarks(busy, hullOf(busy, 0)).map((box) => box.kind))

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
    const hull = hullOf(ship(), 400)
    const snug = gangwayOf(hull, 0)
    const off = gangwayOf(hull, 2)

    expect(snug.from.y).toBe(-hull.beam / 2)
    expect(snug.to.y).toBeLessThan(snug.from.y)
    expect(off.to.y).toBeLessThan(snug.to.y)
    expect(off.from.x).toBe(snug.from.x)
  })
})

describe(apronOf, () => {
  const hull = hullOf(ship(), 400)
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
  const hull = hullOf(ship(), 400)

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
    const loaded = ship({
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
  const hull = hullOf(ship(), 400)
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
  const hull = hullOf(ship(), 400)

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
  const hull = hullOf(ship(), 400)

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
   * Her length is what the repository has done, her beam is how much of it there is — and until
   * these came apart, every ship in the harbour had one shape at ninety sizes.
   */
  it('widens with the text in the tree', () => {
    expect(beamShare(17305)).toBeGreaterThan(beamShare(1000))
    expect(beamShare(1000)).toBeGreaterThan(beamShare(10))
  })

  it('stops at both ends rather than running off', () => {
    expect(beamShare(BEAM_FLOOR)).toBe(0)
    expect(beamShare(BEAM_CEILING * 10)).toBe(1)
    expect(beamShare(-5)).toBe(0)
  })

  /** A repository git could not answer about is drawn narrow, never at an invented middle. */
  it('takes no answer as the bottom of the range', () => {
    expect(beamShare(null)).toBe(0)
  })

  /** Two readings, and they have to be able to disagree. */
  it('leaves the length out of it', () => {
    const busy = hullOf(ship({ lines: 200 }), 25000)
    const vast = hullOf(ship({ lines: 900000 }), 25000)

    expect(vast.beam).toBeGreaterThan(busy.beam)
    expect(vast).toHaveLength(busy.length)
  })
})
