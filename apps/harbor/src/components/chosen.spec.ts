import { describe, expect, it } from 'vitest'

import { chosenKey, isForge, isMark, isPier, isQuest, PIER } from './chosen'

describe(chosenKey, () => {
  /**
   * Templates compare badly against objects: `chosen === x` on a fresh object is never true, and a
   * component that re-derived the comparison would be a second opinion about what "the same
   * choice" means.
   */
  it('spells each kind of choice exactly one way', () => {
    expect(chosenKey({ kind: 'quest', id: 'lint' })).toBe('quest:lint')
    expect(chosenKey({ kind: 'mark', mark: 'stash' })).toBe('mark:stash')
    expect(chosenKey(PIER)).toBe('pier')
    expect(chosenKey(null)).toBe('')
  })
})

describe('telling the three apart', () => {
  it('answers for its own kind and no other', () => {
    expect(isQuest({ kind: 'quest', id: 'lint' }, 'lint')).toBe(true)
    expect(isQuest({ kind: 'quest', id: 'lint' }, 'e2e')).toBe(false)
    expect(isMark({ kind: 'mark', mark: 'stash' }, 'stash')).toBe(true)
    expect(isPier(PIER)).toBe(true)
  })

  /**
   * The gangway is not a thing on the pier, it is the sign that there are things on it — so it is
   * its own answer and never one of the marks waiting there.
   */
  it('does not read the planking as one of the things on it', () => {
    expect(isMark(PIER, 'stash')).toBe(false)
    expect(isQuest(PIER, 'lint')).toBe(false)
    expect(isPier({ kind: 'mark', mark: 'stash' })).toBe(false)
    expect(isPier(null)).toBe(false)
  })
})

describe(isForge, () => {
  /** A kind and not an id: twelve open issues are one heap, not twelve. */
  it('tells the two heaps apart', () => {
    expect(isForge({ kind: 'forge', open: 'issue' }, 'issue')).toBe(true)
    expect(isForge({ kind: 'forge', open: 'issue' }, 'pull')).toBe(false)
    expect(isForge(null, 'issue')).toBe(false)
    expect(isForge({ kind: 'pier' }, 'issue')).toBe(false)
  })

  it('has its own spelling as a key', () => {
    expect(chosenKey({ kind: 'forge', open: 'pull' })).toBe('forge:pull')
  })
})
