import { describe, expect, it } from 'vitest'

import { forgeHost, forgeOf } from './forge'

describe(forgeOf, () => {
  it('reads both spellings of the same host', () => {
    expect(forgeOf('git@github.com:org/ship.git')).toBe('github')
    expect(forgeOf('https://github.com/org/ship')).toBe('github')
    expect(forgeOf('https://git.it4c.dev/org/ship.git')).toBe('gitea')
  })

  it('leaves a host it has nothing to say about unknown', () => {
    // The safe direction: a remote Werft cannot name is shown and never asked. A guess would
    // send a request to a stranger's server.
    expect(forgeOf('git@git.example.org:org/ship.git')).toBe('unknown')
    expect(forgeOf(null)).toBe('unknown')
  })
})

describe(forgeHost, () => {
  it('names the host itself, for the addresses built from it', () => {
    expect(forgeHost('git@github.com:org/ship.git')).toBe('github.com')
    expect(forgeHost('https://git.it4c.dev/org/ship.git')).toBe('git.it4c.dev')
    expect(forgeHost('git@git.example.org:org/ship.git')).toBeNull()
    expect(forgeHost(null)).toBeNull()
  })

  /**
   * The reason this module exists at all: two places once matched the same hostnames for
   * different purposes, and a host one of them knew and the other did not was a tool offering
   * something for a repository it could not actually read.
   *
   * The second reader was `launch.ts`, and it did not come along — the harbor does not launch
   * anything. What survives is the half that still has two readers: whether a host is named and
   * whether it is known have to be the same answer.
   */
  it('names a host exactly when it recognises the forge', () => {
    for (const remote of [
      'git@github.com:org/ship.git',
      'https://git.it4c.dev/org/ship.git',
      'git@git.example.org:org/ship.git',
    ]) {
      expect(forgeHost(remote) !== null).toBe(forgeOf(remote) !== 'unknown')
    }
  })
})
