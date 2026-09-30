/**
 * How well a ship is kept, as numbers the drawing can use.
 *
 * The scene had two separate readings already — the deck said what the contract demands, the
 * crates said what the tree looks like — and neither changed how the *ship itself* was drawn.
 * Every hull was the same hull. That is the thing this file exists to fix: a repository that is
 * looked after should be a better ship, visibly, at a glance and before any label is read.
 *
 * Three readings, deliberately apart, because they are fixed by different work:
 *
 * - `contract` is what the fleet demands. Slow to change: it takes a CI workflow, a test suite.
 * - `hygiene` is the state of the working tree. **Fast** to change — a commit, a `stash pop`,
 *   a push — and therefore the one that has to move the picture the most. Somebody who tidies a
 *   repository in two minutes should see the ship change.
 * - `freshness` is whether anybody has been here lately. Changes by working, which is not
 *   something the picture should push anyone into.
 *
 * All three are 0…1 so the renderer can interpolate. Not averaged into one number: a ship that
 * meets every demand and has four stashes is not "medium", it is two different sentences.
 */

import { bindingQuests, isClean, rustLevel } from '@hafen/core'

import type { Ship } from '@hafen/core'

export interface Condition {
  /** Quests met over quests that bind. `null` where nothing binds — not zero. */
  contract: number | null
  /** How tidy the working tree is. */
  hygiene: number
  /** How recently anybody was here. */
  freshness: number
}

/**
 * What a single piece of untidiness costs.
 *
 * Steep on purpose, and this is the gamification lever the whole file is for: a stash and a dirty
 * tree together take a hull most of the way down, and clearing them takes it straight back. The
 * fast-to-fix thing has to be the visible one, or the picture rewards the wrong work.
 */
const HYGIENE_COST = {
  /** Anything uncommitted. One `git commit` away. */
  dirty: 0.25,
  /** Per stash entry, up to three — work that exists in no commit and no tree. */
  stash: 0.15,
  /** Unpushed commits: done, but nobody else can see them. */
  unpushed: 0.2,
  /** A conflict is not untidiness, it is a stop. */
  conflict: 0.4,
} as const

/** How many stash entries are counted before the penalty stops growing. */
export const STASH_CAP = 3

/**
 * How tidy a tree is, 0…1.
 *
 * A worktree is deliberately *not* counted against a repository: it is how this fleet works, and
 * penalising it would mark most ships down for being in use.
 */
export function hygieneOf(ship: Ship): number {
  if (!ship.hasGit) {
    // Nothing to be tidy about. Not a failing — a directory the register adopted is not a
    // repository that let itself go.
    return 1
  }

  let cost = 0
  if (ship.working.conflicted > 0) {
    cost += HYGIENE_COST.conflict
  }
  if (ship.dirty) {
    cost += HYGIENE_COST.dirty
  }
  cost += Math.min(ship.stash, STASH_CAP) * HYGIENE_COST.stash
  if ((ship.ahead ?? 0) > 0) {
    cost += HYGIENE_COST.unpushed
  }

  return Math.max(0, 1 - cost)
}

/**
 * How much of what the fleet demands is met, 0…1 — or `null` where nothing is demanded.
 *
 * `null` and not 0: a repository nothing binds is not a repository that failed everything, and
 * drawing the two alike is the mistake the five verdicts exist to prevent.
 */
export function contractOf(ship: Ship): number | null {
  const binding = bindingQuests(ship.quests)
  if (binding.length === 0) {
    return null
  }
  return binding.filter((quest) => quest.verdict === 'met').length / binding.length
}

/** Rust as a number: fresh is 1, an abandonment candidate is 0. */
export function freshnessOf(ship: Ship): number {
  return { none: 1, growth: 0.66, rust: 0.33, scrap: 0.1 }[rustLevel(ship.rustDays)]
}

export function conditionOf(ship: Ship): Condition {
  return {
    contract: contractOf(ship),
    hygiene: hygieneOf(ship),
    freshness: freshnessOf(ship),
  }
}

/**
 * One number for "how well is this kept", for the things that need a single dial.
 *
 * Weighted towards hygiene, which is the half a human can fix this minute. A ship with an
 * unmeetable contract but a spotless tree still rides well, and that is the intended message:
 * what you control, you are credited for.
 *
 * Where nothing binds, hygiene and freshness carry it alone rather than an invented zero.
 */
export function keptness(ship: Ship): number {
  const { contract, hygiene, freshness } = conditionOf(ship)
  return contract === null
    ? hygiene * 0.7 + freshness * 0.3
    : contract * 0.35 + hygiene * 0.45 + freshness * 0.2
}

/** Whether a ship is in a state worth drawing at its best — used for the flourishes. */
export function isExemplary(ship: Ship): boolean {
  return isClean(ship) && (contractOf(ship) ?? 0) === 1
}
