/**
 * The geometry of a hull, as numbers.
 *
 * Separate from the renderer on purpose: Pixi draws into a canvas, and a canvas cannot be
 * asserted about. What *can* be asserted is the arithmetic — that a ship with five binding
 * quests gets five segments, that they tile the hull without a gap, that a ship nothing is
 * demanded of gets none rather than a full set. The engine then draws whatever this returns.
 *
 * Style is a technical drawing and not an illustration: an outline, frames, a waterline, a
 * measured deck. The detail comes from precision, which is also the only kind of detail this
 * tool is entitled to — every line here stands for something that was measured.
 */

import { bindingQuests, orderedQuests } from './fleet'

import type { QuestResult, QuestVerdict, Ship } from '@hafen/core'

/** The drawing's own units. Scaled at the renderer, so every number here is comparable. */
export const HULL = {
  /** Stem to stern. */
  length: 108,
  /** Deck to keel at midships. */
  depth: 26,
  /** How far the bow rakes forward past the deck line. */
  rake: 11,
  /** How far the stern is drawn in. */
  tuck: 7,
  /** Height of the superstructure above deck. */
  house: 9,
  /** Mast height above deck. */
  mast: 22,
} as const

export interface Point {
  x: number
  y: number
}

/**
 * The hull outline, bow to the right, deck at y=0 and keel at y=depth.
 *
 * A closed polygon rather than a curve: at this scale a bezier reads as a smudge, and a
 * chined hull is what a lines plan of a working vessel actually looks like.
 */
export function outline(): readonly Point[] {
  const { length, depth, rake, tuck } = HULL
  return [
    { x: 0, y: 0 },
    { x: length, y: 0 },
    { x: length - rake, y: depth * 0.62 },
    { x: length - rake * 1.5, y: depth },
    { x: tuck, y: depth },
    { x: 0, y: depth * 0.5 },
  ]
}

/**
 * The frames, evenly spaced between stem and stern.
 *
 * Drawn because a lines plan has them and because they give the hull its scale — without them
 * a ship is a wedge, and ninety-one wedges have no length to compare. They carry no data, and
 * that is stated rather than left ambiguous: `frames` is decoration in the strict sense, the
 * only thing in this file that is.
 */
export function frames(count = 7): readonly number[] {
  const { length, rake, tuck } = HULL
  const first = tuck + 6
  const last = length - rake * 1.5 - 6
  const step = (last - first) / (count - 1)
  return Array.from({ length: count }, (_, index) => first + index * step)
}

export interface Segment {
  quest: QuestResult
  verdict: QuestVerdict
  /** Left edge along the hull. */
  x: number
  width: number
}

/**
 * The deck divided by what the ship owes — the chosen reading, "Wasserlinie".
 *
 * Divided by the *binding* quests only, so `notApplicable` does not take up room: a demand that
 * does not reach this repository is not a part of it that is empty, it is not a part of it. A
 * ship with nothing binding gets an empty list, and the renderer draws a dashed deck for it —
 * "never measured" and "measured and empty" must not look alike.
 *
 * Equal widths and not weighted by anything: no measurement here says one demand is bigger than
 * another, and a width that suggested it would be an invention.
 */
export function segments(ship: Ship): readonly Segment[] {
  const binding = orderedQuests(bindingQuests(ship))
  if (binding.length === 0) {
    return []
  }

  const { length, rake, tuck } = HULL
  const from = tuck + 3
  const to = length - rake * 1.6 - 3
  const width = (to - from) / binding.length

  return binding.map((quest, index) => ({
    quest,
    verdict: quest.verdict,
    x: from + index * width,
    width,
  }))
}

/**
 * How tall the superstructure is: one storey per five binding quests, at least one.
 *
 * A measurement and not a flourish — a repository held to fifteen demands is a bigger vessel
 * than one held to two, and the silhouette should say so before any label is read. Capped at
 * four so one outlier does not set the scale for the whole harbour.
 */
export function storeys(ship: Ship): number {
  const binding = bindingQuests(ship).length
  return binding === 0 ? 1 : Math.min(4, Math.ceil(binding / 5))
}

/**
 * Draught: how deep the hull sits, 0 … 1 of its depth.
 *
 * Loaded by what is open. A ship meeting everything rides high, one with every demand violated
 * sits at its marks. This is the one place the scene editorialises, and it is a rendering of the
 * same count the segments already show — not a second opinion, a second reading of one.
 */
export function draught(ship: Ship): number {
  const binding = bindingQuests(ship)
  if (binding.length === 0) {
    return 0.25
  }
  const open = binding.filter((quest) => quest.verdict !== 'met').length
  return 0.3 + 0.55 * (open / binding.length)
}
