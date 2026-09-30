import { describe, expect, it } from 'vitest'

import { mockPorts, mockRemote } from './mock'
import { forgeLinks, isRead, readStats, slugOf, slugsOf } from './stats'

import type { CommandMap } from './mock'
import type { Ship } from './ship'
import type { ForgeStats, Slug, Unread } from './stats'

const HAFEN: Slug = { host: 'github.com', owner: 'ulfgebhardt', repo: 'hafen' }

const GRAPH = JSON.stringify({
  data: {
    repository: {
      stargazerCount: 1743,
      forkCount: 210,
      watchers: { totalCount: 64 },
      primaryLanguage: { name: 'PHP' },
      issues: { totalCount: 121 },
      pullRequests: { totalCount: 24 },
    },
  },
})

/**
 * The mock keys on the whole invocation, and the GraphQL query is long — so every test here swaps
 * `run` wholesale instead of spelling the key out. What is asserted is the *shape* of the answer,
 * which is what `readStats` is for.
 */
function answering(commands: CommandMap, onPath: readonly string[] = ['gh', 'curl']) {
  return mockPorts({ commands, onPath })
}

describe(slugOf, () => {
  /**
   * Deliberately not `remoteKey`, which lowercases so two spellings compare equal. That is right
   * for folding aliases and wrong here: an API path is case-sensitive.
   */
  it('keeps the case the forge uses', () => {
    expect(slugOf('git@github.com:Leuchtturm-Verbund/Leuchtturm.git')).toStrictEqual({
      host: 'github.com',
      owner: 'Leuchtturm-Verbund',
      repo: 'Leuchtturm',
    })
  })

  it('reads both spellings of one remote', () => {
    expect(slugOf('https://github.com/ulfgebhardt/hafen.git')).toStrictEqual(HAFEN)
    expect(slugOf('git@github.com:ulfgebhardt/hafen')).toStrictEqual(HAFEN)
  })

  it('takes the last two segments, however deep the path', () => {
    expect(slugOf('https://git.seefahrt.example/Wattenmeer/infrastructure')).toStrictEqual({
      host: 'git.seefahrt.example',
      owner: 'Wattenmeer',
      repo: 'infrastructure',
    })
  })

  it('says nothing about a remote it cannot read as one', () => {
    expect(slugOf('')).toBeNull()
    expect(slugOf('/srv/git/thing.git')).toBeNull()
    expect(slugOf('http://[')).toBeNull()
  })
})

describe(slugsOf, () => {
  const ship = (url: string | null, name = 'x'): Ship =>
    ({ name, remotes: url === null ? [] : [mockRemote(url)] }) as unknown as Ship

  /**
   * By `origin` only, and distinct: a mirror holds the same work, and asking it would count one
   * project twice.
   */
  it('asks each repository once, by its leading remote', () => {
    const wanted = slugsOf([
      ship('git@github.com:ulfgebhardt/hafen.git'),
      ship('https://github.com/ulfgebhardt/hafen', 'zweite Kopie'),
    ])

    expect(wanted).toStrictEqual([HAFEN])
  })

  /** A host this tool cannot name is shown and never asked — a guess would call a stranger. */
  it('leaves out a host it does not know, and a ship with no remote', () => {
    expect(slugsOf([ship('git@git.example.org:org/repo.git'), ship(null)])).toStrictEqual([])
  })
})

/** The reason, or nothing — `isRead` narrows, and a cast would assert what is being tested. */
const reasonOf = (answer: ForgeStats | Unread): string => (isRead(answer) ? '' : answer.reason)

describe(readStats, () => {
  /**
   * GraphQL rather than `gh api repos/…` because of `issues` and `pullRequests`: the REST field
   * counts both in one number, so a repository with 442 issues and 53 pull requests reports 495.
   */
  it('reads issues and pull requests apart', async () => {
    const run = async (): Promise<{ code: number; stdout: string; stderr: string }> =>
      Promise.resolve({ code: 0, stdout: GRAPH, stderr: '' })
    const base = answering({})
    const answer = await readStats({ ...base, proc: { ...base.proc, run } }, HAFEN)

    expect(isRead(answer)).toBe(true)
    expect(answer).toMatchObject({ stars: 1743, issues: 121, pulls: 24, language: 'PHP' })
  })

  /**
   * A failure is reported per repository and never thrown: a token that expired, a repository that
   * was renamed, a host that is down — each is a fact about *that* row, and one must not take the
   * other ninety-one with it.
   */
  it('hands back the reason rather than throwing', async () => {
    const base = answering({})
    const run = async (): Promise<{ code: number; stdout: string; stderr: string }> =>
      Promise.resolve({ code: 1, stdout: '', stderr: 'gh: Could not resolve to a Repository\n' })
    const answer = await readStats({ ...base, proc: { ...base.proc, run } }, HAFEN)

    expect(isRead(answer)).toBe(false)
    expect(answer).toMatchObject({ reason: 'gh: Could not resolve to a Repository' })
  })

  it('says which tool is missing rather than failing at the call', async () => {
    const answer = await readStats(answering({}, []), HAFEN)

    expect(answer).toMatchObject({ reason: 'gh ist nicht installiert' })
  })

  /** A host the tool cannot name is not asked at all — a guess would call a stranger. */
  it('refuses a host it does not know', async () => {
    const answer = await readStats(answering({}), {
      host: 'git.example.org',
      owner: 'a',
      repo: 'b',
    })

    expect(reasonOf(answer)).toContain('keine Forge')
  })

  /**
   * 22 is curl's "the server said no" under `--fail`, and on a Gitea that is almost always a
   * repository the caller may not read — 13 of 15 unread rows here, every one of them private.
   */
  it('names a permission problem on Gitea as one', async () => {
    const base = answering({})
    const run = async (): Promise<{ code: number; stdout: string; stderr: string }> =>
      Promise.resolve({ code: 22, stdout: '', stderr: '' })
    const answer = await readStats(
      { ...base, proc: { ...base.proc, run } },
      {
        host: 'git.seefahrt.example',
        owner: 'Wattenmeer',
        repo: 'secrets',
      },
    )

    expect(reasonOf(answer)).toContain('HAFEN_GITEA_TOKEN')
  })

  /** Gitea counts them apart already — one fewer thing to correct for than GitHub's REST. */
  it('reads a Gitea answer in its own shape', async () => {
    const base = answering({})
    const run = async (): Promise<{ code: number; stdout: string; stderr: string }> =>
      Promise.resolve({
        code: 0,
        stdout: JSON.stringify({
          stars_count: 3,
          watchers_count: 2,
          forks_count: 1,
          open_issues_count: 7,
          open_pr_counter: 4,
          language: 'Rust',
        }),
        stderr: '',
      })
    const answer = await readStats(
      { ...base, proc: { ...base.proc, run } },
      {
        host: 'git.seefahrt.example',
        owner: 'org',
        repo: 'repo',
      },
    )

    expect(answer).toMatchObject({ stars: 3, issues: 7, pulls: 4, language: 'Rust' })
  })

  it('treats an answer that is not a repository as unread', async () => {
    const base = answering({})
    const run = async (): Promise<{ code: number; stdout: string; stderr: string }> =>
      Promise.resolve({ code: 0, stdout: '{"data":{"repository":null}}', stderr: '' })

    expect(isRead(await readStats({ ...base, proc: { ...base.proc, run } }, HAFEN))).toBe(false)
  })
})

describe(forgeLinks, () => {
  /** One place, so no caller builds a URL — and the Rust side checks the host before opening it. */
  it('builds every link off the one repository address', () => {
    const links = forgeLinks(HAFEN)

    expect(links['repo']).toBe('https://github.com/ulfgebhardt/hafen')
    expect(links['issues']).toBe('https://github.com/ulfgebhardt/hafen/issues')
    expect(links['pulls']).toBe('https://github.com/ulfgebhardt/hafen/pulls')
  })
})
