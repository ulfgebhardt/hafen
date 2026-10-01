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

export type Chosen =
  | { kind: 'quest'; id: string }
  | { kind: 'mark'; mark: MarkKind }
  | { kind: 'pier' }
  /**
   * What the forge has open: a heap of issues, or one of pull requests.
   *
   * A kind and not an id, like a mark and for the same reason: twelve open issues are one heap,
   * not twelve. What the sheet answers with is the row in the forge panel.
   */
  | { kind: 'forge'; open: 'issue' | 'pull' }

/** The one that stands for "everything waiting here", which is what the gangway draws. */
export const PIER: Chosen = { kind: 'pier' }

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
  if (chosen.kind === 'quest') {
    return `quest:${chosen.id}`
  }
  if (chosen.kind === 'mark') {
    return `mark:${chosen.mark}`
  }
  return chosen.kind === 'forge' ? `forge:${chosen.open}` : 'pier'
}

/** Whether a choice is this demand. */
export function isQuest(chosen: Chosen | null, id: string): boolean {
  return chosen?.kind === 'quest' && chosen.id === id
}

/** Whether a choice is this kind of mark. */
export function isMark(chosen: Chosen | null, mark: MarkKind): boolean {
  return chosen?.kind === 'mark' && chosen.mark === mark
}

/** Whether a choice is this heap of open work. */
export function isForge(chosen: Chosen | null, open: 'issue' | 'pull'): boolean {
  return chosen?.kind === 'forge' && chosen.open === open
}

/**
 * Whether a choice is the planking as a whole.
 *
 * The gangway's own answer. It is not a *thing* on the pier, it is the sign that there are things
 * on it — so it points at all of them rather than at whichever happens to be first, which would
 * make clicking the plank and clicking that one crate the same act.
 */
export function isPier(chosen: Chosen | null): boolean {
  return chosen?.kind === 'pier'
}
