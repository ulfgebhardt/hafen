import { describe, expect, it } from 'vitest'

import { mockContract } from './mock'
import { QUEST_POINTS, SHIPSHAPE_POINTS } from './points'
import { commitValue, tasksAcross, tasksFor, tasksValue } from './tasks'
import { NO_LEDGER } from './work'
import { NOTHING_OPEN } from './working'

import type { QuestResult, QuestVerdict } from './chain'
import type { Ship } from './ship'

function quest(id: string, verdict: QuestVerdict, title = id): QuestResult {
  return {
    id,
    chain: 'werft',
    title,
    why: `weil ${id} wichtig ist`,
    verdict,
    waitingOn: [],
    checks: [],
    reason: 'gemessen',
  }
}

function ship(overrides: Partial<Ship> = {}): Ship {
  return {
    name: 'ship',
    org: 'org',
    path: '/repos/org/ship',
    remotes: [],
    branch: 'main',
    dirty: false,
    working: NOTHING_OPEN,
    stash: 0,
    ledger: NO_LEDGER,
    rustDays: 1,
    docks: [],
    ahead: 0,
    behind: 0,
    contract: mockContract(),
    quests: [],
    ownQuests: [],
    overriddenQuests: [],
    unreadableQuests: [],
    stage: 'sailing',
    archived: false,
    branches: [],
    enlisted: false,
    hasGit: true,
    ...overrides,
  }
}

describe(tasksFor, () => {
  /** The intended end state, not an error: a repository in good order asks for nothing. */
  it('asks for nothing from a repository in good order', () => {
    expect(tasksFor(ship())).toStrictEqual([])
  })

  it('asks for the stash, which no other measurement would show', () => {
    const tasks = tasksFor(ship({ stash: 3 }))

    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.title).toContain('3 Stash-Einträge')
    expect(tasks[0]?.personal).toBe(SHIPSHAPE_POINTS)
  })

  /**
   * A conflict is not untidiness, it is a stop — everything else on that repository waits behind
   * it, so it is offered first.
   */
  it('puts what blocks above what is merely untidy', () => {
    const stuck = ship({
      stash: 2,
      ahead: 3,
      dirty: true,
      working: { staged: 1, unstaged: 0, untracked: 0, conflicted: 2 },
    })

    expect(tasksFor(stuck)[0]?.kind).toBe('blocked')
  })

  /** Committing while a merge is unresolved is not the next step. */
  it('does not ask for a commit while a conflict is open', () => {
    const stuck = ship({
      dirty: true,
      working: { staged: 0, unstaged: 0, untracked: 0, conflicted: 1 },
    })

    expect(tasksFor(stuck).map((task) => task.kind)).not.toContain('tidy')
  })

  it('asks to push only where there is something to push', () => {
    expect(tasksFor(ship({ ahead: 2 })).map((task) => task.kind)).toContain('deliver')
    expect(tasksFor(ship({ ahead: 0 })).map((task) => task.kind)).not.toContain('deliver')
    // No upstream is not "unpushed": there was nothing to be ahead of.
    expect(tasksFor(ship({ ahead: null })).map((task) => task.kind)).not.toContain('deliver')
  })

  it('offers a violated quest and nothing else about it', () => {
    const tasks = tasksFor(
      ship({
        quests: [quest('lint', 'violated', 'Lint einrichten'), quest('unit', 'met')],
      }),
    )

    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.title).toBe('Lint einrichten')
    expect(tasks[0]?.quest).toBe('lint')
    expect(tasks[0]?.personal).toBe(QUEST_POINTS)
  })

  /** Waiting is somebody else's turn, and unmeasured is nothing anybody can act on. */
  it.each(['waiting', 'unmeasured', 'notApplicable'] as const)(
    'does not ask for a quest that is %s',
    (verdict) => {
      expect(tasksFor(ship({ quests: [quest('lint', verdict)] }))).toStrictEqual([])
    },
  )

  /**
   * The harbour measures and draws. A task carries the command to type so nobody has to remember
   * it — and nothing here runs it.
   */
  it('carries a command and never a promise to run it', () => {
    for (const task of tasksFor(ship({ stash: 1, ahead: 2, dirty: true }))) {
      expect(task.command.length).toBeGreaterThan(0)
      expect(task.why.length).toBeGreaterThan(10)
    }
  })

  /** A number a task claims must be one the scoring actually awards. */
  it('never promises project points for tidying', () => {
    for (const task of tasksFor(ship({ stash: 2, dirty: true, ahead: 1 }))) {
      expect(task.project).toBe(0)
    }
  })
})

describe(tasksAcross, () => {
  it('carries the repository each task belongs to', () => {
    const tasks = tasksAcross([ship({ name: 'eins', stash: 1 }), ship({ name: 'zwei' })])

    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.ship.name).toBe('eins')
  })

  it('offers what blocks before what merely pays', () => {
    const tasks = tasksAcross([
      ship({ name: 'quest', quests: [quest('lint', 'violated')] }),
      ship({
        name: 'stuck',
        dirty: true,
        working: { staged: 0, unstaged: 0, untracked: 0, conflicted: 1 },
      }),
    ])

    expect(tasks[0]?.ship.name).toBe('stuck')
  })
})

describe(tasksValue, () => {
  it('adds up what the open work would be worth', () => {
    const value = tasksValue([ship({ stash: 1 }), ship({ quests: [quest('lint', 'violated')] })])

    expect(value.personal).toBe(SHIPSHAPE_POINTS + QUEST_POINTS)
    expect(value.project).toBe(0)
  })

  it('is zero for a fleet with nothing to do', () => {
    expect(tasksValue([ship()])).toStrictEqual({ project: 0, personal: 0 })
  })
})

describe(commitValue, () => {
  /** What makes the weighting legible at all — and it is read off the weights, not typed in. */
  it('says what one more commit is worth, by kind', () => {
    const value = commitValue()

    expect(value.feat).toBeGreaterThan(value.fix)
    expect(value.fix).toBeGreaterThan(value.unscored)
    expect(value.unscored).toBeGreaterThan(0)
  })
})
