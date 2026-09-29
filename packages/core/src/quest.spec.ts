import { describe, expect, it } from 'vitest'

import { parseQuest, questCatalog, renderQuest } from './quest'

import type { Quest } from './quest'

/** The file as concept section 4 and order 0071 write it, down to the quoting. */
const LINT = [
  '---',
  'id: lint',
  'kette: werft',
  "titel: 'Lint: ein Schritt, der falschen Code findet — und er ist still'",
  'gilt_fuer: [node, rust]',
  'pruefung:',
  '  art: datei',
  '  checks:',
  '    - pruef: rolle',
  '      rolle: lint',
  '    - pruef: rolle-in-ci',
  '      rolle: lint',
  "      frage: 'ein CI-Workflow ruft ihn auf'",
  'warum: >',
  '  Ohne Lint-Schritt wird jede Abnahme von Hand neu verhandelt. Das ist der',
  '  Posten, der sich pro Auftrag wiederholt.',
  '---',
  '',
  '# Lint',
  '',
].join('\n')

describe(parseQuest, () => {
  it('reads the schema from concept section 4', () => {
    expect(parseQuest(LINT)).toStrictEqual({
      id: 'lint',
      chain: 'werft',
      title: 'Lint: ein Schritt, der falschen Code findet — und er ist still',
      requires: [],
      appliesTo: ['node', 'rust'],
      checks: [
        { probe: 'rolle', kind: 'datei', args: { rolle: 'lint' }, question: null },
        {
          probe: 'rolle-in-ci',
          kind: 'datei',
          args: { rolle: 'lint' },
          question: 'ein CI-Workflow ruft ihn auf',
        },
      ],
      why: 'Ohne Lint-Schritt wird jede Abnahme von Hand neu verhandelt. Das ist der Posten, der sich pro Auftrag wiederholt.',
    })
  })

  it('folds a block scalar whose prose carries a colon', () => {
    // `readLine` splits on the first colon to find a key, so a paragraph that contains one used
    // to lose everything in front of it.
    const text = [
      '---',
      'id: x',
      'kette: werft',
      'titel: x',
      'warum: >',
      '  Der Grund: er steht hier.',
      '---',
    ].join('\n')

    expect(parseQuest(text)?.why).toBe('Der Grund: er steht hier.')
  })

  it('reads a list in block form as well as inline', () => {
    const text = [
      '---',
      'id: x',
      'kette: werft',
      'titel: x',
      'setzt_voraus:',
      '  - lint',
      '  - typecheck',
      'gilt_fuer:',
      '  - node',
      '---',
    ].join('\n')

    const quest = parseQuest(text)

    expect(quest?.requires).toStrictEqual(['lint', 'typecheck'])
    expect(quest?.appliesTo).toStrictEqual(['node'])
  })

  it('takes the art from the quest and lets a single check override it', () => {
    // The one deviation from section 4's schema, and the reason it exists: the manual half of
    // the lint standard sits in a quest whose other checks read files.
    const text = [
      '---',
      'id: x',
      'kette: werft',
      'titel: x',
      'pruefung:',
      '  checks:',
      '    - pruef: datei',
      '      datei: .tool-versions',
      '    - pruef: manuell',
      '      art: manuell',
      '  art: datei',
      '---',
    ].join('\n')

    expect(parseQuest(text)?.checks.map((check) => check.kind)).toStrictEqual(['datei', 'manuell'])
  })

  it('drops a trait it does not measure rather than claiming it', () => {
    // A catalog written for a later Werft must not make a ship owe something nobody can ask.
    const text = [
      '---',
      'id: x',
      'kette: werft',
      'titel: x',
      'gilt_fuer: [node, elixir]',
      '---',
    ].join('\n')

    expect(parseQuest(text)?.appliesTo).toStrictEqual(['node'])
  })

  it('keeps an unknown probe, because a name nobody implements is a finding and not a crash', () => {
    const text = [
      '---',
      'id: x',
      'kette: werft',
      'titel: x',
      'pruefung:',
      '  art: http',
      '  checks:',
      '    - pruef: antwortet',
      '      url: https://example.org',
      '---',
    ].join('\n')

    expect(parseQuest(text)?.checks).toStrictEqual([
      { probe: 'antwortet', kind: 'http', args: { url: 'https://example.org' }, question: null },
    ])
  })

  it('refuses a file that is not a quest', () => {
    expect(parseQuest('# Kein Frontmatter')).toBeNull()
    expect(parseQuest('---\nid: x\nkette: werft\n---')).toBeNull()
    expect(parseQuest('---\nid: x\nkette: erfunden\ntitel: x\n---')).toBeNull()
    expect(parseQuest('---\nkette: werft\ntitel: x\n---')).toBeNull()
  })
})

describe(renderQuest, () => {
  const QUESTS: readonly Quest[] = [
    {
      id: 'lint',
      chain: 'werft',
      title: 'Lint: ein Schritt, der falschen Code findet — und er ist still',
      requires: [],
      appliesTo: ['node', 'rust'],
      checks: [{ probe: 'rolle', kind: 'datei', args: { rolle: 'lint' }, question: null }],
      why: 'Ohne Lint-Schritt wird jede Abnahme von Hand neu verhandelt, und das ist der Posten, der sich pro Auftrag wiederholt statt einmal zu kosten.',
    },
    {
      id: 'lint-standard',
      chain: 'werft',
      title: 'Und er ist der Hausstandard',
      requires: ['lint'],
      appliesTo: ['node'],
      checks: [
        {
          probe: 'datei-enthaelt',
          kind: 'datei',
          args: { datei: 'eslint.config.ts', text: 'x' },
          question: null,
        },
        { probe: 'manuell', kind: 'manuell', args: {}, question: 'jede Abweichung ist begründet' },
      ],
      why: 'Kurz.',
    },
  ]

  // The reason this function exists at all: a reader written by hand loses a field the day
  // somebody adds one, and only writing and reading back notices.
  it.each(QUESTS)('round-trips $id', (quest) => {
    expect(parseQuest(renderQuest(quest))).toStrictEqual(quest)
  })

  it('names the art on the check that differs, not on every check', () => {
    const text = renderQuest(QUESTS[1] as Quest)

    expect(text).toContain('  art: datei')
    expect(text.match(/art: /gu)).toHaveLength(2)
  })
})

describe(questCatalog, () => {
  it('orders by chain as section 4 lays them out, then by id', () => {
    const quest = (id: string, chain: Quest['chain']): Quest => ({
      id,
      chain,
      title: id,
      requires: [],
      appliesTo: [],
      checks: [],
      why: '',
    })

    expect(
      questCatalog([
        quest('landingpage', 'flagge'),
        quest('lint-standard', 'werft'),
        quest('deployment', 'auslauf'),
        quest('lint', 'werft'),
      ]).map((entry) => entry.id),
    ).toStrictEqual(['lint', 'lint-standard', 'deployment', 'landingpage'])
  })
})
