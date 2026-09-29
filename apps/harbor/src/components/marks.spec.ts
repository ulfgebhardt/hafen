import { describe, expect, it } from 'vitest'

import {
  drawn,
  isCapped,
  isShipshape,
  MARK_LABEL,
  MARK_MEANING,
  marksOf,
  MAX_PER_KIND,
} from './marks'
import { ship } from './testing'

import type { MarkKind } from './marks'

describe(marksOf, () => {
  it('carries nothing for a clean repository on its branch', () => {
    expect(marksOf(ship())).toStrictEqual([])
  })

  it('reads the working tree in the kinds git tells apart', () => {
    const marks = marksOf(
      ship({ working: { staged: 2, unstaged: 3, untracked: 1, conflicted: 0 } }),
    )

    expect(marks).toStrictEqual([
      { kind: 'staged', count: 2 },
      { kind: 'unstaged', count: 3 },
      { kind: 'untracked', count: 1 },
    ])
  })

  /**
   * A conflict is not heavier cargo, it is stopped work — and it is drawn first because it is
   * the one thing on the ship a human has to answer before anything else moves.
   */
  it('puts damage before everything else', () => {
    const marks = marksOf(
      ship({ working: { staged: 5, unstaged: 0, untracked: 0, conflicted: 1 }, stash: 2 }),
    )

    expect(marks[0]?.kind).toBe('damage')
  })

  it('reads unpushed and unmerged commits as two different marks', () => {
    const marks = marksOf(ship({ ahead: 3, behind: 2 }))

    expect(marks).toStrictEqual([
      { kind: 'pennant', count: 3 },
      { kind: 'drag', count: 2 },
    ])
  })

  /** No upstream is not "level with it": `null` means there was nothing to compare against. */
  it('carries no pennant where there is no upstream to be ahead of', () => {
    expect(marksOf(ship({ ahead: null, behind: null }))).toStrictEqual([])
  })

  it('carries the stash, which no other measurement here would show', () => {
    expect(marksOf(ship({ stash: 4 }))).toStrictEqual([{ kind: 'stash', count: 4 }])
  })

  it('carries a boat per further worktree', () => {
    expect(marksOf(ship({ docks: ['/d/one', '/d/two'] }))).toStrictEqual([
      { kind: 'boat', count: 2 },
    ])
  })

  /** Absent rather than drawn empty — the same rule the deck follows. */
  it('leaves out every kind that is zero', () => {
    const marks = marksOf(
      ship({ working: { staged: 1, unstaged: 0, untracked: 0, conflicted: 0 } }),
    )

    expect(marks).toHaveLength(1)
  })
})

describe(drawn, () => {
  it('draws the real count while it fits', () => {
    expect(drawn({ kind: 'staged', count: 3 })).toBe(3)
  })

  /** A drawing limit, never a measurement: `Ship` keeps the real number and the sheet prints it. */
  it('stops at the cap without changing what was measured', () => {
    const mark = { kind: 'untracked', count: 231 } as const

    expect(drawn(mark)).toBe(MAX_PER_KIND)
    expect(isCapped(mark)).toBe(true)
    expect(mark.count).toBe(231)
  })

  it('is not capped at exactly the cap', () => {
    expect(isCapped({ kind: 'staged', count: MAX_PER_KIND })).toBe(false)
  })
})

describe(isShipshape, () => {
  it('is true for a clean tree on its branch', () => {
    expect(isShipshape(ship())).toBe(true)
  })

  /**
   * A worktree is not untidiness. It is how this fleet works, and a harbour that flagged it
   * would flag most of its own ships for being in use.
   */
  it('stays true with worktrees open', () => {
    expect(isShipshape(ship({ docks: ['/d/one'] }))).toBe(true)
  })

  it.each([
    [
      'ungesicherte Arbeit',
      ship({ working: { staged: 0, unstaged: 1, untracked: 0, conflicted: 0 } }),
    ],
    ['ein Konflikt', ship({ working: { staged: 0, unstaged: 0, untracked: 0, conflicted: 1 } })],
    ['nicht gepusht', ship({ ahead: 2 })],
    ['ein Stash', ship({ stash: 1 })],
  ])('is false for %s', (_reason, subject) => {
    expect(isShipshape(subject)).toBe(false)
  })
})

describe('the vocabulary', () => {
  /** A symbol nobody can name is decoration, and this scene has exactly one of those. */
  it('names and explains every kind a ship can carry', () => {
    const kinds: readonly MarkKind[] = [
      'staged',
      'unstaged',
      'untracked',
      'damage',
      'pennant',
      'drag',
      'stash',
      'boat',
    ]

    // Length rather than truthiness: an empty string is falsy *and* a label that exists, and
    // the thing worth asserting is that somebody wrote words here.
    for (const kind of kinds) {
      expect(MARK_LABEL[kind].length).toBeGreaterThan(0)
      expect(MARK_MEANING[kind].length).toBeGreaterThan(10)
    }
  })
})
