/**
 * What was done in a repository, counted from `git log`.
 *
 * Measurement only. What any of it is *worth* lives in `points.ts`, and the split is the same one
 * the quests make: a count is a fact, a weight is a decision. Keeping the raw signals in the
 * snapshot means a different weighting can be tried without measuring anything again — and that
 * matters, because the first set of weights is always wrong.
 *
 * Own work is separated from the repository's total. Eighteen thousand points from a project with
 * forty contributors are not a personal score, and a harbour that conflated the two would flatter
 * whoever happens to stand near the biggest repository.
 */

/**
 * Conventional-commit kinds, as they actually occur on this fleet.
 *
 * A closed list: an unknown prefix counts as unscored rather than being invented into a category.
 * `docs`, `test`, `build`, `ci` and `style` are here because they appear and mean something
 * different from `chore`, even where the weighting later treats them alike.
 */
export const COMMIT_KINDS = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'test',
  'build',
  'ci',
  'style',
  'chore',
] as const

export type CommitKind = (typeof COMMIT_KINDS)[number]

/** How far into a subject a conventional prefix can reasonably start. `refactor(some-scope)!:`. */
const MAX_PREFIX = 80

export interface Work {
  commits: number
  /** Commits per conventional kind. Kinds that do not occur are absent, not zero. */
  byKind: Readonly<Partial<Record<CommitKind, number>>>
  /**
   * Commits whose subject carries no conventional prefix.
   *
   * Counted and named, because a zero beside 1 899 commits is a missing convention and not
   * idleness — reading it as "nothing was done" is the one way these numbers could lie outright.
   */
  unscored: number
  /**
   * Distinct pull requests that landed.
   *
   * Counted as a *set of numbers* and not as commits, because both merge styles occur on this
   * fleet and often in the same repository: a merge commit says `Merge pull request #123`, a
   * squash says `… (#123)` at the end of the subject. Counting merge commits alone reported 0
   * for kalender, which has 348 squashed pull requests — a flat falsehood. The set also makes
   * double counting impossible where both forms name the same number.
   */
  pulls: number
  /** Merge commits, whether or not they name a pull request. */
  merges: number
  /** How many different people committed. `1` on a repository that is one person's. */
  authors: number
}

export const NO_WORK: Work = {
  commits: 0,
  byKind: {},
  unscored: 0,
  pulls: 0,
  merges: 0,
  authors: 0,
}

/** One commit, in the four fields the counting needs. */
export interface Commit {
  email: string
  subject: string
  /** How many parents — two or more is a merge. */
  parents: number
}

/** The separator `git log` is asked for: NUL, because a subject may contain anything else. */
export const LOG_FORMAT = '%ae%x00%s%x00%P'

/**
 * `git log --format=LOG_FORMAT` as commits.
 *
 * Tolerant on purpose: a line that does not split into three is skipped rather than throwing. The
 * survey runs over ninety repositories it does not control, and one odd commit message must not
 * take the count of everything else with it.
 */
export function parseLog(raw: string | null): readonly Commit[] {
  if (raw === null || raw.trim() === '') {
    return []
  }

  const commits: Commit[] = []
  for (const line of raw.split('\n')) {
    const parts = line.split('\0')
    if (parts.length < 3) {
      continue
    }
    const [email = '', subject = '', parents = ''] = parts
    commits.push({
      email: email.toLowerCase(),
      subject,
      // `%P` is space-separated hashes; an empty string is the root commit.
      parents: parents.trim() === '' ? 0 : parents.trim().split(/\s+/u).length,
    })
  }
  return commits
}

/**
 * `feat(app)!: …` → `feat`. `null` where the subject carries no conventional prefix.
 *
 * Both repeats are bounded. These subjects come out of ninety repositories nobody here controls,
 * and an unbounded `[a-z]+` followed by an optional group is the shape a linter flags for
 * backtracking — the longest kind in the vocabulary is six characters, so the limit costs
 * nothing and removes the question.
 */
export function kindOf(subject: string): CommitKind | null {
  // Split rather than one pattern with an optional group after a repeat: that shape is what a
  // linter flags for backtracking, and these subjects come out of repositories nobody controls.
  const head = subject.slice(0, MAX_PREFIX)
  const colon = head.indexOf(':')
  if (colon <= 0) {
    return null
  }
  const kind = head.slice(0, colon).replace(/\(.*$/u, '').replace(/!$/u, '')
  return (COMMIT_KINDS as readonly string[]).includes(kind) ? (kind as CommitKind) : null
}

/**
 * The pull request a commit landed through, if it says so.
 *
 * Both forms, because both occur: GitHub's merge commit (`Merge pull request #123 from …`) and
 * its squash (`subject (#123)`). A number that appears in both is the same pull request, which is
 * why the caller collects these into a set.
 */
export function pullOf(subject: string): number | null {
  const merged = /^Merge pull request #(?<number>\d+)/u.exec(subject)
  const squashed = /\(#(?<number>\d+)\)$/u.exec(subject.trimEnd())
  const found = merged?.groups?.['number'] ?? squashed?.groups?.['number']
  return found === undefined ? null : Number.parseInt(found, 10)
}

/**
 * Bots ship a great deal and mean nothing here.
 *
 * Named by address rather than by a list of known bots: `dependabot[bot]` and
 * `renovate[bot]` are two of many, and the shape of the address is the stable part.
 */
export function isBot(email: string): boolean {
  return email.includes('[bot]') || email.startsWith('bot@') || email.includes('+bot@')
}

/** Everything the log says, counted over whichever commits the caller kept. */
export function countWork(commits: readonly Commit[]): Work {
  const byKind: Partial<Record<CommitKind, number>> = {}
  const pulls = new Set<number>()
  const authors = new Set<string>()
  let unscored = 0
  let merges = 0

  for (const commit of commits) {
    authors.add(commit.email)
    if (commit.parents > 1) {
      merges += 1
    }

    const pull = pullOf(commit.subject)
    if (pull !== null) {
      pulls.add(pull)
    }

    const kind = kindOf(commit.subject)
    if (kind === null) {
      unscored += 1
    } else {
      byKind[kind] = (byKind[kind] ?? 0) + 1
    }
  }

  return {
    commits: commits.length,
    byKind,
    unscored,
    pulls: pulls.size,
    merges,
    authors: authors.size,
  }
}

export interface Ledger {
  /** Everything in the repository, bots excluded. */
  total: Work
  /** The part of it that belongs to the addresses the caller named. */
  own: Work
}

export const NO_LEDGER: Ledger = { total: NO_WORK, own: NO_WORK }

/**
 * The repository's work and the reader's share of it, side by side.
 *
 * Bots are dropped from both: a repository where renovate made four hundred commits did not do
 * four hundred things, and leaving them in would make the busiest number the least meaningful.
 */
export function readLedger(raw: string | null, ownEmails: readonly string[]): Ledger {
  const mine = new Set(ownEmails.map((email) => email.trim().toLowerCase()).filter(Boolean))
  const commits = parseLog(raw).filter((commit) => !isBot(commit.email))

  return {
    total: countWork(commits),
    own: countWork(commits.filter((commit) => mine.has(commit.email))),
  }
}
