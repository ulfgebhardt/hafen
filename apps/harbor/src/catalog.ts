/**
 * The catalog the window carries, compiled into it.
 *
 * The CLI reads `store/quests/<kette>/<id>.md` off the disk, and in a checkout that is right. A
 * bundled application has no checkout: `BUILTIN_STORE` resolves from `packages/cli/src`, which on
 * a stranger's machine is a path that does not exist — so a downloaded binary would measure every
 * repository against **no demands at all** and draw a fleet without a single verdict. It would
 * look broken while being correct about an empty norm.
 *
 * So the markdown comes in at build time. The files stay the single source — the same ones the
 * CLI reads, globbed from `store/` — and nothing is duplicated: what is compiled in *is* the
 * store, read a different way.
 */

import { parseQuest, questCatalog } from '@hafen/core'

import type { Quest } from '@hafen/core'

/**
 * Every quest of the shipped store, as raw markdown.
 *
 * Eager, because a catalog read lazily would make the first measurement wait on a dynamic import
 * for thirteen files that together are smaller than one hull.
 */
const FILES = import.meta.glob<string>('../../../store/quests/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/**
 * What the shipped catalog demands, and which of its files could not be read.
 *
 * The same shape `readQuestCatalog` returns, so the two are interchangeable at the call site: a
 * quest nobody can parse is **named** rather than dropped, because a catalog that quietly loses a
 * demand is a catalog that cannot be trusted about the ones it kept.
 */
export function builtInCatalog(): { quests: readonly Quest[]; unreadable: readonly string[] } {
  // Named relative to the store, so an unreadable one reads the same here as in the CLI's message.
  const read = Object.entries(FILES).map(([at, raw]) => ({
    at: at.includes('store/') ? at.slice(at.indexOf('store/') + 'store/'.length) : at,
    quest: parseQuest(raw),
  }))
  return {
    quests: questCatalog(read.flatMap(({ quest }) => (quest === null ? [] : [quest]))),
    unreadable: read.flatMap(({ at, quest }) => (quest === null ? [at] : [])).sort(),
  }
}
