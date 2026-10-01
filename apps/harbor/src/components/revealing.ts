/**
 * One answer to "a choice made elsewhere brings its row into view".
 *
 * Three components had their own copy of the same watcher — a quest row, the marks section and,
 * missing entirely, the forge rows. The one without it was the bug: clicking the heap of pull
 * requests on the drawing ringed a row somewhere below the fold and left the reader to go and
 * find it. A rule kept in three places is a rule that holds in two.
 *
 * What stays with each component is the only part that differs: which element answers for a
 * choice. The *gesture* — only on a real choice, bring it to the top, clear of the sticky header
 * — lives here.
 */

import { watch } from 'vue'

/**
 * `start` and not `nearest`: a row already partly in view stayed where it was, so choosing a box
 * in the harbour looked like it had done nothing. The panel's `scroll-margin-top` keeps the row
 * clear of the header that sits over it.
 */
export const REVEAL: ScrollIntoViewOptions = { block: 'start' }

/**
 * Whether anything was chosen at all.
 *
 * Takes both shapes the window uses — a `Chosen` or the plain `true` a row gets when its parent
 * has already decided the choice is this one's. `null` and `false` are "nothing was chosen",
 * which is not a reason to move a panel somebody is reading.
 */
export function wasChosen<T>(pick: T): pick is NonNullable<T> {
  return pick !== null && pick !== undefined && (pick as unknown) !== false
}

/**
 * Watch a choice and bring the element that answers for it into view.
 *
 * `rowFor` returns the element or nothing — nothing meaning "this choice is not mine", which is
 * the usual case: every component sees every choice and almost all of them belong to somebody
 * else. `opened` is for a row that has to unfold before it can be scrolled to.
 */
export function revealChosen<T>(
  chosen: () => T,
  rowFor: (pick: NonNullable<T>) => HTMLElement | null | undefined,
  opened: (pick: NonNullable<T>) => void = () => undefined,
): void {
  watch(
    chosen,
    (pick) => {
      if (!wasChosen(pick)) {
        return
      }
      opened(pick)
      rowFor(pick)?.scrollIntoView(REVEAL)
    },
    { immediate: true },
  )
}
