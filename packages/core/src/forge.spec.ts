import { describe, expect, it } from 'vitest'

import { BUILTIN_FORGES, forgeHost, forgeOf } from './forge'

import type { ForgeHost } from './forge'

/** What a machine's register adds — an example host, never one this repository would ship. */
const MINE: readonly ForgeHost[] = [...BUILTIN_FORGES, { host: 'git.example.org', forge: 'gitea' }]

describe(forgeOf, () => {
  it('reads both spellings of the same host', () => {
    expect(forgeOf('git@github.com:org/ship.git')).toBe('github')
    expect(forgeOf('https://github.com/org/ship')).toBe('github')
  })

  it('leaves a host it has nothing to say about unknown', () => {
    // The safe direction: a remote the harbor cannot name is shown and never asked. A guess would
    // send a request to a stranger's server.
    expect(forgeOf('git@git.example.org:org/ship.git')).toBe('unknown')
    expect(forgeOf(null)).toBe('unknown')
  })

  /** A self-hosted Gitea is a fact about one machine, so it comes from that machine's register. */
  it('knows a self-hosted forge only once the machine names it', () => {
    expect(forgeOf('https://git.example.org/org/ship.git', MINE)).toBe('gitea')
    expect(forgeOf('git@github.com:org/ship.git', MINE)).toBe('github')
  })

  /** Shipped to everybody, so it names nobody's own server. */
  it('ships with GitHub and nothing else', () => {
    expect(BUILTIN_FORGES.map((one) => one.host)).toStrictEqual(['github.com'])
  })
})

describe(forgeHost, () => {
  it('names the host itself, for the addresses built from it', () => {
    expect(forgeHost('git@github.com:org/ship.git')).toBe('github.com')
    expect(forgeHost('https://git.example.org/org/ship.git', MINE)).toBe('git.example.org')
    expect(forgeHost('git@git.example.org:org/ship.git')).toBeNull()
    expect(forgeHost(null)).toBeNull()
  })

  /**
   * The reason this module exists at all: two places once matched the same hostnames for
   * different purposes, and a host one of them knew and the other did not was a tool offering
   * something for a repository it could not actually read. Whether a host is named and whether it
   * is known have to be the same answer — for every list it is asked with.
   */
  it('names a host exactly when it recognises the forge', () => {
    for (const known of [BUILTIN_FORGES, MINE]) {
      for (const remote of [
        'git@github.com:org/ship.git',
        'https://git.example.org/org/ship.git',
        'git@elsewhere.example:org/ship.git',
      ]) {
        expect(forgeHost(remote, known) !== null).toBe(forgeOf(remote, known) !== 'unknown')
      }
    }
  })
})
