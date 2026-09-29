import { describe, expect, it } from 'vitest'

import { mergeCatalogs, readShipCatalog, SHIP_STORE } from './catalog'
import { mockPorts } from './mock'
import { renderQuest } from './quest'

import type { Quest, QuestCatalog } from './quest'

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

function catalog(quests: readonly Quest[], unreadable: readonly string[] = []): QuestCatalog {
  return { quests, unreadable }
}

describe(mergeCatalogs, () => {
  it('keeps both, and marks which came from where', () => {
    const merged = mergeCatalogs(catalog([quest('lint')]), catalog([quest('dav-schema')]))

    expect(merged.quests.map((entry) => entry.id)).toStrictEqual(['dav-schema', 'lint'])
    expect(merged.origin.get('lint')).toBe('fleet')
    expect(merged.origin.get('dav-schema')).toBe('ship')
    expect(merged.overridden).toStrictEqual([])
  })

  /**
   * The whole rule: a ship may add and never weaken. A repository that could answer its own
   * demands down would make the evaluation a kept status field again instead of a measurement
   * against something somebody decided.
   */
  it('drops a ship quest that renames a demand the fleet already makes', () => {
    const strict = quest('lint', { title: 'eslint mit --max-warnings 0' })
    const lax = quest('lint', { title: 'irgendein Linter genuegt' })

    const merged = mergeCatalogs(catalog([strict]), catalog([lax]))

    expect(merged.quests).toStrictEqual([strict])
    expect(merged.quests[0]?.title).toBe('eslint mit --max-warnings 0')
    expect(merged.origin.get('lint')).toBe('fleet')
  })

  /** Dropped out loud: a human who wrote a file and sees no effect is owed the reason. */
  it('says which of its own quests were dropped', () => {
    const merged = mergeCatalogs(
      catalog([quest('lint'), quest('unit')]),
      catalog([quest('unit'), quest('lint'), quest('eigene')]),
    )

    expect(merged.overridden).toStrictEqual(['lint', 'unit'])
    expect(merged.quests.map((entry) => entry.id)).toStrictEqual(['eigene', 'lint', 'unit'])
  })

  /** A ship naming one id twice is the same collision as against the fleet, and the same answer. */
  it('takes the first of two local quests sharing an id', () => {
    const first = quest('eigene', { title: 'zuerst' })
    const second = quest('eigene', { title: 'danach' })

    const merged = mergeCatalogs(catalog([]), catalog([first, second]))

    expect(merged.quests).toStrictEqual([first])
    expect(merged.overridden).toStrictEqual(['eigene'])
  })

  /**
   * The order is the catalog's own — by chain, then by id — and not fleet-then-ship. Where a
   * demand was written down is not how urgent it is.
   */
  it('orders by chain and id, not by which store it came from', () => {
    const merged = mergeCatalogs(
      catalog([quest('zuletzt', { chain: 'handel' })]),
      catalog([quest('zuerst', { chain: 'werft' })]),
    )

    expect(merged.quests.map((entry) => entry.id)).toStrictEqual(['zuerst', 'zuletzt'])
  })

  /** An unreadable ship quest has to be findable, and its path alone does not say which store. */
  it('prefixes an unreadable ship quest with the store it lies in', () => {
    const merged = mergeCatalogs(
      catalog([], ['quests/werft/kaputt.md']),
      catalog([], ['quests/werft/auch-kaputt.md']),
    )

    expect(merged.unreadable).toStrictEqual([
      'quests/werft/kaputt.md',
      `${SHIP_STORE}/quests/werft/auch-kaputt.md`,
    ])
  })

  it('is the identity on an empty ship catalog', () => {
    const fleet = catalog([quest('lint'), quest('unit')])

    expect(mergeCatalogs(fleet, catalog([])).quests).toStrictEqual(fleet.quests)
  })
})

describe(readShipCatalog, () => {
  it('reads a ship quest out of its dot directory', async () => {
    const own = quest('dav-schema', { title: 'Das Schema liegt im Repo' })
    const ports = mockPorts({
      dirs: {
        [`/repos/org/ship/${SHIP_STORE}/quests`]: ['werft'],
        [`/repos/org/ship/${SHIP_STORE}/quests/werft`]: ['dav-schema.md'],
      },
      files: {
        [`/repos/org/ship/${SHIP_STORE}/quests/werft/dav-schema.md`]: renderQuest(own),
      },
    })

    const read = await readShipCatalog(ports.fs, '/repos/org/ship')

    expect(read.quests.map((entry) => entry.id)).toStrictEqual(['dav-schema'])
    expect(read.quests[0]?.title).toBe('Das Schema liegt im Repo')
  })

  /** Most ships keep none, and that is an answer rather than a fault. */
  it('comes back empty for a ship that keeps no quests', async () => {
    const read = await readShipCatalog(mockPorts().fs, '/repos/org/ship')

    expect(read).toStrictEqual({ quests: [], unreadable: [] })
  })
})
