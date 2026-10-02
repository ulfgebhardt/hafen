/**
 * What this machine can do, asked once and said in one place.
 *
 * The harbour already behaves correctly without any of these — a quest that cannot be answered is
 * `nicht messbar`, a tool that is not installed is not drawn. What it did not do is **say so**:
 * ninety-two repositories measured as nothing looks exactly like ninety-two repositories that are
 * nothing, and the reader has no way to tell which.
 *
 * One hard requirement and one soft one, and the difference is the whole module:
 *
 * - **`git`** is the tool. Without it the survey has nothing to read and the honest answer is a
 *   sentence, not an empty harbour.
 * - **`gh`** and **`curl`** are for the forge, and their absence is already a *measurement*: the
 *   quests that can only be answered there stay `nicht messbar`, which is the fifth verdict doing
 *   its job. Nothing is broken; one reading is simply not available.
 *
 * `claude` is not here at all. The `AgentPort` came over from Werft with the rest of the
 * interface and the harbour has never called it.
 */

/** What was found. `null` for a question nobody has asked yet. */
export interface Bordmittel {
  git: boolean
  gh: boolean
  curl: boolean
}

/** Nothing asked yet — which is not the same as nothing found. */
export const UNASKED: Bordmittel | null = null

/**
 * Whether the harbour can measure at all.
 *
 * The one blocking answer. Everything else here changes what a reading *says*, not whether there
 * is one.
 */
export function canSurvey(found: Bordmittel | null): boolean {
  return found === null || found.git
}

/** Whether any forge can be asked. Gitea is read with `curl`, GitHub with `gh`. */
export function canAskForge(found: Bordmittel | null): boolean {
  return found === null || found.gh || found.curl
}

/**
 * What to say about the forge, or nothing where there is nothing to say.
 *
 * Said once, up here, rather than ninety-two times as a verdict nobody connects to a missing
 * program. The verdicts stay exactly as they are — this only names the cause.
 */
export function forgeNote(found: Bordmittel | null): string | null {
  if (found === null || (found.gh && found.curl)) {
    return null
  }
  if (!found.gh && !found.curl) {
    return 'Weder gh noch curl ist da — Forge-Forderungen bleiben nicht messbar.'
  }
  return found.gh
    ? 'curl fehlt — Gitea-Repos bleiben ungefragt.'
    : 'gh fehlt — GitHub-Repos bleiben ungefragt.'
}
