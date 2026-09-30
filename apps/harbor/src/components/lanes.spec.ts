import { describe, expect, it } from 'vitest'

import { fleetlets } from './flags'
import { columnsIn, harbourOf as lanes } from './lanes'
import { harbourOf as fan, reachesShore, walksOf } from './moorings'
import { ship } from './testing'
import { SIZE } from './vessel'

const fleetOf = (sizes: Readonly<Record<string, number>>) =>
  Object.entries(sizes).flatMap(([org, count]) =>
    Array.from({ length: count }, (_, index) =>
      ship({ org, name: `${org}-${String(index)}`, path: `/repos/${org}/${String(index)}` }),
    ),
  )

const REAL = { Wattenmeer: 18, ulfgebhardt: 15, werkstatt: 15, lehre: 9, kombuese: 6, einzel: 1 }
const fleet = fleetOf(REAL)

describe(columnsIn, () => {
  it('keeps a dock roughly block-shaped rather than a line', () => {
    expect(columnsIn(1)).toBe(1)
    expect(columnsIn(18)).toBeGreaterThan(1)
    expect(columnsIn(18)).toBeLessThan(18)
  })

  it('never asks for more columns than there are ships', () => {
    for (const count of [0, 1, 2, 3, 7, 18, 40]) {
      expect(columnsIn(count)).toBeLessThanOrEqual(Math.max(1, count))
      expect(columnsIn(count)).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('the lane harbour', () => {
  const harbour = lanes(fleetlets(fleet))

  /**
   * The same promise the fan makes, checked the same way — because it is the same check.
   * Two copies of a reachability test would be two chances to disagree about whether a ship can
   * get ashore, so `reachesShore` lives in one place and reads a `Harbour`.
   */
  it('gives every ship a way ashore', () => {
    expect(harbour.moorings).toHaveLength(64)
    expect(reachesShore(harbour)).toBe(true)
  })

  /** And on the laid ways alone: the extras really are extras here too. */
  it('reaches the shore with every extra way removed', () => {
    const tree = harbour.ways.filter((way) => way.kind === 'tree')

    expect(harbour.ways.some((way) => way.kind === 'round')).toBe(true)
    expect(reachesShore(harbour, tree)).toBe(true)
  })

  it('gives every ship a way ashore at any fleet size', () => {
    for (const count of [1, 2, 5, 17, 92]) {
      const many = Array.from({ length: count }, (_, index) =>
        ship({ org: `org-${String(index % 7)}`, path: `/repos/${String(index)}` }),
      )

      expect(reachesShore(lanes(fleetlets(many)))).toBe(true)
    }
  })

  /** The rule both layouts are held to, and the one both of them broke while being written. */
  it('keeps every walkway off the hulls', () => {
    const hulls = harbour.moorings.map((one) => ({
      x: one.spot.x,
      y: one.spot.y - SIZE.maxBeam / 2,
      width: SIZE.maxLength,
      height: SIZE.maxBeam,
    }))
    const over = walksOf(harbour).flatMap((line) =>
      hulls.filter((box) =>
        Array.from({ length: 21 }, (_, step) => step / 20).some((at) => {
          const x = line.from.x + (line.to.x - line.from.x) * at
          const y = line.from.y + (line.to.y - line.from.y) * at
          return x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height
        }),
      ),
    )

    expect(over).toStrictEqual([])
  })

  /**
   * Why both are kept. A rectangle wastes nothing and a wedge wastes its middle, so the lanes are
   * the tighter picture — and they are the reason the fan could not simply replace them.
   */
  it('packs the same fleet tighter than the fan', () => {
    const wide = fan(fleetlets(fleet))

    expect(harbour.width * harbour.height).toBeLessThan(wide.width * wide.height)
    expect(harbour.moorings).toHaveLength(wide.moorings.length)
  })

  /** Read repeatedly, so it must not move: the same fleet twice is the same harbour twice. */
  it('places the same fleet the same way twice', () => {
    expect(lanes(fleetlets(fleet)).moorings.map((one) => one.spot)).toStrictEqual(
      harbour.moorings.map((one) => one.spot),
    )
  })

  /** A lane harbour has no bearing, and zero is the truth rather than a placeholder. */
  it('lays every ship on an east-west spine', () => {
    expect(harbour.moorings.every((one) => one.angle === 0)).toBe(true)
  })

  it('answers for an empty fleet rather than dividing by nothing', () => {
    const none = lanes([])

    expect(none.moorings).toStrictEqual([])
    expect(none.width).toBeGreaterThan(0)
    expect(none.height).toBeGreaterThan(0)
  })
})
