import { describe, expect, it } from 'vitest'

import { TOOL_LABEL, TOOL_MEANING, TOOLS, writes } from './tools'

describe('the tools this window may start', () => {
  /**
   * One of the five changes a repository, and that one is named rather than inferred: a caller
   * that wanted to mark the writing button would otherwise re-decide which it is, and two opinions
   * about that is how a button that prunes ends up looking like a button that opens an editor.
   */
  it('names the one tool that changes something', () => {
    expect(TOOLS.filter(writes)).toStrictEqual(['prune'])
  })

  /** The words are the Rust side's names; a gap here would be a button with no sentence on it. */
  it('has a label and a sentence for every name', () => {
    for (const name of TOOLS) {
      expect(TOOL_LABEL[name]).not.toBe('')
      expect(TOOL_MEANING[name]).not.toBe('')
    }
  })

  /** The one that writes says which command it runs — the rest hand over to a human. */
  it('spells out the command of the tool that writes', () => {
    expect(TOOL_MEANING['prune']).toContain('git remote prune origin')
  })
})
