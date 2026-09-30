/**
 * A ship as a body: the shapes, in world coordinates, before anything is projected.
 *
 * Separate from the renderer for the same reason `hull.ts` was — the shape of a thing is
 * arithmetic, and arithmetic is what a test can hold. `scene.ts` projects what this returns and
 * strokes it; it decides nothing.
 *
 * The isometric view changes what carries the contract. Flat, the deck was a row of blocks; here
 * it is **containers**, stacked on the deck as they would be — which reads better, because a
 * stack has a height the eye compares across a whole basin without counting anything.
 */

import { bindingQuests } from '@hafen/core'

import { conditionOf, keptness } from './condition'
import { orderedQuests } from './fleet'

import type { Spot } from './iso'
import type { QuestResult, Ship } from '@hafen/core'

/**
 * How big a ship is drawn, in grid cells.
 *
 * The length follows the project score, and that is the one place in this drawing where being
 * *busy* is rewarded with space. Bounded hard at both ends: a repository with eighteen thousand
 * points must not need its own pier, and one with four commits still has to look like a ship.
 */
export const SIZE = {
  minLength: 1.5,
  maxLength: 3.2,
  width: 0.9,
  /** Freeboard: how far the deck sits above the water. */
  minHeight: 10,
  maxHeight: 22,
} as const

/** Where a project score stops buying length. A busy shared repository, measured. */
export const LENGTH_CEILING = 6000

export interface Hull {
  /** The four corners of the deck, counter-clockwise from the stern-port corner. */
  deck: readonly Spot[]
  /** How far the deck sits above the water. */
  height: number
  /** How long, in cells — the number the caller may want for a label. */
  length: number
}

/**
 * The hull's footprint and freeboard.
 *
 * Height follows `keptness` rather than the score: a well-kept ship rides high, which is the same
 * sentence the draught made in the flat drawing and the one a person can change this afternoon.
 * Length follows the score, which they cannot.
 */
export function hullOf(ship: Ship, at: Spot, points: number): Hull {
  const reach = Math.min(points, LENGTH_CEILING) / LENGTH_CEILING
  const length = SIZE.minLength + (SIZE.maxLength - SIZE.minLength) * Math.sqrt(reach)
  const height = SIZE.minHeight + (SIZE.maxHeight - SIZE.minHeight) * keptness(ship)

  const halfWidth = SIZE.width / 2
  return {
    length,
    height,
    deck: [
      { x: at.x, y: at.y - halfWidth },
      { x: at.x + length, y: at.y - halfWidth },
      { x: at.x + length, y: at.y + halfWidth },
      { x: at.x, y: at.y + halfWidth },
    ],
  }
}

export interface Container {
  /** Where it sits on the deck. */
  spot: Spot
  quest: QuestResult
  /** Which layer of the stack, 0 at the bottom. */
  tier: number
}

/** How many containers stand side by side across the deck before a new row starts. */
export const CONTAINERS_ACROSS = 2

/** How tall one container is, in the same units as `Hull.height`. */
export const CONTAINER_HEIGHT = 5

/**
 * The contract as deck cargo.
 *
 * One container per binding quest, stacked. A ship carrying nothing binding gets an empty deck,
 * and that has to look different from a deck whose cargo is all violated — so the renderer draws
 * bare planking for the first and hatched boxes for the second. "Never measured" and "measured
 * and failing" must not look alike, which is the same rule the flat deck followed.
 *
 * Worst first, so the colour a person sees at the top of a stack is the one that matters.
 */
export function cargoOf(ship: Ship, hull: Hull, at: Spot): readonly Container[] {
  const quests = orderedQuests(bindingQuests(ship.quests))
  if (quests.length === 0) {
    return []
  }

  const usable = hull.length - 0.5
  const perRow = CONTAINERS_ACROSS
  const rows = Math.ceil(quests.length / perRow)
  const step = usable / Math.max(rows, 1)

  return quests.map((quest, index) => {
    const row = Math.floor(index / perRow)
    const acrossIndex = index % perRow
    return {
      quest,
      tier: 0,
      spot: {
        x: at.x + 0.35 + row * step,
        y: at.y - SIZE.width / 4 + acrossIndex * (SIZE.width / 2),
        z: hull.height,
      },
    }
  })
}

/**
 * The superstructure: a block near the stern, one storey per five binding demands.
 *
 * Same measurement as the flat drawing used, kept deliberately: a ship held to fifteen demands
 * is a bigger vessel, and the silhouette should say so before any label is read.
 */
export function bridgeOf(ship: Ship, hull: Hull, at: Spot): { spot: Spot; storeys: number } {
  const binding = bindingQuests(ship.quests).length
  return {
    spot: { x: at.x + 0.25, y: at.y, z: hull.height },
    storeys: binding === 0 ? 1 : Math.min(4, Math.ceil(binding / 5)),
  }
}

/**
 * Whether this ship gets the funnel and its smoke.
 *
 * Earned, not decorative — every binding demand met *and* a clean tree. It is the only thing in
 * the basin that moves on its own, so it is what the eye finds first.
 */
export function hasPlume(ship: Ship): boolean {
  const condition = conditionOf(ship)
  return condition.contract === 1 && condition.hygiene === 1
}
