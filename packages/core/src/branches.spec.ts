import { describe, expect, it } from 'vitest'

import { defaultBranchOf, parseBranches, staleBranches } from './branches'

/** What `for-each-ref` prints for the four cases that matter, in `BRANCH_FORMAT`'s order. */
const REFS = [
  'main\0origin/main\0\0*',
  'feat/gone\0origin/feat/gone\0[gone]\0',
  'feat/merged\0origin/feat/merged\0\0',
  'feat/local\0\0\0',
].join('\n')

describe(parseBranches, () => {
  it('reads name, upstream, gone and current off one line', () => {
    const [main, gone, merged, local] = parseBranches(REFS, 'feat/merged\nmain\n')

    expect(main).toStrictEqual({
      name: 'main',
      upstream: 'origin/main',
      gone: false,
      merged: true,
      current: true,
    })
    expect(gone?.gone).toBe(true)
    expect(merged?.merged).toBe(true)
    // A branch that follows nothing follows nothing — not an empty string.
    expect(local?.upstream).toBeNull()
    expect(local?.merged).toBe(false)
  })

  /** A repository git could not answer about is not a repository with no branches. */
  it('says nothing where git said nothing', () => {
    expect(parseBranches(null, null)).toStrictEqual([])
  })

  /** `--merged` may fail on its own — an empty repository has no HEAD to compare against. */
  it('still reads the refs when the containment question went unanswered', () => {
    const branches = parseBranches(REFS, null)

    expect(branches).toHaveLength(4)
    expect(branches.every((branch) => !branch.merged)).toBe(true)
  })

  it('ignores blank lines rather than inventing a nameless branch', () => {
    expect(parseBranches(`\n${REFS}\n\n`, '')).toHaveLength(4)
  })
})

describe(staleBranches, () => {
  /**
   * "git would let this go", not "delete this". `git branch -d` asks the same question again and
   * refuses if the answer changed, which is why nothing here ever reaches for `-D`.
   */
  it('offers what is merged or whose remote is gone', () => {
    const stale = staleBranches(parseBranches(REFS, 'feat/merged\nmain\n'))

    expect(stale.map((branch) => branch.name)).toStrictEqual(['feat/gone', 'feat/merged'])
  })

  /** The checked-out branch is never offered: git will not delete it either. */
  it('never offers the branch that is checked out', () => {
    const stale = staleBranches(parseBranches(REFS, 'main\n'))

    expect(stale.map((branch) => branch.name)).not.toContain('main')
  })

  it('offers nothing in a repository with one branch and no upstream', () => {
    expect(staleBranches(parseBranches('main\0\0\0*', ''))).toStrictEqual([])
  })
})

describe(defaultBranchOf, () => {
  const named = (...names: readonly string[]) =>
    names.map((name) => ({ name, upstream: null, gone: false, merged: false, current: false }))

  /** The remote's own answer beats a guess, and 80 of 92 repositories here carry it. */
  it('takes what the remote said, without its remote name', () => {
    expect(defaultBranchOf('origin/main', named('main', 'feat'))).toBe('main')
    expect(defaultBranchOf('origin/release/v3', named())).toBe('release/v3')
  })

  /**
   * `git clone` writes that ref and `git remote add` does not, so the gap is repositories that
   * were never cloned — and every one of the 12 here has a local `master`.
   */
  it('falls back to a usual name that actually exists here', () => {
    expect(defaultBranchOf(null, named('feat', 'master'))).toBe('master')
    expect(defaultBranchOf('', named('main', 'master'))).toBe('main')
  })

  /**
   * `null` and not `main`: a repository whose default cannot be named is one where "already
   * merged" cannot be asked, and nothing there is offered for deletion on those grounds.
   */
  it('says nothing rather than guessing a name that is not there', () => {
    expect(defaultBranchOf(null, named('feat/one', 'feat/two'))).toBeNull()
    expect(defaultBranchOf(null, [])).toBeNull()
  })
})

describe('merged against the branch that leads', () => {
  /**
   * It asked `--merged HEAD` at first: standing on a feature branch, everything merged into *that*
   * came back as deletable, and a branch that is not in the default branch cannot be deleted.
   * Latent on this machine — all 92 repositories happen to have their default checked out.
   */
  it('offers nothing as merged where the default branch could not be named', () => {
    const branches = parseBranches(REFS, null)

    expect(branches.every((branch) => !branch.merged)).toBe(true)
    expect(staleBranches(branches).map((one) => one.name)).toStrictEqual(['feat/gone'])
  })
})

describe('never the default branch', () => {
  /**
   * A branch is trivially contained in itself, so the moment containment was asked against the
   * default rather than `HEAD`, `master` started appearing in its own list of removable branches
   * on every repository whose checkout was somewhere else — 20 of 92 here.
   */
  it('leaves the default branch out, even standing somewhere else', () => {
    const branches = parseBranches(
      ['master\0origin/master\0\0', 'feat/one\0\0\0*', 'feat/old\0\0[gone]\0'].join('\n'),
      'master\nfeat/old\n',
    )

    expect(staleBranches(branches, 'master').map((one) => one.name)).toStrictEqual(['feat/old'])
    // Without being told which one leads, it cannot know — and then it does offer it.
    expect(staleBranches(branches).map((one) => one.name)).toStrictEqual(['master', 'feat/old'])
  })
})
