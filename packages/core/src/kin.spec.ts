import { describe, expect, it } from 'vitest'

import { addressesOf, familiesOf } from './kin'
import { mockContract } from './mock'
import { NO_LEDGER } from './work'
import { NOTHING_OPEN } from './working'

import type { Ship } from './ship'
import type { Tender } from './submodules'

const tender = (url: string | null): Tender => ({
  path: 'lib',
  state: 'aboard',
  at: 'aaaaaaaa',
  url,
})

function ship(overrides: Partial<Ship> = {}): Ship {
  return {
    name: 'ship',
    org: 'org',
    path: '/repos/org/ship',
    remotes: [],
    branch: 'main',
    dirty: false,
    working: NOTHING_OPEN,
    stash: 0,
    ledger: NO_LEDGER,
    lines: null,
    roots: [],
    rustDays: 1,
    ahead: 0,
    behind: 0,
    docks: [],
    branches: [],
    defaultBranch: 'main',
    submodules: [],
    contract: mockContract(),
    quests: [],
    ownQuests: [],
    overriddenQuests: [],
    unreadableQuests: [],
    stage: 'sailing',
    archived: false,
    enlisted: false,
    hasGit: true,
    ...overrides,
  }
}

const remote = (url: string, name = 'origin') => ({ name, url, forge: 'github' as const })

const named = (families: ReturnType<typeof familiesOf>) =>
  families.map((family) => family.ships.map((one) => one.name))

describe(addressesOf, () => {
  /**
   * All her remotes and not only the origin. The asymmetry is the whole boilerplate case: the
   * product names the template, never the other way round, so the template has to be findable
   * under every name it answers to.
   */
  it('answers to every remote she has, in one spelling', () => {
    const subject = ship({
      remotes: [
        remote('git@github.com:IT4Change/boilerplate-frontend.git'),
        remote('https://github.com/IT4Change/Boilerplate-Frontend/', 'mirror'),
      ],
    })

    expect(addressesOf(subject)).toStrictEqual([
      'github.com/it4change/boilerplate-frontend',
      'github.com/it4change/boilerplate-frontend',
    ])
  })

  it('drops a remote that names no repository', () => {
    expect(addressesOf(ship({ remotes: [remote('')] }))).toStrictEqual([])
  })
})

describe(familiesOf, () => {
  /**
   * The strongest of the three ties, and the one nothing else could find. Eight repositories on
   * this fleet share root `0eb108a2` across six organisations — renamed, re-owned, re-remoted.
   */
  it('puts repositories that share a root commit in one family', () => {
    const families = familiesOf([
      ship({ name: 'wir-social', org: 'wir-social', roots: ['0eb108a2'] }),
      ship({ name: 'yunite.me', org: 'Yunite-Net', roots: ['0eb108a2'] }),
      ship({ name: 'alone', org: 'z', roots: ['ffffffff'] }),
    ])

    expect(named(families)).toStrictEqual([['wir-social', 'yunite.me'], ['alone']])
  })

  /** A remote that names another ship of this fleet — measured twenty times here. */
  it('ties a ship to the repository her mirror points at', () => {
    const families = familiesOf([
      ship({ name: 'boilerplate', remotes: [remote('git@github.com:IT4Change/boilerplate.git')] }),
      ship({
        name: 'dreammall',
        remotes: [
          remote('git@github.com:dreammall-earth/dreammall.earth.git'),
          remote('https://github.com/IT4Change/boilerplate', 'upstream'),
        ],
      }),
    ])

    expect(named(families)).toStrictEqual([['boilerplate', 'dreammall']])
  })

  /** And a submodule url, which is a dependency rather than a kinship and draws the same. */
  it('ties a ship to the repository she carries', () => {
    const families = familiesOf([
      ship({ name: 'api', remotes: [remote('https://github.com/ohmyform/api')] }),
      ship({ name: 'ohmyform', submodules: [tender('https://github.com/ohmyform/api')] }),
    ])

    expect(named(families)).toStrictEqual([['api', 'ohmyform']])
  })

  /** A submodule pointing somewhere nobody here is ties nothing — and must not throw. */
  it('ignores a pointer at a repository that is not in this fleet', () => {
    const families = familiesOf([
      ship({ name: 'a', submodules: [tender('https://github.com/somebody/else')] }),
      ship({ name: 'b', submodules: [tender(null)] }),
    ])

    expect(named(families)).toStrictEqual([['a'], ['b']])
  })

  /**
   * Ties chain: A shares a root with B, B mirrors C, so all three are one family. That is the
   * point of disjoint sets rather than a pass per kind of edge.
   */
  it('joins families that are tied by different kinds of edge', () => {
    const families = familiesOf([
      ship({ name: 'a', roots: ['1111'] }),
      ship({ name: 'b', roots: ['1111'], remotes: [remote('https://github.com/o/c', 'mirror')] }),
      ship({ name: 'c', remotes: [remote('https://github.com/o/c')] }),
    ])

    expect(named(families)).toStrictEqual([['a', 'b', 'c']])
  })

  /**
   * A ship nothing ties to anything is a family of her own, and that is the common case here —
   * not a leftover pile the layout has to treat differently.
   */
  it('gives a ship nothing ties to a family of her own', () => {
    expect(named(familiesOf([ship({ name: 'a' }), ship({ name: 'b' })]))).toStrictEqual([
      ['a'],
      ['b'],
    ])
    expect(familiesOf([])).toStrictEqual([])
  })

  /**
   * The same fleet in any order comes out the same, which is the property the whole layout rests
   * on: a harbour that reshuffles between two identical readings says something it never measured.
   */
  it('does not depend on the order the ships arrive in', () => {
    const fleet = [
      ship({ name: 'a', org: 'o', roots: ['1111'] }),
      ship({ name: 'b', org: 'o', roots: ['1111'] }),
      ship({ name: 'c', org: 'o', roots: ['2222'] }),
      ship({ name: 'd', org: 'o' }),
    ]

    expect(named(familiesOf([...fleet].reverse()))).toStrictEqual(named(familiesOf(fleet)))
  })

  /** Biggest first, then by name — the order the harbour lays its docks out in. */
  it('names a family after its first ship and sorts the largest to the front', () => {
    const families = familiesOf([
      ship({ name: 'solo', org: 'a' }),
      ship({ name: 'two', org: 'b', roots: ['1111'] }),
      ship({ name: 'one', org: 'b', roots: ['1111'] }),
    ])

    expect(families[0]?.id).toBe('b/one')
    expect(families[0]?.ships).toHaveLength(2)
  })
})
