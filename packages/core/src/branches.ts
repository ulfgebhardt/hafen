/**
 * What local branches a repository is carrying, and which of them have nothing left to say.
 *
 * A measurement like every other here, and it exists because branch housekeeping is the one tidy
 * job nobody does: a merged branch and a branch whose remote was deleted both sit there forever,
 * they cost nothing visible, and after two years a repository has forty of them. The harbour can
 * see that; it could not before.
 *
 * Two commands, both reading:
 *
 * - `for-each-ref` over `refs/heads` for the name, what it follows, and whether that upstream is
 *   gone. One command for all of it, because a survey of ninety repositories pays for every
 *   process — the same reason `git remote -v` is read once instead of per remote.
 * - `branch --merged HEAD` for what is already in the current branch. That question `for-each-ref`
 *   cannot answer: containment is a walk of the graph and not a property of a ref.
 *
 * **`stale` is not "delete this".** It is "git would let this go" — which is exactly what
 * `git branch -d` checks for itself, and the reason nothing here ever reaches for `-D`. The
 * refusal belongs to git, which knows; a `-D` from us would be a promise about somebody's work
 * that we cannot keep.
 */

/** One local branch, as git describes it. */
export interface Branch {
  name: string
  /** The remote branch it follows, or `null` for one that follows nothing. */
  upstream: string | null
  /**
   * The upstream was deleted on the remote.
   *
   * The clearest sign a branch is finished: it was pushed, it was merged somewhere, and whoever
   * merged it removed the remote copy. What is left here is a local echo of something that is
   * gone.
   */
  gone: boolean
  /** Already contained in the branch that is checked out. */
  merged: boolean
  /** The branch that is checked out. Never offered as stale — git will not delete it either. */
  current: boolean
}

/**
 * The fields, in the order they are parsed. `%00` because a branch name may contain almost
 * anything except a NUL — the same reason `LOG_FORMAT` separates with one.
 */
export const BRANCH_FORMAT = '%(refname:short)%00%(upstream:short)%00%(upstream:track)%00%(HEAD)'

/** What `%(upstream:track)` prints for a branch whose remote copy was deleted. */
const GONE = '[gone]'

export function parseBranches(refs: string | null, merged: string | null): readonly Branch[] {
  if (refs === null) {
    return []
  }

  const contained = new Set(
    (merged ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== ''),
  )

  return refs
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [name = '', upstream = '', track = '', head = ''] = line.split('\0')
      return {
        name,
        upstream: upstream === '' ? null : upstream,
        gone: track.includes(GONE),
        merged: contained.has(name),
        current: head.trim() === '*',
      }
    })
    .filter((branch) => branch.name !== '')
}

/**
 * The branches git would let go of.
 *
 * Merged, or following something the remote deleted — and never the one checked out. Offered and
 * never acted on by itself: what makes this safe is that `git branch -d` asks the same question
 * again and refuses if the answer changed, so a stale reading cannot cost anybody a commit.
 */
export function staleBranches(branches: readonly Branch[]): readonly Branch[] {
  return branches.filter((branch) => !branch.current && (branch.merged || branch.gone))
}
