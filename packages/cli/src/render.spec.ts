import { mockContract } from '@hafen/core'
import { describe, expect, it } from 'vitest'

import { renderHarbor } from './render'

import type { ProbeResult, QuestResult, QuestVerdict, Ship } from '@hafen/core'

function check(ok: boolean | null, question = 'lintet etwas'): ProbeResult {
  return { ok, evidence: { question, where: 'package.json', found: 'eslint .' } }
}

function quest(
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

function ship(overrides: Partial<Ship> = {}): Ship {
  return {
    name: 'ship',
    org: 'org',
    path: '/repos/org/ship',
    remotes: [],
    branch: 'main',
    dirty: false,
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
    hasGit: true,
    ...overrides,
  }
}

describe(renderHarbor, () => {
  it('says so rather than drawing an empty harbor', () => {
    expect(renderHarbor([])).toContain('(keine Schiffe gefunden)')
  })

  it('groups by stage, from achieved to neglected', () => {
    const text = renderHarbor([
      ship({ name: 'liegt', stage: 'drydock' }),
      ship({ name: 'faehrt', stage: 'sailing' }),
    ])

    expect(text.indexOf('in Fahrt')).toBeLessThan(text.indexOf('Trockendock'))
  })

  /**
   * The whole reason for five marks: an unsuccessful measurement is not a finding. `unmeasured`
   * sharing `!` with `violated` is how a Rust crate with no readable check became a gap.
   */
  it('gives every verdict its own mark', () => {
    const text = renderHarbor([
      ship({
        quests: [
          quest('a', 'violated'),
          quest('b', 'met'),
          quest('c', 'unmeasured'),
          quest('d', 'waiting'),
        ],
      }),
    ])

    expect(text).toMatch(/! a /u)
    expect(text).toMatch(/\+ b /u)
    expect(text).toMatch(/\? c /u)
    expect(text).toMatch(/~ d /u)
  })

  it('puts what is broken above what is fine', () => {
    const text = renderHarbor([
      ship({ quests: [quest('gut', 'met'), quest('kaputt', 'violated')] }),
    ])

    expect(text.indexOf('kaputt')).toBeLessThan(text.indexOf('gut'))
  })

  /** Right answer, and noise in a list of 89 ships. Counted in the summary instead. */
  it('leaves a quest that does not apply out of the ship, and counts it', () => {
    const text = renderHarbor([ship({ quests: [quest('rust-only', 'notApplicable')] })])

    expect(text).not.toMatch(/· rust-only/u)
    expect(text).toContain('nicht anwendbar')
    expect(text).toContain('0 von 1 Schiffen sind an eine Quest gebunden')
  })

  it('counts a ship as bound as soon as one quest applies to it', () => {
    const text = renderHarbor([
      ship({ name: 'gebunden', quests: [quest('lint', 'violated')] }),
      ship({ name: 'frei', quests: [quest('lint', 'notApplicable')] }),
    ])

    expect(text).toContain('1 von 2 Schiffen sind an eine Quest gebunden')
  })

  it('marks a quest the ship demands of itself', () => {
    const text = renderHarbor([
      ship({ quests: [quest('dav-schema', 'met')], ownQuests: ['dav-schema'] }),
    ])

    expect(text).toContain('(eigene)')
  })

  /** A verdict has to be arguable — but a list that always carries its proof is unreadable. */
  it('shows the evidence only when asked', () => {
    const withCheck = ship({ quests: [quest('lint', 'violated', { checks: [check(false)] })] })

    expect(renderHarbor([withCheck])).not.toContain('package.json')
    expect(renderHarbor([withCheck], { verbose: true })).toContain(
      'lintet etwas — package.json: eslint .',
    )
  })

  it('marks an unanswerable check apart from a failed one in the evidence', () => {
    const text = renderHarbor(
      [
        ship({
          quests: [
            quest('lint', 'violated', {
              checks: [check(false, 'lintet etwas'), check(null, 'nicht messbar hier')],
            }),
          ],
        }),
      ],
      { verbose: true },
    )

    expect(text).toMatch(/! lintet etwas/u)
    expect(text).toMatch(/\? nicht messbar hier/u)
  })

  /**
   * Two sentences that must not be confused, and `mockContract` is what keeps the fixture
   * honest: `scripts` decides both the members and the gaps, so a test cannot claim a ship
   * whose role is a gap *and* is measured by somebody.
   */
  it('names the roles nothing measures, and the ship that measures none', () => {
    const measures = renderHarbor([
      ship({
        contract: mockContract({
          scripts: { lint: true, typecheck: true, unit: true, e2e: false },
        }),
      }),
    ])

    expect(measures).toContain('! fehlt: e2e')

    // The default: nothing declared, so no member measures anything.
    const measuresNothing = renderHarbor([ship({ contract: mockContract() })])

    expect(measuresNothing).toContain('! keine Prüfung gefunden')
  })

  it('leaves a repository with no contract to meet alone', () => {
    const text = renderHarbor([ship({ contract: mockContract({ kind: 'other' }) })])

    expect(text).not.toContain('fehlt')
    expect(text).not.toContain('keine Prüfung gefunden')
  })

  it('marks rust past the threshold and leaves a fresh ship plain', () => {
    expect(renderHarbor([ship({ rustDays: 400 })])).toContain('Rost 400d')
    expect(renderHarbor([ship({ rustDays: 3 })])).not.toContain('Rost')
    expect(renderHarbor([ship({ rustDays: null })])).toContain('main')
  })

  it('marks a dirty tree', () => {
    expect(renderHarbor([ship({ dirty: true })])).toMatch(/main \*/u)
  })

  it('stands in for a branch it could not read', () => {
    expect(renderHarbor([ship({ branch: null })])).toContain('?')
  })

  /** Nothing swallowed: a quest file with a typo is a demand the fleet stopped being held to. */
  it('reports a quest file that did not read as one', () => {
    const text = renderHarbor([ship({ unreadableQuests: ['.hafen/quests/werft/kaputt.md'] })])

    expect(text).toContain('KATALOG')
    expect(text).toContain('! keine lesbare Quest: ship/.hafen/quests/werft/kaputt.md')
  })

  it('reports a ship quest the catalog overruled, with the reason', () => {
    const text = renderHarbor([ship({ overriddenQuests: ['lint'] })])

    expect(text).toContain('eigene Quest lint verworfen — der Katalog fordert sie schon')
  })

  it('keeps the catalog section out when there is nothing wrong with it', () => {
    expect(renderHarbor([ship()])).not.toContain('KATALOG')
  })
})
