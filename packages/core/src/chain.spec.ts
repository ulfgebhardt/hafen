import { describe, expect, it } from 'vitest'

import { evaluateQuests, unmeasuredQuests, violatedQuests } from './chain'
import { mockContract } from './mock'

import type { QuestFacts } from './probe'
import type { Quest, QuestCheck, ShipTrait } from './quest'

/**
 * `count` workflow files, contents irrelevant.
 *
 * These specs assert the *count* and the "are there any at all" split; nothing here reads a body.
 */
function ciFiles(count: number, body = 'name: ci\n'): readonly string[] {
  return Array.from({ length: count }, () => body)
}

function check(
  probe: string,
  args: Record<string, string> = {},
  kind: QuestCheck['kind'] = 'datei',
): QuestCheck {
  return { probe, kind, args, question: null }
}

function quest(id: string, overrides: Partial<Quest> = {}): Quest {
  return {
    id,
    chain: 'werft',
    title: id,
    requires: [],
    appliesTo: [],
    checks: [],
    why: '',
    ...overrides,
  }
}

function facts(traits: readonly ShipTrait[], overrides: Partial<QuestFacts> = {}): QuestFacts {
  return {
    contract: mockContract(),
    traits,
    files: new Map(),
    dependencies: [],
    workflows: ciFiles(0),
    ...overrides,
  }
}

/** A ship that lints under its own name and runs it in CI — pinne, reduced. */
const LINTING = facts(['node'], {
  contract: mockContract({
    scripts: { lint: true, typecheck: false, unit: false, e2e: false },
    inCi: ['lint'],
  }),
  workflows: ciFiles(4),
  dependencies: ['eslint-config-it4c'],
  files: new Map([['eslint.config.ts', "import it4c from 'eslint-config-it4c'\n"]]),
})

const LINT = quest('lint', {
  appliesTo: ['node', 'rust'],
  checks: [check('rolle', { rolle: 'lint' }), check('rolle-in-ci', { rolle: 'lint' })],
})

const STANDARD = quest('lint-standard', {
  appliesTo: ['node'],
  requires: ['lint'],
  checks: [
    check('abhaengigkeit', { paket: 'eslint-config-it4c' }),
    check('datei-enthaelt', { datei: 'eslint.config.ts', text: 'eslint-config-it4c' }),
  ],
})

describe(evaluateQuests, () => {
  it('meets both quests on a ship that carries the house standard', () => {
    const results = evaluateQuests([LINT, STANDARD], LINTING)

    expect(results.map((result) => [result.id, result.verdict])).toStrictEqual([
      ['lint', 'met'],
      ['lint-standard', 'met'],
    ])
  })

  it('carries the evidence of every check, not just the verdict', () => {
    // The one thing `0081` needs from here and the reason it had to be in this order: a verdict
    // nobody can trace is the kept status field it replaces.
    const [lint] = evaluateQuests([LINT], LINTING)

    expect(lint?.checks.map((entry) => entry.evidence)).toStrictEqual([
      {
        question: 'irgendetwas misst die Rolle lint',
        where: '1 Manifest, 4 Workflows',
        found: 'test:lint',
      },
      {
        question: 'ein CI-Workflow ruft lint auf',
        where: '.github/workflows (4 Workflows)',
        found: 'lint',
      },
    ])
  })

  it('does not apply where the ship has none of the traits the demand names', () => {
    const results = evaluateQuests([LINT, STANDARD], facts([]))

    expect(results.map((result) => result.verdict)).toStrictEqual([
      'notApplicable',
      'notApplicable',
    ])
    expect(results[0]?.reason).toBe('gilt für node, rust — dieses Schiff ist nichts davon')
  })

  it('leaves the house standard out for a Rust crate and keeps the demand for a lint step', () => {
    // The case the order names: a crate lints with clippy in CI and owes no eslint config.
    const crate = facts(['rust'], {
      contract: mockContract({ kind: 'other', members: [], inCi: ['lint'] }),
      workflows: ciFiles(1),
    })
    const results = evaluateQuests([LINT, STANDARD], crate)

    expect(results.map((result) => [result.id, result.verdict])).toStrictEqual([
      ['lint', 'met'],
      ['lint-standard', 'notApplicable'],
    ])
    expect(results[1]?.reason).toBe('gilt für node — dieses Schiff ist rust')
  })

  it('takes a quest out with a prerequisite that does not apply, rather than making it wait', () => {
    // Waiting would leave it in the list forever, looking like work that will arrive later.
    const results = evaluateQuests(
      [quest('lint', { appliesTo: ['rust'] }), STANDARD],
      facts(['node']),
    )

    expect(results[1]?.verdict).toBe('notApplicable')
    expect(results[1]?.reason).toBe('Voraussetzung lint gilt hier nicht')
  })

  it('waits on a prerequisite that applies and is not met', () => {
    const bare = facts(['node'], { workflows: ciFiles(1) })
    const results = evaluateQuests([LINT, STANDARD], bare)

    expect(results[0]?.verdict).toBe('violated')
    expect(results[1]).toMatchObject({ verdict: 'waiting', waitingOn: ['lint'] })
    // A quest that is waiting was not measured, so it makes no claim about the config file.
    expect(results[1]?.checks).toStrictEqual([])
  })

  it('names what is open when a demand is violated', () => {
    const results = evaluateQuests([LINT], facts(['node'], { workflows: ciFiles(2) }))

    expect(results[0]?.reason).toBe(
      'offen: irgendetwas misst die Rolle lint, ein CI-Workflow ruft lint auf',
    )
  })

  it('says a demand was not measured rather than calling it met or violated', () => {
    // A ship with a manifest but no workflows can answer the first check and not the second.
    const results = evaluateQuests(
      [quest('ci', { checks: [check('rolle-in-ci', { rolle: 'lint' })] })],
      facts(['node']),
    )

    expect(results[0]?.verdict).toBe('unmeasured')
    expect(results[0]?.reason).toContain('nichts davon ist hier messbar')
  })

  it('counts what it could not read beside what it could', () => {
    const results = evaluateQuests(
      [
        quest('gemischt', {
          checks: [check('rolle', { rolle: 'lint' }), check('unterschrift', {}, 'manuell')],
        }),
      ],
      LINTING,
    )

    expect(results[0]).toMatchObject({
      verdict: 'met',
      reason: '1 von 2 Prüfungen erfüllt, 1 nicht messbar',
    })
  })

  it('never meets a quest that names no check at all', () => {
    const results = evaluateQuests([quest('leer')], facts(['node']))

    expect(results[0]).toMatchObject({
      verdict: 'unmeasured',
      reason: 'die Quest nennt keine Prüfung',
    })
  })

  it('ignores a prerequisite the catalog does not have', () => {
    // Same direction `openBlockers` takes with a typo in `blocked_by`: a promise nobody can look
    // up must not freeze work.
    const results = evaluateQuests(
      [quest('x', { requires: ['gibtsnicht'], checks: [check('datei', { datei: 'a' })] })],
      facts(['node'], { files: new Map([['a', 'x']]) }),
    )

    expect(results[0]?.verdict).toBe('met')
  })

  it('reads two quests that require each other as waiting, not as a hang', () => {
    const results = evaluateQuests(
      [quest('a', { requires: ['b'] }), quest('b', { requires: ['a'] })],
      facts(['node']),
    )

    expect(results.map((result) => result.verdict)).toStrictEqual(['waiting', 'waiting'])
  })

  it('evaluates in the catalog order, prerequisites first', () => {
    const results = evaluateQuests([STANDARD, LINT], LINTING)

    expect(results.map((result) => result.id)).toStrictEqual(['lint', 'lint-standard'])
  })
})

describe(violatedQuests, () => {
  it('picks the demands that are work, and leaves the ones nobody could measure', () => {
    const results = evaluateQuests([LINT, STANDARD], facts(['node'], { workflows: ciFiles(1) }))

    expect(violatedQuests(results).map((result) => result.id)).toStrictEqual(['lint'])
    expect(unmeasuredQuests(results)).toStrictEqual([])
  })
})
