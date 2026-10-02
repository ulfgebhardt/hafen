import { describe, expect, it } from 'vitest'

import { canAskForge, canSurvey, forgeNote } from './bordmittel'

const found = (over: Partial<{ git: boolean; gh: boolean; curl: boolean }> = {}) => ({
  git: true,
  gh: true,
  curl: true,
  ...over,
})

describe(canSurvey, () => {
  /** The one blocking answer: without git the survey has nothing to read. */
  it('needs git and nothing else', () => {
    expect(canSurvey(found())).toBe(true)
    expect(canSurvey(found({ gh: false, curl: false }))).toBe(true)
    expect(canSurvey(found({ git: false }))).toBe(false)
  })

  /**
   * A question nobody has asked yet is not a failed one. The harbour draws while the answer is on
   * its way — a window that held its picture back for a capability check would have the priorities
   * backwards.
   */
  it('does not call an unasked machine incapable', () => {
    expect(canSurvey(null)).toBe(true)
    expect(canAskForge(null)).toBe(true)
  })
})

describe(canAskForge, () => {
  /** Two forges, two tools: GitHub is read with `gh`, Gitea with `curl`. */
  it('needs either of the two', () => {
    expect(canAskForge(found({ gh: false }))).toBe(true)
    expect(canAskForge(found({ curl: false }))).toBe(true)
    expect(canAskForge(found({ gh: false, curl: false }))).toBe(false)
  })
})

describe(forgeNote, () => {
  /**
   * Said once rather than ninety-two times as a verdict nobody connects to a missing program. The
   * verdicts stay exactly as they are — `nicht messbar` is already right, it just never said why.
   */
  it('names which half of the forge cannot be asked', () => {
    expect(forgeNote(found({ gh: false }))).toContain('gh fehlt')
    expect(forgeNote(found({ curl: false }))).toContain('curl fehlt')
    expect(forgeNote(found({ gh: false, curl: false }))).toContain('Weder gh noch curl')
  })

  /** Nothing to say is nothing said: a bar that reports what is fine is a bar nobody reads. */
  it('says nothing where both are there, and nothing before it was asked', () => {
    expect(forgeNote(found())).toBeNull()
    expect(forgeNote(null)).toBeNull()
  })
})
