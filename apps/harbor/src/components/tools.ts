/**
 * What the window may start, and what each one is called.
 *
 * The names are `lib.rs`'s, copied on purpose rather than derived: the Rust side checks them
 * against its own closed list, so a name that drifted here would be refused there instead of
 * quietly doing something else. One vocabulary, two guards.
 *
 * Here and not beside the bridge, because a component may not reach up a directory for a word —
 * and this *is* only words. The asking is `availableTools`, which does IPC and belongs there.
 */

export const TOOLS = ['lazygit', 'agent', 'shell', 'editor', 'prune'] as const

export type ToolName = (typeof TOOLS)[number]

export const TOOL_LABEL: Record<ToolName, string> = {
  lazygit: 'lazygit',
  agent: 'Agent',
  shell: 'Terminal',
  editor: 'Codium',
  prune: 'Remote aufräumen',
}

/**
 * What each one actually does, in a sentence.
 *
 * Four hand over — they open something a human then decides in. `prune` writes, and the label says
 * which command, because it is the one button here that changes a repository.
 */
export const TOOL_MEANING: Record<ToolName, string> = {
  lazygit: 'lazygit in diesem Verzeichnis öffnen',
  agent: 'claude in diesem Verzeichnis starten',
  shell: 'ein Terminal in diesem Verzeichnis öffnen',
  editor: 'Codium in diesem Verzeichnis öffnen',
  prune: 'git remote prune origin — entfernt Refs zu Branches, die der Remote nicht mehr hat',
}

/** The one tool here that changes anything, named so a caller can treat it differently. */
export function writes(name: ToolName): boolean {
  return name === 'prune'
}
