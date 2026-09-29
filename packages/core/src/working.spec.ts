import { describe, expect, it } from 'vitest'

import { countStash, hasOpenWork, NOTHING_OPEN, readWorking } from './working'

describe(readWorking, () => {
  it('has nothing open for a clean tree', () => {
    expect(readWorking('')).toStrictEqual(NOTHING_OPEN)
    expect(readWorking('   \n  ')).toStrictEqual(NOTHING_OPEN)
  })

  /**
   * A repository git could not answer for has nothing open. Claiming otherwise would put a mark
   * on a hull for a measurement that never happened — the same direction as everywhere else here.
   */
  it('has nothing open where nothing could be measured', () => {
    expect(readWorking(null)).toStrictEqual(NOTHING_OPEN)
  })

  it('tells the index apart from the tree', () => {
    const working = readWorking('M  gestaged.ts\n M ungestaged.ts\nMM beides.ts')

    expect(working.staged).toBe(2)
    expect(working.unstaged).toBe(2)
    expect(working.untracked).toBe(0)
  })

  it('counts what git has never been told about', () => {
    const working = readWorking('?? neu.ts\n?? auch-neu/')

    expect(working.untracked).toBe(2)
    expect(working.staged).toBe(0)
    expect(working.unstaged).toBe(0)
  })

  /**
   * The one state that is stuck rather than in progress, and the reason it is counted apart:
   * everything else here is work happening, this is work that stopped.
   */
  it('counts every conflict pair git emits', () => {
    const porcelain = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']
      .map((code) => `${code} datei.ts`)
      .join('\n')

    expect(readWorking(porcelain).conflicted).toBe(7)
  })

  /** A stuck file is one stuck file, not one staged plus one unstaged plus one conflict. */
  it('counts a conflicted path once and nowhere else', () => {
    const working = readWorking('UU streit.ts')

    expect(working).toStrictEqual({ staged: 0, unstaged: 0, untracked: 0, conflicted: 1 })
  })

  it('reads a rename as staged, the way git reports it', () => {
    const working = readWorking('R  alt.ts -> neu.ts')

    expect(working.staged).toBe(1)
    expect(working.unstaged).toBe(0)
  })

  it('skips anything that is not a status line', () => {
    expect(readWorking('M\n\nxy')).toStrictEqual(NOTHING_OPEN)
  })
})

describe(hasOpenWork, () => {
  it('is the old dirty bit, derived instead of measured twice', () => {
    expect(hasOpenWork(NOTHING_OPEN)).toBe(false)
    expect(hasOpenWork(readWorking('?? nur-untracked.ts'))).toBe(true)
    expect(hasOpenWork(readWorking('UU streit.ts'))).toBe(true)
  })
})

describe(countStash, () => {
  it('counts the entries and nothing else', () => {
    const list = ['stash@{0}: WIP on master: 1a2b3c etwas', 'stash@{1}: On feature: gerettet'].join(
      '\n',
    )

    expect(countStash(list)).toBe(2)
  })

  it('is zero for an empty stash and for one it could not read', () => {
    expect(countStash('')).toBe(0)
    expect(countStash(null)).toBe(0)
  })
})
