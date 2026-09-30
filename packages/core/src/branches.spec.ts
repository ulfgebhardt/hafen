import { describe, expect, it } from 'vitest'

import { parseBranches, staleBranches } from './branches'

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
