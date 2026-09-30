import { describe, expect, it } from 'vitest'

import { leaderPath, remoteKey } from './alias'

describe(remoteKey, () => {
  /**
   * One remote written two ways. The ssh and https forms of the same GitHub repository are what
   * two checkouts of one project actually look like on a machine, and a string comparison of the
   * URLs says they are two different projects.
   */
  it('reads the ssh and https forms of one remote as one remote', () => {
    const ssh = remoteKey('git@github.com:takel/takel.git')
    const https = remoteKey('https://github.com/takel/takel.git')

    expect(ssh).toBe('github.com/takel/takel')
    expect(https).toBe(ssh)
  })

  it('drops the suffix, the trailing slash, the port and the credentials', () => {
    expect(remoteKey('https://user:token@git.seefahrt.example:8443/org/thing.git/')).toBe(
      'git.seefahrt.example/org/thing',
    )
  })

  /** Forge paths are case-insensitive in practice, and two clones differing in case are one. */
  it('ignores case', () => {
    expect(remoteKey('git@GitHub.com:Kompass/Peilung-App.git')).toBe(
      'github.com/kompass/peilung-app',
    )
  })

  /**
   * The safe direction is to compare too little, never too much: a remote this cannot parse keeps
   * its own text, so two checkouts of one odd remote still fold and two different ones never do.
   */
  it('keeps an unparsable remote as itself rather than dropping it', () => {
    expect(remoteKey('/srv/git/thing.git')).toBe('/srv/git/thing')
    expect(remoteKey('/srv/git/thing.git')).not.toBe(remoteKey('/srv/git/other.git'))
  })

  /**
   * A URL that announces a scheme and then is not one. Kept rather than thrown: this string comes
   * out of a repository's config and is not ours, and a survey that dies on one odd remote reports
   * no fleet at all.
   */
  it('keeps a broken url as itself rather than throwing', () => {
    expect(remoteKey('http://[')).toBe('http://[')
    expect(remoteKey('https://')).toBe('https:')
  })

  it('has nothing to say about an empty remote', () => {
    expect(remoteKey('')).toBeNull()
    expect(remoteKey('   ')).toBeNull()
  })

  /** `https` must not read as a host name, which is why the scheme form is tried first. */
  it('does not mistake a scheme for a host', () => {
    expect(remoteKey('https://github.com/a/b')).toBe('github.com/a/b')
  })
})

describe(leaderPath, () => {
  /**
   * A second checkout is made by suffixing — measured on this machine, `takel_local` beside
   * `takel` and `peilung-app-old` beside `peilung-app` — so the shorter name is the original.
   */
  it('draws the shortest path', () => {
    expect(leaderPath(['/src/takel_local', '/src/takel'])).toBe('/src/takel')
  })

  /** Whatever it picks, it has to pick the same one every time, or the harbour reshuffles. */
  it('settles a tie the same way every time', () => {
    expect(leaderPath(['/src/bbb', '/src/aaa'])).toBe('/src/aaa')
    expect(leaderPath(['/src/aaa', '/src/bbb'])).toBe('/src/aaa')
  })

  it('has no leader for nothing', () => {
    expect(leaderPath([])).toBeNull()
  })
})
