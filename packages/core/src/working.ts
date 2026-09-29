/**
 * What is going on in a working tree, beyond "dirty".
 *
 * `dirty` was one bit for five different situations, and they are not the same sentence at all:
 * a tree with staged work is mid-commit, one with untracked files may just have a build directory
 * nobody ignored, and one with conflicts is *stopped* — somebody has to decide something before
 * anything else happens there. A harbour that draws all five alike says nothing about any of them.
 *
 * Read out of `git status --porcelain`, which `inspectShip` already runs: this costs no extra
 * process over ninety-one repositories, which is the whole reason it is read here rather than
 * asked for separately.
 */

/** One line of `--porcelain` v1: two status letters, then the path. */
export interface Working {
  /** Changes in the index, waiting for a commit. */
  staged: number
  /** Changes in the tree, not staged. */
  unstaged: number
  /** Files git has never been told about. */
  untracked: number
  /**
   * Paths with a conflict, from an interrupted merge or rebase.
   *
   * Counted apart from everything else because it is the one state that is *stuck*: the others
   * are work in progress, this is work that cannot continue until a human decides something.
   */
  conflicted: number
}

export const NOTHING_OPEN: Working = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 }

/**
 * The conflict pairs of `git status --porcelain`.
 *
 * Spelled out rather than "contains a U", because `AA` and `DD` are conflicts without one and a
 * `U` alone is not a state git emits. The list is git's own and closed.
 */
const CONFLICTS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

/**
 * What the porcelain says, counted.
 *
 * `null` in and everything zero out: a repository git could not answer for has nothing open, and
 * claiming otherwise would put a mark on a hull for a measurement that never happened.
 */
export function readWorking(porcelain: string | null): Working {
  if (porcelain === null || porcelain.trim() === '') {
    return NOTHING_OPEN
  }

  let staged = 0
  let unstaged = 0
  let untracked = 0
  let conflicted = 0

  for (const line of porcelain.split('\n')) {
    // Two status letters and a space; anything shorter is not a status line.
    if (line.length < 3) {
      continue
    }
    const code = line.slice(0, 2)

    if (CONFLICTS.has(code)) {
      // A conflicted path is counted once and only here: it is in the index and in the tree, and
      // counting it three times would make one stuck file look like three kinds of work.
      conflicted += 1
      continue
    }
    if (code === '??') {
      untracked += 1
      continue
    }
    // Ignored files only appear with `--ignored`, which this never passes.
    const index = code[0] ?? ' '
    const tree = code[1] ?? ' '
    if (index !== ' ') {
      staged += 1
    }
    if (tree !== ' ') {
      unstaged += 1
    }
  }

  return { staged, unstaged, untracked, conflicted }
}

/** Whether anything at all is open — the old `dirty`, derived rather than measured twice. */
export function hasOpenWork(working: Working): boolean {
  return working.staged + working.unstaged + working.untracked + working.conflicted > 0
}

/**
 * How many entries lie on the stash.
 *
 * Its own command, and the only one this survey adds per repository — worth it because a stash is
 * work that exists nowhere else: it is not in a commit, not in the tree, and invisible to every
 * other measurement here. Losing track of one is losing the work.
 *
 * Counted and not listed: what is *in* a stash entry is the repository's business, and a harbour
 * that printed stash subjects would be reading other people's notes to themselves.
 */
export function countStash(list: string | null): number {
  if (list === null || list.trim() === '') {
    return 0
  }
  return list.trim().split('\n').length
}
