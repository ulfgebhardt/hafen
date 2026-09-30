/**
 * Fixtures for this app's specs.
 *
 * Beside the components rather than in each spec, for the reason `mockContract` gives one layer
 * down: a ship spelled out by hand in five files is a ship whose shape five files get wrong on
 * the day it changes.
 */

import { NOTHING_OPEN, NO_LEDGER, mockContract } from '@hafen/core'

import type { ProbeResult, QuestResult, QuestVerdict, Ship } from '@hafen/core'

export function check(ok: boolean | null, question = 'lintet etwas'): ProbeResult {
  return { ok, evidence: { question, where: 'package.json', found: 'eslint .' } }
}

export function quest(
  id: string,
  verdict: QuestVerdict,
  overrides: Partial<QuestResult> = {},
): QuestResult {
  return {
    id,
    chain: 'werft',
    title: id,
    why: 'weil es die Flotte fordert',
    verdict,
    waitingOn: [],
    checks: [],
    reason: `Urteil: ${verdict}`,
    ...overrides,
  }
}

export function ship(overrides: Partial<Ship> = {}): Ship {
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
    hasGit: true,
    ...overrides,
  }
}
