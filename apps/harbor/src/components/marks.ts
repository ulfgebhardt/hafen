/**
 * What a hull carries besides its contract: the state of the repository itself.
 *
 * The deck says what the fleet demands. These say what is going on *locally* — work that is
 * staged, unpushed, stashed, or stuck in a conflict. Two different questions, so two different
 * places on the ship: the contract is the deck, the local state is cargo, flags and damage.
 *
 * Worked out here rather than in the renderer for the same reason as `hull.ts`: which marks a
 * ship carries is a reading of a measurement, and a reading belongs somewhere a test can point
 * at. The renderer only places what this returns.
 */

import type { Ship } from '@hafen/core'

/**
 * A mark on a ship, in the vocabulary of the thing it stands for.
 *
 * `damage` is deliberately its own kind rather than a heavier `cargo`: a conflict is not more
 * work, it is *stopped* work — somebody has to decide something before anything continues there.
 * Drawn as a breach in the hull, which is the one thing on this ship that is not cargo.
 */
export type MarkKind =
  /** Staged: in the index, waiting for a commit. A crate, closed. */
  | 'staged'
  /** Unstaged: changed in the tree. A crate, open. */
  | 'unstaged'
  /** Untracked: git has never been told. A crate with no papers — dashed. */
  | 'untracked'
  /** Conflicted: an interrupted merge. A breach. */
  | 'damage'
  /** Commits not pushed. A pennant at the mast — cargo aboard, not delivered. */
  | 'pennant'
  /** Commits upstream not merged. A drag mark at the stern. */
  | 'drag'
  /** Stash entries. Crates on the quay: work that is in no commit and in no tree. */
  | 'stash'
  /** Other worktrees. Boats alongside. */
  | 'boat'

export interface Mark {
  kind: MarkKind
  /** How many there are. Drawn up to `MAX_PER_KIND`, counted honestly in the sheet. */
  count: number
}

/**
 * At most this many of one kind are drawn.
 *
 * A repository with two hundred untracked files would otherwise bury the ship under crates and
 * say nothing except "a lot". The cap is a drawing limit and never a measurement: `Ship` keeps
 * the real number and the datasheet prints it.
 */
export const MAX_PER_KIND = 4

/**
 * Every mark a ship carries, in drawing order.
 *
 * Damage first because it is the one state that is stuck rather than in progress; after that,
 * from the deck outwards. Kinds with a count of zero are absent rather than drawn empty — the
 * same rule the deck follows, and for the same reason.
 */
export function marksOf(ship: Ship): readonly Mark[] {
  const all: readonly Mark[] = [
    { kind: 'damage', count: ship.working.conflicted },
    { kind: 'staged', count: ship.working.staged },
    { kind: 'unstaged', count: ship.working.unstaged },
    { kind: 'untracked', count: ship.working.untracked },
    { kind: 'pennant', count: ship.ahead ?? 0 },
    { kind: 'drag', count: ship.behind ?? 0 },
    { kind: 'stash', count: ship.stash },
    { kind: 'boat', count: ship.docks.length },
  ]
  return all.filter((mark) => mark.count > 0)
}

/** How many of a kind to draw — the honest count, capped at what fits. */
export function drawn(mark: Mark): number {
  return Math.min(mark.count, MAX_PER_KIND)
}

/** Whether the count had to be cut, so the drawing can say `4+` instead of claiming four. */
export function isCapped(mark: Mark): boolean {
  return mark.count > MAX_PER_KIND
}

/**
 * Nothing open, nothing unpushed, nothing stashed, no conflict.
 *
 * Its own question because the absence is worth seeing: a clean tree on its branch is the state
 * most repositories should be in, and a harbour where that looks exactly like "not measured"
 * would hide the one thing a glance is for.
 */
export function isShipshape(ship: Ship): boolean {
  return marksOf(ship).filter((mark) => mark.kind !== 'boat').length === 0
}

export const MARK_LABEL: Record<MarkKind, string> = {
  staged: 'vorgemerkt',
  unstaged: 'geändert',
  untracked: 'unverzeichnet',
  damage: 'Konflikt',
  pennant: 'nicht gepusht',
  drag: 'zurück',
  stash: 'Stash',
  boat: 'Worktree',
}

/** What each mark means, for the sheet — a symbol nobody can name is decoration. */
export const MARK_MEANING: Record<MarkKind, string> = {
  staged: 'im Index, wartet auf einen Commit',
  unstaged: 'im Baum geändert, nicht vorgemerkt',
  untracked: 'git weiß nichts davon',
  damage: 'abgebrochener Merge — hier entscheidet ein Mensch, bevor es weitergeht',
  pennant: 'Commits, die der Remote nicht hat',
  drag: 'Commits, die der Remote hat und dieser Baum nicht',
  stash: 'Arbeit in keinem Commit und in keinem Baum — nur hier',
  boat: 'weiterer Arbeitsbaum dieses Repos',
}
