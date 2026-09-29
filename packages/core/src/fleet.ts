import { hasChecks } from './contract'

import type { Ship, Stage } from './ship'

/**
 * Neglect in tiers rather than a single line. A flat 60-day threshold put 74 of 88 ships
 * in drydock, which is honest but useless as a permanent display — everything looked
 * equally dead. These tiers separate "paused on purpose" from "probably abandoned".
 */
export const RUST_TIERS = {
  growth: 90,
  rust: 365,
  scrap: 730,
} as const

export type RustLevel = 'none' | 'growth' | 'rust' | 'scrap'

export function rustLevel(rustDays: number | null): RustLevel {
  if (rustDays === null || rustDays < RUST_TIERS.growth) {
    return 'none'
  }
  if (rustDays < RUST_TIERS.rust) {
    return 'growth'
  }
  if (rustDays < RUST_TIERS.scrap) {
    return 'rust'
  }
  return 'scrap'
}

/**
 * How the harbor is banded.
 *
 * Deliberately not the stage. A stage says what git found — clean, dirty, worktree open,
 * long untouched — and `STAGE_MEANING` already has to explain that "in Fahrt" does not mean
 * deployed while no forge is connected. Sorting the whole harbor by a claim the data does
 * not carry made the bands decorative. Activity is something the data does carry.
 */
export type Activity = 'active' | 'dormant' | 'archived'

/** Below this a project is in hand. Above it, it is something you would have to return to. */
export const ACTIVE_DAYS = 30

export function activityOf(
  ship: Ship,
  state: { archived?: boolean; working?: boolean } = {},
): Activity {
  if (state.archived === true) {
    return 'archived'
  }
  // An agent at work or an open dock beats the calendar: the commit date says when
  // something last landed, not whether somebody is on it right now.
  if (state.working === true || ship.docks.length > 0) {
    return 'active'
  }
  return ship.rustDays !== null && ship.rustDays <= ACTIVE_DAYS ? 'active' : 'dormant'
}

/** Most recently touched first; a ship without commits sorts last rather than first. */
export function byActivity(a: Ship, b: Ship): number {
  return (a.rustDays ?? Number.MAX_SAFE_INTEGER) - (b.rustDays ?? Number.MAX_SAFE_INTEGER)
}

/**
 * The user-level progression. Everything here is derived — there is no score to keep,
 * which is why it cannot drift from what is actually the case.
 */
export interface Fleet {
  total: number
  byStage: Record<Stage, number>
  byRust: Record<RustLevel, number>
  /** Ships that measure fewer than all four roles, excluding non-node repos. */
  withGaps: number
  /**
   * Ships with nothing to run before a commit — not one script anywhere whose command is a
   * linter, a typechecker or a test runner, under any name.
   *
   * Asked as "are there checks" and not as "are all four roles missing", which is the same
   * answer today and says what it means: the count is about whether an Abnahme is possible at
   * all, not about arithmetic on the number of roles.
   */
  untestable: number
  activeDocks: number
}

const EMPTY_STAGES: Record<Stage, number> = { drydock: 0, dock: 0, berthed: 0, sailing: 0 }
const EMPTY_RUST: Record<RustLevel, number> = { none: 0, growth: 0, rust: 0, scrap: 0 }

export function summarizeFleet(ships: readonly Ship[]): Fleet {
  const byStage = { ...EMPTY_STAGES }
  const byRust = { ...EMPTY_RUST }
  let withGaps = 0
  let untestable = 0
  let activeDocks = 0

  for (const ship of ships) {
    byStage[ship.stage] += 1
    byRust[rustLevel(ship.rustDays)] += 1
    activeDocks += ship.docks.length

    if (ship.contract.gaps.length > 0) {
      withGaps += 1
    }
    if (ship.contract.kind !== 'other' && !hasChecks(ship.contract)) {
      untestable += 1
    }
  }

  return { total: ships.length, byStage, byRust, withGaps, untestable, activeDocks }
}
