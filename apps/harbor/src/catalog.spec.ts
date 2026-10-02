import { describe, expect, it } from 'vitest'

import { builtInCatalog } from './catalog'

describe(builtInCatalog, () => {
  /**
   * The thing a downloaded binary could not do.
   *
   * `BUILTIN_STORE` resolves from `packages/cli/src`, which on a stranger's machine is a path that
   * does not exist — so the app measured every repository against no demands and drew a fleet
   * without a single verdict. It looked broken while being correct about an empty norm.
   */
  it('carries the demands of the fleet without a checkout', () => {
    const { quests, unreadable } = builtInCatalog()

    expect(quests.length).toBeGreaterThanOrEqual(13)
    expect(unreadable).toStrictEqual([])
  })

  /** The same files the CLI reads, so the two cannot drift into two catalogs. */
  it('is the store, read a different way', () => {
    const ids = builtInCatalog().quests.map((quest) => quest.id)

    expect(ids).toContain('lint')
    expect(ids).toContain('lizenz')
    expect(ids).toContain('release-please')
    // One id apiece: `questCatalog` is what guarantees that, and this is the call site it guards.
    expect(new Set(ids).size).toBe(ids.length)
  })

  /** Every quest names the chain it belongs to — the filing and the field must agree. */
  it('reads a chain for every demand it carries', () => {
    for (const quest of builtInCatalog().quests) {
      expect(quest.chain).not.toBe('')
    }
  })
})
