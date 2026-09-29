import { describe, expect, it } from 'vitest'

import { countWork, isBot, kindOf, LOG_FORMAT, NO_WORK, parseLog, pullOf, readLedger } from './work'

import type { Commit } from './work'

/** A log line in the shape `LOG_FORMAT` produces. */
function line(email: string, subject: string, parents = 'abc123'): string {
  return `${email}\0${subject}\0${parents}`
}

function commit(subject: string, email = 'me@example.org', parents = 1): Commit {
  return { email, subject, parents }
}

describe(parseLog, () => {
  it('reads author, subject and parent count', () => {
    const commits = parseLog(
      [line('A@Example.org', 'feat: etwas'), line('b@x', 'fix: dies')].join('\n'),
    )

    expect(commits).toStrictEqual([
      // Lowercased on read, so a comparison against the configured address is a plain lookup.
      { email: 'a@example.org', subject: 'feat: etwas', parents: 1 },
      { email: 'b@x', subject: 'fix: dies', parents: 1 },
    ])
  })

  it('counts parents, which is how a merge is recognised', () => {
    const commits = parseLog(
      [line('a@x', 'merge', 'aaa bbb'), line('a@x', 'root', ''), line('a@x', 'normal', 'aaa')].join(
        '\n',
      ),
    )

    expect(commits.map((entry) => entry.parents)).toStrictEqual([2, 0, 1])
  })

  /**
   * Tolerant on purpose: the survey runs over ninety repositories nobody here controls, and one
   * odd commit message must not take the count of everything else with it.
   */
  it('skips a line that is not a log line, rather than throwing', () => {
    expect(parseLog('kaputt\nme@x\0feat: gut\0abc')).toHaveLength(1)
  })

  it('reads nothing out of nothing', () => {
    expect(parseLog(null)).toStrictEqual([])
    expect(parseLog('')).toStrictEqual([])
    expect(parseLog('   \n ')).toStrictEqual([])
  })

  /** A subject may contain anything but NUL — which is exactly why the format uses it. */
  it('survives a subject with tabs and pipes in it', () => {
    const commits = parseLog(line('a@x', 'fix: a|b\tc — "d"'))

    expect(commits[0]?.subject).toBe('fix: a|b\tc — "d"')
    expect(LOG_FORMAT).toContain('%x00')
  })
})

describe(kindOf, () => {
  it.each([
    ['feat: neu', 'feat'],
    ['fix(app): kaputt', 'fix'],
    ['feat(core)!: bruch', 'feat'],
    ['chore(release): 1.2.3', 'chore'],
    ['docs: lesen', 'docs'],
  ])('reads %s as %s', (subject, kind) => {
    expect(kindOf(subject)).toBe(kind)
  })

  /** An unknown prefix is unscored, not invented into a category. */
  it.each([
    'Merge pull request #1 from x',
    'irgendwas ohne Präfix',
    'WIP',
    'banana: kein Typ',
    'Feat: gross geschrieben',
  ])('has nothing to say about %s', (subject) => {
    expect(kindOf(subject)).toBeNull()
  })
})

describe(pullOf, () => {
  /** Both merge styles occur on this fleet, and often in the same repository. */
  it('reads a merge commit and a squash alike', () => {
    expect(pullOf('Merge pull request #123 from org/branch')).toBe(123)
    expect(pullOf('fix(app): browser polyfills (#434)')).toBe(434)
  })

  it('says nothing where no number is named', () => {
    expect(pullOf('feat: etwas')).toBeNull()
    expect(pullOf('Merge branch master into x')).toBeNull()
    // A number mid-subject is a reference, not the pull request this landed through.
    expect(pullOf('fix: siehe (#12) und weiter')).toBeNull()
  })
})

describe(isBot, () => {
  it('knows a bot by the shape of its address', () => {
    expect(isBot('49699333+dependabot[bot]@users.noreply.github.com')).toBe(true)
    expect(isBot('bot@renovateapp.com')).toBe(true)
    expect(isBot('ulf@example.org')).toBe(false)
  })
})

describe(countWork, () => {
  it('counts nothing out of nothing', () => {
    expect(countWork([])).toStrictEqual(NO_WORK)
  })

  it('splits commits by kind and keeps the rest as unscored', () => {
    const work = countWork([
      commit('feat: a'),
      commit('feat: b'),
      commit('fix: c'),
      commit('irgendwas'),
    ])

    expect(work.byKind).toStrictEqual({ feat: 2, fix: 1 })
    expect(work.unscored).toBe(1)
    expect(work.commits).toBe(4)
  })

  /**
   * The set is the point: a repository using both merge styles would otherwise count one pull
   * request twice, and counting merge commits alone reported 0 for a repository with 348
   * squashed pull requests.
   */
  it('counts a pull request once, however it landed', () => {
    const work = countWork([
      commit('Merge pull request #7 from org/x', 'a@x', 2),
      commit('feat: etwas (#7)'),
      commit('fix: anderes (#8)'),
    ])

    expect(work.pulls).toBe(2)
    expect(work.merges).toBe(1)
  })

  it('counts the people, not the commits', () => {
    const work = countWork([commit('a', 'x@a'), commit('b', 'x@a'), commit('c', 'y@b')])

    expect(work.authors).toBe(2)
  })
})

describe(readLedger, () => {
  const log = [
    line('me@example.org', 'feat: meins'),
    line('other@example.org', 'fix: fremdes'),
    line('me@example.org', 'chore: auch meins (#12)'),
  ].join('\n')

  it('reports the repository and the own share side by side', () => {
    const ledger = readLedger(log, ['me@example.org'])

    expect(ledger.total.commits).toBe(3)
    expect(ledger.own.commits).toBe(2)
    expect(ledger.own.pulls).toBe(1)
    expect(ledger.total.authors).toBe(2)
  })

  it('matches an address however it was capitalised', () => {
    expect(readLedger(log, ['  ME@Example.ORG  ']).own.commits).toBe(2)
  })

  /**
   * A repository where renovate made four hundred commits did not do four hundred things, and
   * leaving that in would make the busiest number the least meaningful.
   */
  it('drops bots from both sides', () => {
    const withBot = `${log}\n${line('49699333+dependabot[bot]@users.noreply.github.com', 'chore: bump')}`

    expect(readLedger(withBot, ['me@example.org']).total.commits).toBe(3)
  })

  it('reports no own work where nobody was named', () => {
    const ledger = readLedger(log, [])

    expect(ledger.total.commits).toBe(3)
    expect(ledger.own).toStrictEqual(NO_WORK)
  })
})
