import { describe, expect, it } from 'vitest'

import { mockPorts } from './mock'
import {
  findAcrossRoots,
  findShipPaths,
  inspectShip,
  mirrorsOf,
  originOf,
  SURVEY_LANES,
  surveyHarbor,
  surveyOrder,
  UnreadableRootError,
} from './ship'

import type { Ports } from './ports'

const ROOT = '/repos'
const SHIP = '/repos/org/ship'
const NOW = new Date('2026-09-27T12:00:00Z')

function gitCommands(overrides: Record<string, string> = {}): Record<string, { stdout: string }> {
  const base: Record<string, string> = {
    'git remote -v': [
      'origin\tgit@github.com:org/ship.git (fetch)',
      'origin\tgit@github.com:org/ship.git (push)',
    ].join('\n'),
    'git rev-parse --abbrev-ref HEAD': 'main',
    'git status --porcelain': '',
    'git log -1 --format=%cI': '2026-09-25T09:00:00Z',
    'git worktree list --porcelain': `worktree ${SHIP}\nHEAD abc\nbranch refs/heads/main\n`,
    'git rev-list --count --left-right @{upstream}...HEAD': '0\t0',
    ...overrides,
  }
  return Object.fromEntries(Object.entries(base).map(([key, stdout]) => [key, { stdout }]))
}

describe(inspectShip, () => {
  it('derives name and org from the path layout', async () => {
    const ports = mockPorts({ commands: gitCommands(), now: NOW })
    const ship = await inspectShip(ports, SHIP)

    expect(ship.name).toBe('ship')
    expect(ship.org).toBe('org')
  })

  it('maps every remote to a forge, origin first', async () => {
    const ship = await inspectShip(
      mockPorts({
        commands: gitCommands({
          'git remote -v': [
            'spiegel\thttps://git.it4c.dev/org/ship.git (fetch)',
            'spiegel\thttps://git.it4c.dev/org/ship.git (push)',
            'origin\tgit@github.com:org/ship.git (fetch)',
            'origin\tgit@github.com:org/ship.git (push)',
          ].join('\n'),
        }),
        now: NOW,
      }),
      SHIP,
    )

    // Origin leads even where git printed it second, and the forge travels with each URL:
    // a ship that lies on GitHub and mirrors to Gitea has two answers at once.
    expect(ship.remotes).toStrictEqual([
      { name: 'origin', url: 'git@github.com:org/ship.git', forge: 'github' },
      { name: 'spiegel', url: 'https://git.it4c.dev/org/ship.git', forge: 'gitea' },
    ])
    expect(originOf(ship.remotes)?.forge).toBe('github')
    expect(mirrorsOf(ship.remotes).map((remote) => remote.name)).toStrictEqual(['spiegel'])
  })

  it('keeps a push-only remote, whose only URL is the push one', async () => {
    // A mirror added with `--push` has no fetch line at all, and dropping it would hide exactly
    // the thing this measurement exists for.
    const ship = await inspectShip(
      mockPorts({
        commands: gitCommands({
          'git remote -v': [
            'origin\tgit@github.com:org/ship.git (fetch)',
            'origin\tgit@github.com:org/ship.git (push)',
            'spiegel\thttps://git.it4c.dev/org/ship.git (push)',
          ].join('\n'),
        }),
        now: NOW,
      }),
      SHIP,
    )

    expect(mirrorsOf(ship.remotes)).toStrictEqual([
      { name: 'spiegel', url: 'https://git.it4c.dev/org/ship.git', forge: 'gitea' },
    ])
  })

  it('leaves a host it cannot name unknown rather than guessing one', async () => {
    const ship = await inspectShip(
      mockPorts({
        commands: gitCommands({
          'git remote -v': 'origin\tgit@git.example.org:org/ship.git (fetch)',
        }),
        now: NOW,
      }),
      SHIP,
    )

    expect(originOf(ship.remotes)?.forge).toBe('unknown')
  })

  it('has no origin when no remote is called that, and promotes none', async () => {
    // `remotes[0]` at a call site would have made `upstream` the ship's forge. Nothing leads
    // here, so issues, launch and "am Kai" are all absent — and the list still shows both.
    const ship = await inspectShip(
      mockPorts({
        commands: gitCommands({
          'git remote -v': [
            'fork\tgit@github.com:me/ship.git (fetch)',
            'upstream\tgit@github.com:org/ship.git (fetch)',
          ].join('\n'),
        }),
        now: NOW,
      }),
      SHIP,
    )

    expect(originOf(ship.remotes)).toBeNull()
    expect(mirrorsOf(ship.remotes)).toHaveLength(2)
  })

  it('reads no remotes where git answers nothing', async () => {
    const ship = await inspectShip(
      mockPorts({ commands: gitCommands({ 'git remote -v': '' }), now: NOW }),
      SHIP,
    )

    expect(ship.remotes).toStrictEqual([])
    expect(originOf(ship.remotes)).toBeNull()
  })

  it('counts rust days from the last commit', async () => {
    const ports = mockPorts({
      commands: gitCommands({ 'git log -1 --format=%cI': '2026-07-01T12:00:00Z' }),
      now: NOW,
    })

    expect((await inspectShip(ports, SHIP)).rustDays).toBe(88)
  })

  it('excludes the main worktree from the dock list', async () => {
    const ports = mockPorts({
      commands: gitCommands({
        'git worktree list --porcelain': [
          `worktree ${SHIP}`,
          'branch refs/heads/main',
          '',
          'worktree /docks/ship-421',
          'branch refs/heads/feat/421',
          '',
        ].join('\n'),
      }),
      now: NOW,
    })

    const ship = await inspectShip(ports, SHIP)

    expect(ship.docks).toStrictEqual(['/docks/ship-421'])
    expect(ship.stage).toBe('dock')
  })

  it('berths a ship whose work is not handed over yet', async () => {
    const dirty = await inspectShip(
      mockPorts({ commands: gitCommands({ 'git status --porcelain': ' M a.ts' }), now: NOW }),
      SHIP,
    )

    expect(dirty.stage).toBe('berthed')

    const unpushed = await inspectShip(
      mockPorts({
        commands: gitCommands({
          'git rev-list --count --left-right @{upstream}...HEAD': '0\t3',
        }),
        now: NOW,
      }),
      SHIP,
    )

    expect(unpushed.stage).toBe('berthed')
    expect(unpushed.ahead).toBe(3)
  })

  it('does not call a long-untouched ship berthed just because it lacks an upstream', async () => {
    // No upstream means ahead is unknown, not "everything pending".
    const ports = mockPorts({
      commands: gitCommands({
        'git log -1 --format=%cI': '2026-01-01T12:00:00Z',
        'git rev-list --count --left-right @{upstream}...HEAD': '',
      }),
      now: NOW,
    })

    const ship = await inspectShip(ports, SHIP)

    expect(ship.ahead).toBeNull()
    expect(ship.stage).toBe('drydock')
  })

  it('lets an open dock outrank pending handover', async () => {
    const ports = mockPorts({
      commands: gitCommands({
        'git status --porcelain': ' M a.ts',
        'git worktree list --porcelain': `worktree ${SHIP}\n\nworktree /docks/ship-1\n`,
      }),
      now: NOW,
    })

    expect((await inspectShip(ports, SHIP)).stage).toBe('dock')
  })

  it('puts a long-untouched ship without docks into drydock', async () => {
    const ports = mockPorts({
      commands: gitCommands({ 'git log -1 --format=%cI': '2026-01-01T12:00:00Z' }),
      now: NOW,
    })

    expect((await inspectShip(ports, SHIP)).stage).toBe('drydock')
  })

  it('survives a repo where git commands fail', async () => {
    const ports = mockPorts({ now: NOW })
    const ship = await inspectShip(ports, SHIP)

    expect(ship.remotes).toStrictEqual([])
    expect(ship.rustDays).toBeNull()
    expect(ship.dirty).toBe(false)
  })

  it('reports a dirty worktree', async () => {
    const ports = mockPorts({
      commands: gitCommands({ 'git status --porcelain': ' M src/index.ts' }),
      now: NOW,
    })

    expect((await inspectShip(ports, SHIP)).dirty).toBe(true)
  })

  it('reads how far the branch runs ahead of and behind its upstream', async () => {
    const ports = mockPorts({
      commands: gitCommands({
        'git rev-list --count --left-right @{upstream}...HEAD': '2\t5',
      }),
      now: NOW,
    })

    const ship = await inspectShip(ports, SHIP)

    expect(ship.behind).toBe(2)
    expect(ship.ahead).toBe(5)
  })
})

describe(findShipPaths, () => {
  it('finds only directories that actually contain a .git', async () => {
    const ports = mockPorts({
      dirs: {
        [ROOT]: ['org', 'notes.txt', 'other'],
        [`${ROOT}/org`]: ['ship', 'scratch'],
        [`${ROOT}/org/ship`]: [],
        [`${ROOT}/org/ship/.git`]: [],
        [`${ROOT}/org/scratch`]: [],
        [`${ROOT}/other`]: ['barge'],
        [`${ROOT}/other/barge`]: [],
        [`${ROOT}/other/barge/.git`]: [],
      },
    })

    await expect(findShipPaths(ports, ROOT)).resolves.toStrictEqual([
      '/repos/org/ship',
      '/repos/other/barge',
    ])
  })

  it('returns nothing for a root that does not exist', async () => {
    await expect(findShipPaths(mockPorts(), '/nope')).resolves.toStrictEqual([])
  })
})

describe(findShipPaths, () => {
  /**
   * The layout this was built for, and the one it must not get slower at.
   */
  it('finds the ordinary <org>/<repo> layout', async () => {
    const ports = mockPorts({
      dirs: {
        '/repos': ['org'],
        '/repos/org': ['one', 'two'],
        '/repos/org/one': [],
        '/repos/org/one/.git': [],
        '/repos/org/two': [],
        '/repos/org/two/.git': [],
      },
    })

    await expect(findShipPaths(ports, '/repos')).resolves.toStrictEqual([
      '/repos/org/one',
      '/repos/org/two',
    ])
  })

  /**
   * `mojotrollz/addons/AddOns`: somebody grouped two projects in a folder, and the old search
   * looked at exactly two levels and walked past them.
   */
  it('finds a repository somebody filed one level deeper', async () => {
    const ports = mockPorts({
      dirs: {
        '/repos': ['org'],
        '/repos/org': ['addons'],
        '/repos/org/addons': ['AddOns'],
        '/repos/org/addons/AddOns': [],
        '/repos/org/addons/AddOns/.git': [],
      },
    })

    await expect(findShipPaths(ports, '/repos')).resolves.toStrictEqual([
      '/repos/org/addons/AddOns',
    ])
  })

  /**
   * The rule that matters: 28 of the 31 repositories the old search missed live *inside* another
   * one — nine foreign deployments under `Ocelot-Social/deployment/configurations` alone. They
   * are parts of the repository that contains them, and listing them would count one project's
   * contents as a fleet.
   */
  it('stops at a repository and does not list what is inside it', async () => {
    const ports = mockPorts({
      dirs: {
        '/repos': ['org'],
        '/repos/org': ['outer'],
        '/repos/org/outer': ['deployment'],
        '/repos/org/outer/.git': [],
        '/repos/org/outer/deployment': ['inner'],
        '/repos/org/outer/deployment/inner': [],
        '/repos/org/outer/deployment/inner/.git': [],
      },
    })

    await expect(findShipPaths(ports, '/repos')).resolves.toStrictEqual(['/repos/org/outer'])
  })

  /** Dependencies hold repositories somebody else wrote and this machine merely pulled in. */
  it('never descends into dependencies or build output', async () => {
    const ports = mockPorts({
      dirs: {
        '/repos': ['org'],
        '/repos/org': ['node_modules', '.terraform', 'target'],
        '/repos/org/node_modules': ['pkg'],
        '/repos/org/node_modules/pkg': [],
        '/repos/org/node_modules/pkg/.git': [],
        '/repos/org/.terraform': ['modules'],
        '/repos/org/target': [],
      },
    })

    await expect(findShipPaths(ports, '/repos')).resolves.toStrictEqual([])
  })

  /**
   * Copies on this machine are made by suffixing — `portmod_`, `nostalgeek-new`, `AddOns_`. Until
   * this matched, `portmod` was skipped and its two backups contributed six package caches.
   */
  it('skips a copy of an excluded directory as well as the original', async () => {
    const ports = mockPorts({
      dirs: {
        '/repos': ['org'],
        '/repos/org': ['portmod', 'portmod_', 'portmod-new', 'buildkite'],
        '/repos/org/portmod': ['repos'],
        '/repos/org/portmod_': ['repos'],
        '/repos/org/portmod-new': ['repos'],
        '/repos/org/buildkite': [],
        '/repos/org/buildkite/.git': [],
      },
    })

    // `buildkite` shares a prefix with `build` and is not a copy of it.
    await expect(findShipPaths(ports, '/repos')).resolves.toStrictEqual(['/repos/org/buildkite'])
  })

  it('answers nothing for a root that is not there', async () => {
    await expect(findShipPaths(mockPorts(), '/nirgends')).resolves.toStrictEqual([])
  })

  /** A limit so a stray symlink cannot turn the survey into a walk of the whole disk. */
  it('gives up below the search depth', async () => {
    const deep = '/repos/a/b/c/d/e'
    const ports = mockPorts({
      dirs: {
        '/repos': ['a'],
        '/repos/a': ['b'],
        '/repos/a/b': ['c'],
        '/repos/a/b/c': ['d'],
        '/repos/a/b/c/d': ['e'],
        [deep]: [],
        [`${deep}/.git`]: [],
      },
    })

    await expect(findShipPaths(ports, '/repos')).resolves.toStrictEqual([])
  })
})

describe(findAcrossRoots, () => {
  /**
   * A machine keeps its projects in more than one place: this one has `~/.data/sources` and
   * `~/.data/games`, and the second holds six real repositories. With one root they did not exist.
   */
  it('reads every root that was named', async () => {
    const ports = mockPorts({
      dirs: {
        '/a': ['org'],
        '/a/org': ['one'],
        '/a/org/one': [],
        '/a/org/one/.git': [],
        '/b': ['org'],
        '/b/org': ['two'],
        '/b/org/two': [],
        '/b/org/two/.git': [],
      },
    })

    await expect(findAcrossRoots(ports, ['/a', '/b'])).resolves.toStrictEqual([
      '/a/org/one',
      '/b/org/two',
    ])
  })

  /** `~/.data` and `~/.data/sources` are a reasonable pair to hand in, and overlap. */
  it('counts a repository found twice only once', async () => {
    const ports = mockPorts({
      dirs: {
        '/a': ['org'],
        '/a/org': ['one'],
        '/a/org/one': [],
        '/a/org/one/.git': [],
      },
    })

    await expect(findAcrossRoots(ports, ['/a', '/a'])).resolves.toStrictEqual(['/a/org/one'])
  })
})

describe(surveyHarbor, () => {
  /** A typo in the second root would otherwise quietly halve the fleet. */
  it('refuses a root it cannot read, even when another one works', async () => {
    const ports = mockPorts({ dirs: { '/a': [] } })

    await expect(surveyHarbor(ports, ['/a', '/nirgends'])).rejects.toThrow('/nirgends')
  })

  it('inspects every ship it finds', async () => {
    const ports = mockPorts({
      dirs: {
        [ROOT]: ['org'],
        [`${ROOT}/org`]: ['ship'],
        [`${ROOT}/org/ship`]: [],
        [`${ROOT}/org/ship/.git`]: [],
      },
      commands: gitCommands(),
      now: NOW,
    })

    const ships = await surveyHarbor(ports, ROOT)

    expect(ships).toHaveLength(1)
    expect(ships[0]?.name).toBe('ship')
  })
})

/** A root with `count` ships under one org, all answering the same git commands. */
function fleet(count: number): { ports: Ports; paths: readonly string[]; inFlight: () => number } {
  const names = Array.from({ length: count }, (_, index) => `ship${String(index).padStart(2, '0')}`)
  const paths = names.map((name) => `${ROOT}/org/${name}`)

  const dirs: Record<string, readonly string[]> = { [ROOT]: ['org'], [`${ROOT}/org`]: names }
  for (const path of paths) {
    dirs[path] = []
    dirs[`${path}/.git`] = []
  }

  const base = mockPorts({ dirs, commands: gitCommands(), now: NOW })
  const open = new Set<string>()
  let peak = 0

  const ports: Ports = {
    ...base,
    proc: {
      ...base.proc,
      run: async (command, args, cwd) => {
        // Counted per working directory, not per call: one ship runs seven git commands at
        // once by design, and the bound this checks is on ships.
        if (cwd !== undefined) {
          open.add(cwd)
          peak = Math.max(peak, open.size)
        }
        const result = await base.proc.run(command, args, cwd)
        if (cwd !== undefined) {
          open.delete(cwd)
        }
        return result
      },
    },
  }

  return { ports, paths, inFlight: () => peak }
}

describe(surveyOrder, () => {
  it('measures what the window shows first, and the rest in its own order', () => {
    expect(surveyOrder(['/a', '/b', '/c'], ['/c'])).toStrictEqual(['/c', '/a', '/b'])
  })

  it('ignores a path that is not in the fleet rather than adding it', () => {
    // A stale cache names a repository that has been scrapped; a sort must not resurrect it.
    expect(surveyOrder(['/a', '/b'], ['/gone', '/b'])).toStrictEqual(['/b', '/a'])
  })

  it('leaves the order alone when nothing is asked for first', () => {
    expect(surveyOrder(['/a', '/b'], [])).toStrictEqual(['/a', '/b'])
  })
})

describe('surveyHarbor while it runs', () => {
  it('reports every ship as it lands, not only at the end', async () => {
    const { ports } = fleet(5)
    const seen: string[] = []

    const ships = await surveyHarbor(ports, ROOT, {
      progress: { onShip: (ship) => seen.push(ship.name) },
    })

    expect(seen).toHaveLength(5)
    expect(new Set(seen)).toStrictEqual(new Set(ships.map((ship) => ship.name)))
  })

  it('measures the ships it was asked for first, first', async () => {
    const { ports, paths } = fleet(3)
    const last = paths.at(-1) ?? ''
    const seen: string[] = []

    await surveyHarbor(ports, ROOT, {
      progress: { first: [last], onShip: (ship) => seen.push(ship.path) },
    })

    expect(seen[0]).toBe(last)
  })

  it('still answers by path, whatever order it measured in', async () => {
    // The measurement order is a decision about what the human sees first. Letting it reach the
    // returned list would make the harbor's own listing depend on where the eye happened to be.
    const { ports, paths } = fleet(4)

    const ships = await surveyHarbor(ports, ROOT, { progress: { first: [...paths].reverse() } })

    expect(ships.map((ship) => ship.path)).toStrictEqual([...paths])
  })

  it('never has more than SURVEY_LANES ships open at once', async () => {
    // The budget this order exists for: unbounded, all of the fleet's git calls are handed over
    // in one go and the window that shares the loop with them stops answering.
    const { ports, inFlight } = fleet(SURVEY_LANES * 3)

    await surveyHarbor(ports, ROOT)

    expect(inFlight()).toBeLessThanOrEqual(SURVEY_LANES)
  })

  it('surveys a fleet larger than one lane-load completely', async () => {
    const { ports } = fleet(SURVEY_LANES + 3)

    await expect(surveyHarbor(ports, ROOT)).resolves.toHaveLength(SURVEY_LANES + 3)
  })
})

describe('surveyHarbor root handling', () => {
  it('tells an unreadable root apart from an empty one', async () => {
    // Both give zero ships; only one is a fault, and hiding it behind an empty
    // harbor cost real debugging time once already.
    await expect(surveyHarbor(mockPorts(), '/nope')).rejects.toThrow(UnreadableRootError)
  })

  it('accepts a root that exists but holds no repos', async () => {
    const ports = mockPorts({ dirs: { '/repos': [] } })

    await expect(surveyHarbor(ports, '/repos')).resolves.toStrictEqual([])
  })
})
