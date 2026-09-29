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

/**
 * Matched as a substring, because both spellings occur: `git@github.com:org/repo.git` and
 * `https://github.com/org/repo`.
 *
 * How a self-hosted Gitea that is not `git.it4c.dev` gets in here is a measurement nobody takes
 * yet — the decision is a probe against `/api/v1/version` whose answer the inventory notes, so
 * the survey stays free of the network. Until then a host that is not in this table is
 * `unknown`, which is honest rather than wrong.
 */
const FORGES: readonly { host: string; forge: Exclude<Forge, 'unknown'> }[] = [
  { host: 'github.com', forge: 'github' },
  { host: 'git.it4c.dev', forge: 'gitea' },
]

/** One match, read two ways — the host and the kind must never disagree about a remote. */
function entryOf(remote: string | null): (typeof FORGES)[number] | null {
  if (remote === null) {
    return null
  }
  return FORGES.find((entry) => remote.includes(entry.host)) ?? null
}

/** The host this remote is on, or `null` for one Werft has nothing to say about. */
export function forgeHost(remote: string | null): string | null {
  return entryOf(remote)?.host ?? null
}

/** Which forge that host runs. */
export function forgeOf(remote: string | null): Forge {
  return entryOf(remote)?.forge ?? 'unknown'
}
