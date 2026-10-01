/**
 * The repositories a repository carries: submodules.
 *
 * A **Beiboot** in the yard's vocabulary — a boat the ship carries rather than one lying
 * alongside. That distinction is the reason it is not called a `boat` here: a worktree is the same
 * repository checked out twice and sits *beside* her, while a submodule is a different repository
 * she takes with her.
 *
 * They were invisible until now, and worse than invisible: the survey stops descending at a
 * directory holding a `.git` **directory**, and a submodule's `.git` is a *file* pointing into
 * `../.git/modules/…`. So the search walked straight through one and measured whatever lay inside
 * as if it belonged to the parent. Measured across 92 repositories: 16 carry 131 of them.
 *
 * One command, `git submodule status`, and the leading character of each line is the whole
 * reading:
 *
 * ```
 *  9a78818… lib/bootstrap3 (heads/v3)   in sync
 * +5b2c04c… api (1.0.3-3-g5b2c04c)      checked out somewhere other than what is recorded
 * -2451664… inspector                   never initialised — the directory is empty
 * ```
 *
 * The last two are what make this worth measuring. A `-` is a repository that looks present in
 * `.gitmodules` and is not there at all; a `+` is one whose recorded commit and actual commit
 * disagree, which is how a submodule bump gets lost on the way to a commit.
 */

/** What state a carried repository is in. */
export type TenderState =
  /** Checked out at the commit the parent records. */
  | 'aboard'
  /** Checked out somewhere else — the parent records a different commit. */
  | 'adrift'
  /** Never initialised: the directory is there and empty. */
  | 'missing'

export interface Tender {
  /** Where it sits, relative to the parent. */
  path: string
  state: TenderState
  /** The commit the parent records, short. Kept because it is what a human compares. */
  at: string
  /**
   * Where it is fetched from, as `.gitmodules` writes it — or `null` where that file says nothing.
   *
   * Measured for a question `git submodule status` cannot answer: whether the carried repository
   * is *also one of ours*. A submodule pointing at a repository that lies somewhere else on this
   * machine is a hard tie between the two, and the harbour draws ships that are tied near each
   * other. Without the url there is only a relative path, which names nothing outside the parent.
   */
  url: string | null
}

/** The leading character git prints, and what each one means. */
const STATES: Record<string, TenderState> = {
  ' ': 'aboard',
  '+': 'adrift',
  '-': 'missing',
}

/** How much of a hash is worth carrying. Enough to compare two by eye, not the whole forty. */
const SHORT = 8

/**
 * The urls out of `.gitmodules`, by the submodule's path.
 *
 * `git config --get-regexp` prints `submodule.<name>.url <value>`, and the **name** is not always
 * the path: a submodule can be declared under any name. So the path is read from the matching
 * `submodule.<name>.path` line, and a name with a url and no path is dropped rather than guessed
 * at — keyed by path, because that is what `git submodule status` prints and what joins the two.
 */
export function parseModuleUrls(config: string | null): ReadonlyMap<string, string> {
  const urls = new Map<string, string>()
  if (config === null) {
    return urls
  }
  const paths = new Map<string, string>()
  const seen = new Map<string, string>()
  for (const line of config.split('\n')) {
    const match = /^submodule\.(?<name>.+)\.(?<key>url|path) (?<value>.+)$/u.exec(line.trim())
    const groups = match?.groups
    if (groups === undefined) {
      continue
    }
    const { name = '', key = '', value = '' } = groups
    ;(key === 'url' ? seen : paths).set(name, value)
  }
  for (const [name, url] of seen) {
    const path = paths.get(name)
    if (path !== undefined) {
      urls.set(path, url)
    }
  }
  return urls
}

/**
 * One line per submodule, as `git submodule status` prints them.
 *
 * A line whose leading character git does not use — `U` for a merge conflict inside the submodule
 * — is read as `adrift` rather than dropped: it is certainly not in sync, and a carried repository
 * that vanished from the reading because of an unexpected first byte would be the worse answer.
 */
export function parseSubmodules(
  output: string | null,
  /**
   * What `git config -f .gitmodules --get-regexp url` printed, if anything.
   *
   * A second reading and not a second source of truth: `git submodule status` says which
   * submodules the *tree* has, `.gitmodules` says where each is fetched from. A repository can
   * have one without the other — a submodule removed from the file but left in the index — so the
   * status leads and the url is attached where there is one.
   */
  config: string | null = null,
): readonly Tender[] {
  if (output === null) {
    return []
  }
  const urls = parseModuleUrls(config)

  return output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      const state = STATES[line.slice(0, 1)] ?? 'adrift'
      const [hash = '', path = ''] = line.slice(1).trim().split(/\s+/u)
      return path === ''
        ? []
        : [{ path, state, at: hash.slice(0, SHORT), url: urls.get(path) ?? null }]
    })
}

/** The ones that are not where the parent says they are — the whole reason this is measured. */
export function strayTenders(tenders: readonly Tender[]): readonly Tender[] {
  return tenders.filter((tender) => tender.state !== 'aboard')
}
