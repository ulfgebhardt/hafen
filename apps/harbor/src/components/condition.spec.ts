import { describe, expect, it } from 'vitest'

import {
  conditionOf,
  contractOf,
  freshnessOf,
  hygieneOf,
  isExemplary,
  keptness,
  STASH_CAP,
} from './condition'
import { quest, ship } from './testing'

describe(hygieneOf, () => {
  it('is perfect for a tree somebody could walk away from', () => {
    expect(hygieneOf(ship())).toBe(1)
  })

  /**
   * The gamification lever: the thing a person can fix in two minutes has to move the picture
   * the most, or it rewards the wrong work.
   */
  it('falls steeply for what a commit would fix', () => {
    expect(hygieneOf(ship({ dirty: true }))).toBeLessThan(0.8)
    expect(hygieneOf(ship({ stash: 2 }))).toBeLessThan(0.8)
    expect(hygieneOf(ship({ ahead: 4 }))).toBeLessThan(0.85)
  })

  /** A conflict is not untidiness, it is a stop — so it costs more than anything else. */
  it('costs most for a conflict', () => {
    const conflicted = ship({
      dirty: true,
      working: { staged: 0, unstaged: 0, untracked: 0, conflicted: 1 },
    })

    expect(hygieneOf(conflicted)).toBeLessThan(hygieneOf(ship({ dirty: true })))
  })

  /** Otherwise a stash of forty would take every hull to the same zero and say nothing. */
  it('stops counting stash entries at the cap', () => {
    expect(hygieneOf(ship({ stash: STASH_CAP }))).toBe(hygieneOf(ship({ stash: 40 })))
  })

  /** A worktree is how this fleet works; marking it down would mark down being in use. */
  it('does not punish an open worktree', () => {
    expect(hygieneOf(ship({ docks: ['/d/one', '/d/two'] }))).toBe(1)
  })

  it('never falls below zero, however bad it gets', () => {
    const worst = ship({
      dirty: true,
      stash: 40,
      ahead: 9,
      working: { staged: 3, unstaged: 3, untracked: 3, conflicted: 3 },
    })

    expect(hygieneOf(worst)).toBeGreaterThanOrEqual(0)
  })

  /** A directory the register adopted is not a repository that let itself go. */
  it('has nothing to hold against a directory that is not a repository', () => {
    expect(hygieneOf(ship({ hasGit: false }))).toBe(1)
  })
})

describe(contractOf, () => {
  it('is the share of binding quests that are met', () => {
    const subject = ship({
      quests: [
        quest('a', 'met'),
        quest('b', 'met'),
        quest('c', 'violated'),
        quest('d', 'notApplicable'),
      ],
    })

    expect(contractOf(subject)).toBeCloseTo(2 / 3, 6)
  })

  /**
   * `null` and not zero: a repository nothing binds is not one that failed everything, and
   * drawing the two alike is the mistake the five verdicts exist to prevent.
   */
  it('has no answer where nothing binds', () => {
    expect(contractOf(ship())).toBeNull()
    expect(contractOf(ship({ quests: [quest('a', 'notApplicable')] }))).toBeNull()
  })
})

describe(freshnessOf, () => {
  it('falls with age', () => {
    expect(freshnessOf(ship({ rustDays: 1 }))).toBeGreaterThan(freshnessOf(ship({ rustDays: 200 })))
    expect(freshnessOf(ship({ rustDays: 200 }))).toBeGreaterThan(
      freshnessOf(ship({ rustDays: 2000 })),
    )
  })
})

describe(keptness, () => {
  it('rewards a tidy tree even where the contract cannot be met', () => {
    const tidy = ship({ rustDays: 2 })
    const strewn = ship({ rustDays: 2, dirty: true, stash: 3 })

    expect(keptness(tidy)).toBeGreaterThan(keptness(strewn))
  })

  /** What you control, you are credited for. */
  it('leans on hygiene rather than on the contract', () => {
    const metButStrewn = ship({ quests: [quest('a', 'met')], dirty: true, stash: 3, ahead: 2 })
    const violatedButTidy = ship({ quests: [quest('a', 'violated')] })

    expect(keptness(violatedButTidy)).toBeGreaterThan(keptness(metButStrewn))
  })

  it('stays inside its range for every extreme', () => {
    for (const subject of [ship(), ship({ rustDays: 4000, dirty: true, stash: 9, ahead: 5 })]) {
      expect(keptness(subject)).toBeGreaterThanOrEqual(0)
      expect(keptness(subject)).toBeLessThanOrEqual(1)
    }
  })
})

describe(isExemplary, () => {
  /** Both halves: either alone is a different sentence about the repository. */
  it('needs a clean tree and every binding demand met', () => {
    expect(isExemplary(ship({ quests: [quest('a', 'met')] }))).toBe(true)
    expect(isExemplary(ship({ quests: [quest('a', 'met')], stash: 1 }))).toBe(false)
    expect(isExemplary(ship({ quests: [quest('a', 'violated')] }))).toBe(false)
  })

  /** Nothing demanded is not everything met — there was no contract to keep. */
  it('is not earned by a repository nothing is demanded of', () => {
    expect(isExemplary(ship())).toBe(false)
  })
})

describe(conditionOf, () => {
  it('keeps the three readings apart rather than averaging them', () => {
    const subject = ship({ quests: [quest('a', 'met')], dirty: true, rustDays: 4000 })
    const condition = conditionOf(subject)

    expect(condition.contract).toBe(1)
    expect(condition.hygiene).toBeLessThan(1)
    expect(condition.freshness).toBeLessThan(0.5)
  })
})
