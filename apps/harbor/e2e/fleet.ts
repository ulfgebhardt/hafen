/**
 * The fleet the end-to-end checks draw: invented, and only that.
 *
 * Built from the same fixtures the unit specs use (`components/testing.ts`), so a field added to
 * `Ship` reaches this file through the type checker rather than through a blank datasheet in a
 * browser. Never derived from a measurement: `public/snapshot.json` carries every local path of
 * the machine it was taken on, and this repository is public — the names are the examples
 * `CLAUDE.md` allows, the paths lie under a directory nobody has.
 *
 * Wide on purpose. Every verdict, open work of each kind, gone and merged branches, a lineage, a
 * submodule adrift, a forge reading: what is not in the snapshot is not rendered, and what is not
 * rendered axe cannot judge.
 */

import { mockContract, mockRemote, NO_WORK } from '@hafen/core'

import { check, quest, ship } from '../src/components/testing'

import type { Forge, Snapshot } from '../src/snapshot'
import type { Ship } from '@hafen/core'

/** Where the invented projects lie. Under `/srv` so no home directory is named, not even a made-up one. */
export const ROOT = '/srv/hafen-e2e'

/** One root that holds the fleet and one that is gone — the bar lists both, the second in red. */
export const ROOTS = [ROOT, `${ROOT}-verschollen`] as const

const AT = '2026-10-01T08:00:00.000Z'

/** The ship the datasheet checks read: the one with the most on her. */
export const LEUCHTTURM: Ship = ship({
  name: 'leuchtturm',
  org: 'leuchtturm',
  path: `${ROOT}/leuchtturm/leuchtturm`,
  remotes: [
    mockRemote('git@github.com:leuchtturm/leuchtturm.git'),
    mockRemote('https://git.leuchtturm.example/leuchtturm/leuchtturm.git', 'alt'),
  ],
  lineage: [
    {
      remote: 'alt',
      kinship: 'uncertain',
      onlyOrigin: 75,
      onlyRemote: 0,
      because: 'dieselbe Linie, und welche Seite die Herkunft ist, steht nicht im Repository',
    },
  ],
  branch: 'feat/karte',
  dirty: true,
  working: { staged: 2, unstaged: 3, untracked: 7, conflicted: 1 },
  stash: 2,
  ledger: {
    total: {
      ...NO_WORK,
      commits: 2140,
      byKind: { feat: 310, fix: 420, chore: 180 },
      unscored: 1230,
      pulls: 348,
      merges: 120,
      authors: 14,
    },
    own: { ...NO_WORK, commits: 212, byKind: { feat: 40, fix: 60 }, unscored: 112, pulls: 31 },
  },
  lines: 184_220,
  roots: ['0000000000000000000000000000000000000001'],
  rustDays: 2,
  docks: [`${ROOT}/leuchtturm/leuchtturm-karte`],
  ahead: 3,
  behind: 12,
  branches: [
    { name: 'master', upstream: 'origin/master', gone: false, merged: true, current: false },
    {
      name: 'feat/karte',
      upstream: 'origin/feat/karte',
      gone: false,
      merged: false,
      current: true,
    },
    { name: 'fix/alt', upstream: 'origin/fix/alt', gone: true, merged: true, current: false },
    { name: 'spike', upstream: null, gone: false, merged: false, current: false },
  ],
  defaultBranch: 'master',
  submodules: [
    {
      path: 'vendor/seekarte',
      state: 'adrift',
      at: 'abc1234',
      url: 'https://git.leuchtturm.example/leuchtturm/seekarte.git',
    },
    { path: 'vendor/leer', state: 'missing', at: 'def5678', url: null },
  ],
  contract: mockContract({
    unread: [{ dir: '.', script: 'build', claims: 'build', command: 'tsup src', inCi: true }],
    gaps: ['typecheck'],
  }),
  quests: [
    quest('lint', 'met', { checks: [check(true)] }),
    quest('unit', 'violated', {
      title: 'Unit-Tests',
      checks: [check(false, 'testet etwas')],
      reason: 'kein Skript startet einen Testlauf',
    }),
    quest('e2e', 'waiting', { waitingOn: ['unit'], reason: 'wartet auf unit' }),
    quest('build', 'unmeasured', {
      checks: [check(null, 'baut etwas')],
      reason: 'tsup ist ungelesen',
    }),
    quest('storybook', 'notApplicable', { reason: 'unter 20 Komponenten' }),
    quest('schutz', 'unmeasured', { chain: 'auslauf', reason: 'steht nur in der Forge' }),
  ],
  ownQuests: ['dav'],
  overriddenQuests: ['lint'],
  unreadableQuests: ['.hafen/quests/werft/kaputt.md'],
  stage: 'dock',
  measuredAt: AT,
})

const KALENDER: Ship = ship({
  name: 'kalender',
  org: 'werkstatt',
  path: `${ROOT}/werkstatt/kalender`,
  remotes: [mockRemote('git@github.com:werkstatt/kalender.git')],
  ledger: {
    total: { ...NO_WORK, commits: 900, byKind: { feat: 200, fix: 300 }, pulls: 120, authors: 4 },
    own: { ...NO_WORK, commits: 400, byKind: { feat: 100, fix: 150 }, pulls: 60 },
  },
  lines: 32_000,
  rustDays: 5,
  quests: [quest('lint', 'met'), quest('unit', 'met'), quest('build', 'met')],
  stage: 'sailing',
})

const PINNE: Ship = ship({
  name: 'pinne',
  org: 'werkstatt',
  path: `${ROOT}/werkstatt/pinne`,
  remotes: [mockRemote('https://git.werkstatt.example/werkstatt/pinne.git')],
  rustDays: 240,
  quests: [quest('lint', 'violated'), quest('storybook', 'notApplicable')],
  stage: 'berthed',
})

const KUTTER: Ship = ship({
  name: 'kutter',
  org: 'leuchtturm',
  path: `${ROOT}/leuchtturm/kutter`,
  roots: ['0000000000000000000000000000000000000001'],
  rustDays: 800,
  archived: true,
  stage: 'drydock',
})

export const SNAPSHOT: Snapshot = {
  at: AT,
  root: ROOT,
  ships: [LEUCHTTURM, KALENDER, PINNE, KUTTER],
}

export const FORGE: Forge = {
  at: AT,
  stats: [
    {
      slug: { host: 'github.com', owner: 'leuchtturm', repo: 'leuchtturm' },
      stars: 42,
      watchers: 7,
      forks: 3,
      issues: 18,
      pulls: 4,
      language: 'TypeScript',
      guard: { pullRequest: true, statusChecks: false, source: 'ruleset', admin: false },
      forkedFrom: null,
    },
  ],
  unread: [
    { slug: { host: 'git.werkstatt.example', owner: 'werkstatt', repo: 'pinne' }, reason: '404' },
  ],
}
