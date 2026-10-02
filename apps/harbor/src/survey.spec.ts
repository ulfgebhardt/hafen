import { describe, expect, it, vi } from 'vitest'

import { demandsOf, identities, registerIn, surveyInWindow } from './survey'

/**
 * One fake Rust half, answering by command name.
 *
 * The survey is `packages/core`'s and is tested there against its own mock; what is tested here is
 * the four questions this file answers for it — where to look, what is demanded, who the reader
 * is, and what the forge said.
 */
const withInvoke = (answers: Record<string, unknown>): void => {
  vi.stubGlobal('__TAURI_INTERNALS__', {
    invoke: async (command: string, args?: Record<string, unknown>) =>
      await Promise.resolve(
        typeof answers[command] === 'function'
          ? (answers[command] as (a?: Record<string, unknown>) => unknown)(args)
          : (answers[command] ?? null),
      ),
  })
}

describe(demandsOf, () => {
  /**
   * The shipped catalog leads and the store adds — the same rule the CLI keeps, one level up from
   * a ship's own `.hafen/quests`.
   */
  it('carries its own demands where no store exists at all', async () => {
    withInvoke({ port_read_dir: null, port_read_file: null })

    const found = await demandsOf('/nowhere')

    expect(found.quests.length).toBeGreaterThanOrEqual(13)
    expect(found.overridden).toStrictEqual([])
  })

  /**
   * And a store quest that reuses an id is discarded **and named**, so the rule can be said out
   * loud. A rule whose only bite is invisible is no rule.
   */
  it('names the ids a store repeats instead of silently keeping one', async () => {
    withInvoke({
      port_read_dir: (args?: Record<string, unknown>) =>
        String(args?.['path']).endsWith('/quests')
          ? [{ name: 'werft', directory: true }]
          : [{ name: 'lint.md', directory: false }],
      port_read_file: [
        '---',
        'id: lint',
        'kette: werft',
        "titel: 'Etwas ganz anderes'",
        'gilt_fuer: [node]',
        'pruefung:',
        '  art: manuell',
        '---',
        'Eine Forderung, die dieselbe Id noch einmal belegt.',
      ].join('\n'),
    })

    const found = await demandsOf('/store')

    expect(found.overridden).toStrictEqual(['lint'])
  })
})

describe(identities, () => {
  /** Without an address every commit counts as somebody else's, which is worse than no figure. */
  it('asks git who the reader is', async () => {
    withInvoke({ port_run: { code: 0, stdout: ' Ulf@Example.DE \n', stderr: '' } })

    await expect(identities()).resolves.toStrictEqual(['ulf@example.de'])
  })

  it('says nobody rather than inventing one', async () => {
    withInvoke({ port_run: { code: 1, stdout: '', stderr: '' } })

    await expect(identities()).resolves.toStrictEqual([])
  })
})

describe(registerIn, () => {
  /** A machine with no register has made no decisions, which is not the same as a broken one. */
  it('takes a missing register as no decisions yet', async () => {
    withInvoke({ port_read_file: null })

    await expect(registerIn('/store')).resolves.toStrictEqual({ archived: [], enlisted: [] })
  })
})

describe(surveyInWindow, () => {
  /**
   * A machine nobody has told where to look has **no roots**, and that must be an empty harbour
   * rather than a guess at `~/Projects`. The first-run question is what fills it.
   */
  it('measures nothing where no root has been named', async () => {
    withInvoke({
      port_read_dir: null,
      port_read_file: null,
      port_run: { code: 1, stdout: '', stderr: '' },
    })

    const out = await surveyInWindow({ store: '/store', snapshot: '/snap.json', roots: [] })

    expect(out.ships).toStrictEqual([])
  })
})
