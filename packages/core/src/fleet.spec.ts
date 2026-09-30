import { describe, expect, it } from 'vitest'

import { activityOf, byActivity, rustLevel, summarizeFleet } from './fleet'
import { mockChecks } from './mock'
import { CHECK_ROLES } from './role'
import { NO_LEDGER } from './work'
import { NOTHING_OPEN } from './working'

import type { Contract, MemberCheck } from './contract'
import type { CheckRole } from './role'
import type { Ship } from './ship'

/**
 * `checks` carries the roles the ship still measures — everything not in `gaps`. A fixture where
 * the two disagree cannot occur: `gaps` is derived from exactly that.
 */
function contract(
  gaps: Contract['gaps'],
  kind: Contract['kind'] = 'node',
  checks: readonly MemberCheck[] | null = null,
): Contract {
  const scripts = { lint: true, typecheck: true, unit: true, e2e: true }
  const measured = Object.fromEntries(
    CHECK_ROLES.map((role) => [role, !gaps.includes(role)]),
  ) as Record<CheckRole, boolean>
  return {
    kind,
    scripts,
    members: [{ dir: '.', checks: checks ?? mockChecks(measured) }],
    devEntry: 'script',
    inCi: [],
    gaps,
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
    contract: contract([]),
    quests: [],
    ownQuests: [],
    overriddenQuests: [],
    unreadableQuests: [],
    stage: 'sailing',
    archived: false,
    branches: [],
    submodules: [],
    enlisted: false,
    hasGit: true,
    ...overrides,
  }
}

describe(rustLevel, () => {
  it('treats an unknown age as clean rather than guessing', () => {
    expect(rustLevel(null)).toBe('none')
  })

  // Both sides of every tier boundary, so a shifted threshold fails loudly.
  it.each([
    [1, 'none'],
    [89, 'none'],
    [90, 'growth'],
    [364, 'growth'],
    [365, 'rust'],
    [729, 'rust'],
    [730, 'scrap'],
    [1433, 'scrap'],
  ] as const)('grades %i days as %s', (days, level) => {
    expect(rustLevel(days)).toBe(level)
  })
})

describe(summarizeFleet, () => {
  it('reports an empty harbor without inventing numbers', () => {
    const fleet = summarizeFleet([])

    expect(fleet.total).toBe(0)
    expect(fleet.byStage.sailing).toBe(0)
    expect(fleet.activeDocks).toBe(0)
  })

  it('counts stages and rust grades side by side', () => {
    const fleet = summarizeFleet([
      ship({ stage: 'sailing', rustDays: 2 }),
      ship({ stage: 'drydock', rustDays: 200 }),
      ship({ stage: 'drydock', rustDays: 1400 }),
    ])

    expect(fleet.byStage).toStrictEqual({ drydock: 2, dock: 0, berthed: 0, sailing: 1 })
    expect(fleet.byRust).toStrictEqual({ none: 1, growth: 1, rust: 0, scrap: 1 })
  })

  it('sums docks across ships, not ships with docks', () => {
    const fleet = summarizeFleet([
      ship({ docks: ['/a', '/b', '/c'] }),
      ship({ docks: ['/d'] }),
      ship(),
    ])

    expect(fleet.activeDocks).toBe(4)
  })

  it('separates an incomplete contract from no contract at all', () => {
    const fleet = summarizeFleet([
      ship({ contract: contract(['e2e']) }),
      ship({ contract: contract(['lint', 'typecheck', 'unit', 'e2e']) }),
      ship({ contract: contract([], 'other') }),
    ])

    expect(fleet.withGaps).toBe(2)
    expect(fleet.untestable).toBe(1)
  })

  it('counts a repo that checks itself under its own names as a gap, not as untestable', () => {
    // leuchtturm.example: no `test:*` script anywhere, ~2000 tests under `lint` and `test`. The roles
    // are filled by whatever the commands measure, so the two missing ones are the gap — and
    // `untestable` is read off the checks, never off the number of gaps.
    const fleet = summarizeFleet([
      ship({
        contract: contract(['typecheck', 'e2e'], 'node-workspace', [
          { script: 'lint', role: 'lint', delegates: false },
          { script: 'test', role: 'unit', delegates: false },
        ]),
      }),
    ])

    expect(fleet.withGaps).toBe(1)
    expect(fleet.untestable).toBe(0)
  })

  it('never counts a non-node repo as untestable — nothing is owed there', () => {
    const fleet = summarizeFleet([ship({ contract: contract([], 'other') })])

    expect(fleet.withGaps).toBe(0)
    expect(fleet.untestable).toBe(0)
  })
})

describe(activityOf, () => {
  it('calls a recently touched ship active', () => {
    expect(activityOf(ship({ rustDays: 3 }))).toBe('active')
  })

  it('calls a long untouched ship dormant', () => {
    expect(activityOf(ship({ rustDays: 400 }))).toBe('dormant')
  })

  it('lets an open dock beat the calendar', () => {
    // The commit date says when something last landed, not whether somebody is on it.
    expect(activityOf(ship({ rustDays: 400, docks: ['/docks/x'] }))).toBe('active')
  })

  it('lets a running agent beat the calendar', () => {
    expect(activityOf(ship({ rustDays: 400 }), { working: true })).toBe('active')
  })

  it('puts the archive above everything, including a running agent', () => {
    expect(activityOf(ship({ rustDays: 1 }), { archived: true, working: true })).toBe('archived')
  })

  it('treats a project without commits as dormant rather than fresh', () => {
    // A directory with no git history is not "just touched" — nothing is known about it.
    expect(activityOf(ship({ rustDays: null, hasGit: false }))).toBe('dormant')
  })
})

describe(byActivity, () => {
  it('sorts most recently touched first', () => {
    const sorted = [ship({ rustDays: 40 }), ship({ rustDays: 2 })].sort(byActivity)

    expect(sorted.map((entry) => entry.rustDays)).toStrictEqual([2, 40])
  })

  it('sorts a ship without commits last, not first', () => {
    const sorted = [ship({ rustDays: null }), ship({ rustDays: 900 })].sort(byActivity)

    expect(sorted.map((entry) => entry.rustDays)).toStrictEqual([900, null])
  })
})
