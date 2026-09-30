/**
 * When two directories are one project.
 *
 * Two ways of being the same repository twice, and they need different answers:
 *
 * - the same directory reached through a **symbolic link**. Answered in `findAcrossRoots`, before
 *   anything is measured, because the two are byte-for-byte the same tree and measuring both would
 *   be running `git` twice for one answer.
 * - two **separate checkouts of the same remote**. Answered in `foldAliases`, after measuring,
 *   because the only thing that says they belong together is what each of them reports as
 *   `origin` — and that is a measurement. Measured on this machine: `gradido` beside
 *   `gradido_local`, `utopia-map` beside `utopia-map-old`. Four ships, two projects.
 *
 * This file holds the two rules that need no `Ship` to state, which is also why it can sit under
 * `ship.ts` without a cycle: what makes two remote URLs the same remote, and which of several
 * paths is the one that gets drawn.
 */

/**
 * A remote URL reduced to what identifies the repository.
 *
 * `git@github.com:org/repo.git` and `https://github.com/org/repo` are one remote written two ways,
 * and a string comparison says they are two. Scheme, credentials, port and the `.git` suffix all
 * come off; what is left is host and path, lowercased — forge paths are case-insensitive in
 * practice, and two clones differing only in case are not two projects.
 *
 * A remote this cannot parse — a bare filesystem path, an unusual transport — keeps its own text
 * as the key rather than being dropped. Two checkouts of `/srv/git/thing.git` are still two
 * checkouts of one thing, and the safe direction here is to compare too little, never too much.
 */
export function remoteKey(url: string): string | null {
  const trimmed = url
    .trim()
    .replace(/\/+$/u, '')
    .replace(/\.git$/u, '')
  if (trimmed === '') {
    return null
  }

  /*
   * `URL` and not a pattern of our own. A regular expression that reads scheme, optional
   * credentials, host and optional port backtracks — eslint's `detect-unsafe-regex` said so, and
   * it was right: this string comes out of a repository's config and is not ours. `URL` is a
   * language global like `RegExp`, so using it is not the environment access the architecture
   * contract forbids, and it drops the credentials for free.
   */
  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed)
      return `${parsed.hostname}/${parsed.pathname.replace(/^\/+/u, '')}`.toLowerCase()
    } catch (error) {
      // The one failure `URL` has, and the only one worth swallowing: this string came out of a
      // repository's config and is not ours. Anything else is a fault here and goes on up.
      if (!(error instanceof TypeError)) {
        throw error
      }
      return trimmed.toLowerCase()
    }
  }

  // The scp-like form git uses for ssh: `[user@]host:path`. Split by hand at the first colon,
  // which only separates when nothing before it is a path — otherwise a Windows drive or a
  // scheme would read as a host.
  const colon = trimmed.indexOf(':')
  const before = colon > 0 ? trimmed.slice(0, colon) : ''
  if (before !== '' && !before.includes('/')) {
    const host = before.slice(before.lastIndexOf('@') + 1)
    const path = trimmed.slice(colon + 1).replace(/^\/+/u, '')
    if (host !== '' && path !== '') {
      return `${host}/${path}`.toLowerCase()
    }
  }

  return trimmed.toLowerCase()
}

/**
 * Which of several checkouts is the one drawn.
 *
 * The shortest path wins, alphabetical on a tie. Not a guess dressed up as a rule: a second
 * checkout is made by suffixing, always — measured, `gradido_local` and `utopia-map-old` — so the
 * original is the shorter name, and where it is not, the choice is at least the same one every
 * time. A remembered "this is the real one" would be exactly the kept status field the
 * architecture contract forbids.
 */
export function leaderPath(paths: readonly string[]): string | null {
  return [...paths].sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? null
}
