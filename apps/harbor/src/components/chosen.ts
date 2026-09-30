/**
 * What a reader pointed at, in one word.
 *
 * Every drawn thing on a ship stands for something the datasheet can also say, and a click has to
 * carry *which* of them — otherwise a container and a stash crate and a carried repository all
 * answer "this ship", which is the answer the sheet already gave before anybody clicked.
 *
 * Two kinds and not one flat id, because the two are looked up differently: a demand is found by
 * its own id in a catalog, a mark is a *kind* and stands for however many of that kind there are.
 * Four stash entries are one mark, not four.
 */

import type { MarkKind } from './marks'

export type Chosen = { kind: 'quest'; id: string } | { kind: 'mark'; mark: MarkKind }

/**
 * The same thing, as one string — for a `v-if` and for a key.
 *
 * Templates compare badly against objects: `chosen === x` on a fresh object is never true, and a
 * component that re-derived the comparison would be a second opinion about what "the same choice"
 * means. One spelling, used everywhere.
 */
export function chosenKey(chosen: Chosen | null): string {
  if (chosen === null) {
    return ''
  }
  return chosen.kind === 'quest' ? `quest:${chosen.id}` : `mark:${chosen.mark}`
}

/** Whether a choice is this demand. */
export function isQuest(chosen: Chosen | null, id: string): boolean {
  return chosen?.kind === 'quest' && chosen.id === id
}

/** Whether a choice is this kind of mark. */
export function isMark(chosen: Chosen | null, mark: MarkKind): boolean {
  return chosen?.kind === 'mark' && chosen.mark === mark
}
