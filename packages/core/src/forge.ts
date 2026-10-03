/**
 * Which forge a remote URL lies on.
 *
 * One table, because three questions hang off the same two hosts: what kind of forge a ship has
 * (`ship.ts`), which host an issue address is built from (`launch.ts`), and which API to call
 * (`crates/forge`). Until 29.09.2026 the first two asked it twice — `forgeOf` matched hostnames
 * to name a `Forge`, `FORGE_HOSTS` matched the same hostnames to build a URL — and the comment
 * on the second one claimed "one list here, too" while there were two. A slug one of them
 * recognises and the other does not means Werft offers a launch for a ship whose issues it
 * cannot read.
 *
 * `unknown` is the answer for every other host, and it is the safe direction: a remote Werft
 * cannot name is shown and never asked, while a guess would send a request to a stranger.
 */

export type Forge = 'github' | 'gitea' | 'unknown'

/** A host this machine knows a forge on, and which kind runs there. */
export interface ForgeHost {
  host: string
  forge: Exclude<Forge, 'unknown'>
}

/**
 * The one forge every machine has, and the only one this tool names.
 *
 * Matched as a substring, because both spellings occur: `git@github.com:org/repo.git` and
 * `https://github.com/org/repo`.
 *
 * A self-hosted Gitea is a fact about *one* machine, so it lives in that machine's register
 * (`## Forges`) and not here. Until 03.10.2026 a second host stood in this table — one person's
 * Gitea, shipped to everybody. Whether an unknown host runs Gitea is a question for
 * `/api/v1/version`, which the survey does not ask: it stays free of the network, and a host
 * nobody named is `unknown`, which is honest rather than wrong.
 */
export const BUILTIN_FORGES: readonly ForgeHost[] = [{ host: 'github.com', forge: 'github' }]

/** One match, read two ways — the host and the kind must never disagree about a remote. */
function entryOf(remote: string | null, known: readonly ForgeHost[]): ForgeHost | null {
  if (remote === null) {
    return null
  }
  return known.find((entry) => remote.includes(entry.host)) ?? null
}

/** The host this remote is on, or `null` for one the harbor has nothing to say about. */
export function forgeHost(
  remote: string | null,
  known: readonly ForgeHost[] = BUILTIN_FORGES,
): string | null {
  return entryOf(remote, known)?.host ?? null
}

/** Which forge that host runs. */
export function forgeOf(
  remote: string | null,
  known: readonly ForgeHost[] = BUILTIN_FORGES,
): Forge {
  return entryOf(remote, known)?.forge ?? 'unknown'
}
