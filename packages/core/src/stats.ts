/**
 * What a forge says about a repository — and the one place in this tool that goes to the network.
 *
 * Kept apart from the survey on purpose, and that separation is the whole design. `hafen
 * schnappschuss` reads 92 repositories off the disk in about six seconds and asks nobody
 * anything; folding an API call into it would make the measurement depend on a network, a login
 * and somebody else's rate limit, and a harbour that cannot draw because GitHub is slow is a
 * harbour that has stopped being a picture of this machine.
 *
 * So this is its own reading, with its own file and its own timestamp. The window shows both
 * times, because they really are two different ages.
 *
 * **Read-only, always.** Every call here asks a question. Nothing posts, patches or deletes, and
 * the tools are the ones a person already has logged in — `gh` for GitHub, `curl` for a Gitea
 * host. The survey's promise is unchanged: the harbour changes no repository, here or there.
 */

import { BUILTIN_FORGES, forgeOf } from './forge'

import type { ForgeHost } from './forge'
import type { Ports } from './ports'
import type { Ship } from './ship'

/** A repository as its forge names it — case preserved, because an API path is case-sensitive. */
export interface Slug {
  host: string
  owner: string
  repo: string
}

/**
 * The repository a remote URL points at.
 *
 * Deliberately not `remoteKey`, which lowercases so two spellings of one remote compare equal.
 * That is right for folding aliases and wrong here: `gh api repos/Leuchtturm-Verbund/…`
 * needs the name the forge actually uses.
 */
export function slugOf(url: string): Slug | null {
  const trimmed = url
    .trim()
    .replace(/\/+$/u, '')
    .replace(/\.git$/u, '')
  if (trimmed === '') {
    return null
  }

  const both = (host: string, path: string): Slug | null => {
    const parts = path.split('/').filter((part) => part !== '')
    const owner = parts.at(-2)
    const repo = parts.at(-1)
    return owner === undefined || repo === undefined ? null : { host, owner, repo }
  }

  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed)
      return both(parsed.hostname, parsed.pathname)
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error
      }
      return null
    }
  }

  // `[user@]host:owner/repo`, git's scp-like form.
  const colon = trimmed.indexOf(':')
  const before = colon > 0 ? trimmed.slice(0, colon) : ''
  if (before === '' || before.includes('/')) {
    return null
  }
  return both(before.slice(before.lastIndexOf('@') + 1), trimmed.slice(colon + 1))
}

export interface ForgeStats {
  slug: Slug
  stars: number
  watchers: number
  forks: number
  /**
   * Open issues **without** pull requests.
   *
   * GitHub's `open_issues_count` counts both in one number, and a repository with forty open pull
   * requests and no issues would report forty issues. The GraphQL query asks for the two apart,
   * which is the only reason it is used instead of the plain REST call.
   */
  issues: number
  pulls: number
  language: string | null
  /**
   * What guards the default branch, where the forge lets us see it.
   *
   * `null` for a forge that was not asked this (Gitea here), and `admin: false` where the answer
   * may be incomplete: **rulesets are public**, the classic branch protection rule is not. So an
   * empty answer from a repository we do not administer means "we may not look" and not "nothing
   * guards it" — the difference between `nicht messbar` and an invented gap.
   */
  guard: Guard | null
  /**
   * Where this repository came from, if the forge says it is a fork — `owner/name`, else `null`.
   *
   * The one fact the repository itself cannot hold. `lineage.ts` can see that a remote is of the
   * same line and counts how far apart they are, and that reading is identical for the upstream of
   * a fork and for a mirror somebody abandoned: `Kutter-…-Rebranding` is 75 commits ahead of
   * `leuchtturm/master`, and `stimme.example` is 7 ahead of its old gogs address. Which of them is the
   * origin is in the forge's own record and nowhere in git, so it arrives here with the forge
   * reading — with the forge's timestamp, and `null` where nobody was asked.
   *
   * Only GitHub answers it. Gitea has the field but is asked over REST here, and a fork it does
   * not report stays `null` rather than becoming "not a fork": unasked is not absent.
   */
  forkedFrom: string | null
}

/** What stands between a push and the default branch. */
export interface Guard {
  /** A pull request is required before anything lands. */
  pullRequest: boolean
  /** Checks have to pass before it does. */
  statusChecks: boolean
  /** Where it was read: a ruleset (public), the classic rule (admin only), or nothing found. */
  source: 'ruleset' | 'rule' | 'none'
  /** Whether we may see everything there is to see. */
  admin: boolean
}

/** A repository that could not be asked, and why — never a silently missing row. */
export interface Unread {
  slug: Slug
  reason: string
}

export interface ForgeReading {
  at: string
  stats: readonly ForgeStats[]
  unread: readonly Unread[]
}

/**
 * One call per repository, and it asks for everything at once.
 *
 * GraphQL rather than `gh api repos/…` because of `issues` and `pullRequests`: the REST field
 * mixes them, and a number that is sometimes the sum of two things is worse than no number.
 */
const QUERY = `query($owner:String!,$repo:String!){
  repository(owner:$owner,name:$repo){
    stargazerCount
    forkCount
    isFork
    parent{nameWithOwner}
    watchers{totalCount}
    primaryLanguage{name}
    issues(states:OPEN){totalCount}
    pullRequests(states:OPEN){totalCount}
    viewerPermission
    defaultBranchRef{
      name
      branchProtectionRule{requiresApprovingReviews requiresStatusChecks}
    }
    rulesets(first:10){nodes{enforcement target rules(first:30){nodes{type}}}}
  }
}`

interface GraphAnswer {
  data?: {
    repository?: {
      stargazerCount?: number
      forkCount?: number
      isFork?: boolean
      parent?: { nameWithOwner?: string } | null
      watchers?: { totalCount?: number }
      primaryLanguage?: { name?: string } | null
      issues?: { totalCount?: number }
      pullRequests?: { totalCount?: number }
      viewerPermission?: string | null
      defaultBranchRef?: {
        name?: string
        branchProtectionRule?: {
          requiresApprovingReviews?: boolean
          requiresStatusChecks?: boolean
        } | null
      } | null
      rulesets?: {
        nodes?: readonly ({
          enforcement?: string
          target?: string
          rules?: { nodes?: readonly { type?: string }[] }
        } | null)[]
      } | null
    } | null
  }
}

/**
 * What guards the branch, read from the two places GitHub keeps it.
 *
 * **Rulesets first, because they are what people use now and because they are public.** Measured
 * on this fleet: not one repository has a classic protection rule, two have an active ruleset with
 * `PULL_REQUEST` and `REQUIRED_STATUS_CHECKS`, and `vuejs/core` answers the same question to a
 * reader with no rights there at all. A quest that read only the classic rule would have called
 * every one of them unguarded — the same false gap the fixed config path produced one quest over.
 */
export function guardOf(repo: NonNullable<GraphAnswer['data']>['repository']): Guard | null {
  if (repo === undefined || repo === null) {
    return null
  }
  const admin = repo.viewerPermission === 'ADMIN'
  const rules = (repo.rulesets?.nodes ?? [])
    .filter((set) => set !== null && set.enforcement === 'ACTIVE' && set.target === 'BRANCH')
    .flatMap((set) => (set?.rules?.nodes ?? []).map((rule) => rule.type ?? ''))
  if (rules.length > 0) {
    return {
      pullRequest: rules.includes('PULL_REQUEST'),
      statusChecks: rules.includes('REQUIRED_STATUS_CHECKS'),
      source: 'ruleset',
      admin,
    }
  }

  const classic = repo.defaultBranchRef?.branchProtectionRule
  if (classic !== undefined && classic !== null) {
    return {
      pullRequest: classic.requiresApprovingReviews ?? false,
      statusChecks: classic.requiresStatusChecks ?? false,
      source: 'rule',
      admin,
    }
  }
  return { pullRequest: false, statusChecks: false, source: 'none', admin }
}

interface GiteaAnswer {
  stars_count?: number
  watchers_count?: number
  forks_count?: number
  open_issues_count?: number
  open_pr_counter?: number
  language?: string
}

function fromGraph(slug: Slug, raw: string): ForgeStats | null {
  let answer: GraphAnswer
  try {
    answer = JSON.parse(raw) as GraphAnswer
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error
    }
    return null
  }

  const repo = answer.data?.repository
  if (repo === undefined || repo === null) {
    return null
  }
  return {
    slug,
    stars: repo.stargazerCount ?? 0,
    forks: repo.forkCount ?? 0,
    watchers: repo.watchers?.totalCount ?? 0,
    issues: repo.issues?.totalCount ?? 0,
    pulls: repo.pullRequests?.totalCount ?? 0,
    language: repo.primaryLanguage?.name ?? null,
    guard: guardOf(repo),
    /*
     * Only when the forge says *both*: a `parent` without `isFork` would be the network of a
     * repository that was never forked, and a name without the flag is not the claim this makes.
     */
    forkedFrom: repo.isFork === true ? (repo.parent?.nameWithOwner ?? null) : null,
  }
}

function fromGitea(slug: Slug, raw: string): ForgeStats | null {
  let answer: GiteaAnswer
  try {
    answer = JSON.parse(raw) as GiteaAnswer
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error
    }
    return null
  }

  return {
    slug,
    stars: answer.stars_count ?? 0,
    watchers: answer.watchers_count ?? 0,
    forks: answer.forks_count ?? 0,
    /*
     * Gitea counts them apart already: `open_issues_count` is issues and `open_pr_counter` is
     * pull requests. One fewer thing to correct for than GitHub's REST.
     */
    issues: answer.open_issues_count ?? 0,
    pulls: answer.open_pr_counter ?? 0,
    language: answer.language ?? null,
    // Not asked of Gitea: it keeps branch protection somewhere else entirely, and an answer of
    // "nothing guards it" that was never asked for is the invented gap this whole field avoids.
    guard: null,
    // Gitea reports a fork, but over REST and not asked for here: unasked is not absent.
    forkedFrom: null,
  }
}

/** What each forge is asked with, and what to say when that tool is not installed. */
const TOOL: Record<'github' | 'gitea', string> = { github: 'gh', gitea: 'curl' }

/**
 * One repository's figures, or the reason there are none.
 *
 * A failure is reported per repository and never thrown: a token that expired, a repository that
 * was renamed, a host that is down — each of those is a fact about *that* row, and one of them
 * must not take the other ninety-one with it. The same rule `issues_for` follows.
 */
export async function readStats(
  ports: Ports,
  slug: Slug,
  token: string | null = null,
  known: readonly ForgeHost[] = BUILTIN_FORGES,
): Promise<ForgeStats | Unread> {
  const forge = forgeOf(`https://${slug.host}/`, known)
  if (forge === 'unknown') {
    return { slug, reason: `${slug.host} ist keine Forge, die der Hafen kennt` }
  }

  if ((await ports.proc.which(TOOL[forge])) === null) {
    return { slug, reason: `${TOOL[forge]} ist nicht installiert` }
  }

  if (forge === 'github') {
    const answer = await ports.proc.run('gh', [
      'api',
      'graphql',
      '-f',
      `query=${QUERY}`,
      '-F',
      `owner=${slug.owner}`,
      '-F',
      `repo=${slug.repo}`,
    ])
    if (answer.code !== 0) {
      return { slug, reason: answer.stderr.trim().split('\n')[0] ?? 'gh hat nicht geantwortet' }
    }
    return fromGraph(slug, answer.stdout) ?? { slug, reason: 'gh antwortete, aber ohne Repository' }
  }

  const answer = await ports.proc.run('curl', [
    '--silent',
    '--fail',
    '--max-time',
    '10',
    ...(token === null ? [] : ['--header', `Authorization: token ${token}`]),
    `https://${slug.host}/api/v1/repos/${slug.owner}/${slug.repo}`,
  ])
  if (answer.code !== 0) {
    /*
     * 22 is curl's "the server said no" under `--fail`, and on a Gitea that is almost always a
     * repository the caller may not read. Measured here: 13 of 15 unread rows are exactly this,
     * and every one of them is private. Saying "antwortete nicht" would send somebody looking at
     * their network for a permission problem.
     */
    const reason =
      answer.code === 22
        ? 'nicht öffentlich oder nicht vorhanden — HAFEN_GITEA_TOKEN setzen'
        : `${slug.host} antwortete nicht (curl ${String(answer.code)})`
    return { slug, reason }
  }
  return fromGitea(slug, answer.stdout) ?? { slug, reason: 'die Antwort war kein Repository' }
}

/** Whether a reading came back with figures. */
export function isRead(one: ForgeStats | Unread): one is ForgeStats {
  return 'stars' in one
}

/**
 * Every distinct repository the fleet's leading remotes point at.
 *
 * By `origin` only, and distinct: a mirror holds the same work, and asking it would count one
 * project twice. Two ships that were folded into one already share a remote, so the set is what
 * gets asked.
 */
/**
 * The reading that belongs to these remotes, or `null`.
 *
 * By `origin` and by slug, the same way `slugsOf` picks what to ask about — so what was asked for
 * and what is read back cannot drift apart. A mirror is not asked and therefore never matched.
 */
export function statsFor(
  stats: readonly ForgeStats[],
  remotes: readonly { name: string; url: string }[],
): ForgeStats | null {
  const origin = remotes.find((remote) => remote.name === 'origin')
  const slug = origin === undefined ? null : slugOf(origin.url)
  if (slug === null) {
    return null
  }
  return (
    stats.find(
      (one) =>
        one.slug.host === slug.host &&
        one.slug.owner.toLowerCase() === slug.owner.toLowerCase() &&
        one.slug.repo.toLowerCase() === slug.repo.toLowerCase(),
    ) ?? null
  )
}

export function slugsOf(ships: readonly Ship[]): readonly Slug[] {
  const seen = new Map<string, Slug>()
  for (const ship of ships) {
    const origin = ship.remotes.find((remote) => remote.name === 'origin')
    const slug = origin === undefined ? null : slugOf(origin.url)
    // The forge her survey already named, with this machine's register — asked again here with the
    // shipped list alone, a self-hosted origin would silently drop out of every forge reading.
    if (slug !== null && origin?.forge !== undefined && origin.forge !== 'unknown') {
      seen.set(`${slug.host}/${slug.owner}/${slug.repo}`.toLowerCase(), slug)
    }
  }
  return [...seen.values()]
}

/** Where a figure is looked at on the forge itself — one place, so no caller builds a URL. */
export function forgeLinks(slug: Slug): Record<string, string> {
  const base = `https://${slug.host}/${slug.owner}/${slug.repo}`
  return {
    repo: base,
    stars: `${base}/stargazers`,
    watchers: `${base}/watchers`,
    forks: `${base}/forks`,
    issues: `${base}/issues`,
    pulls: `${base}/pulls`,
    language: `${base}/search?l=`,
  }
}
