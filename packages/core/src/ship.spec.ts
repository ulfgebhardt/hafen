import { describe, expect, it } from 'vitest'

import { mockPorts } from './mock'
import {
  countLines,
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
            'spiegel\thttps://git.seefahrt.example/org/ship.git (fetch)',
            'spiegel\thttps://git.seefahrt.example/org/ship.git (push)',
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
      { name: 'spiegel', url: 'https://git.seefahrt.example/org/ship.git', forge: 'gitea' },
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
            'spiegel\thttps://git.seefahrt.example/org/ship.git (push)',
          ].join('\n'),
        }),
        now: NOW,
      }),
      SHIP,
    )

    expect(mirrorsOf(ship.remotes)).toStrictEqual([
      { name: 'spiegel', url: 'https://git.seefahrt.example/org/ship.git', forge: 'gitea' },
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

describe('stopping a survey', () => {
  /**
   * A survey of ninety repositories is seconds, and a reader who has seen enough must be able to
   * say so. It was a *process* that got killed while the CLI measured; a window that measures by
   * itself has no process to kill.
   */
  it('keeps what it has measured and reads no further', async () => {
    const names = Array.from({ length: 40 }, (_, index) => `r${String(index)}`)
    const ports = mockPorts({
      dirs: {
        '/repos': names,
        ...Object.fromEntries(
          names.flatMap((name) => [
            [`/repos/${name}`, []],
            [`/repos/${name}/.git`, []],
          ]),
        ),
      },
    })
    let seen = 0
    const ships = await surveyHarbor(ports, '/repos', {
      progress: {
        onShip: () => {
          seen += 1
        },
        stop: () => seen >= 1,
      },
    })

    /*
     * Fewer than all of them, and not exactly one: the survey measures in lanes, so whatever had
     * already started finishes. Stopping is about the work not yet begun — the alternative is
     * abandoning readings that are already true.
     */
    expect(ships.length).toBeLessThan(names.length)
    expect(ships.length).toBeGreaterThanOrEqual(1)
  })

  /** Nobody stopping it is the ordinary case, and it must cost nothing. */
  it('measures everything where nobody says stop', async () => {
    const ports = mockPorts({
      dirs: { '/repos': ['a'], '/repos/a': [], '/repos/a/.git': [] },
    })

    await expect(surveyHarbor(ports, '/repos', { progress: {} })).resolves.toHaveLength(1)
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

  /**
   * An unreadable root and an empty one both yield zero ships, and only one of them is a fault:
   * reporting them alike hides a misconfiguration behind an empty harbour, and a typo in a second
   * root would quietly halve the fleet.
   */
  it('says a root it cannot read, rather than answering nothing', async () => {
    await expect(findShipPaths(mockPorts(), '/nope')).rejects.toThrow('Wurzel nicht lesbar')
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
   * `kombuese/addons/AddOns`: somebody grouped two projects in a folder, and the old search
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
   * one — nine foreign deployments under `Leuchtturm/deployment/configurations` alone. They
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
   * Copies on this machine are made by suffixing — `portmod_`, `altnetz-new`, `AddOns_`. Until
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

  it('tells a root it cannot read from one that is simply empty', async () => {
    await expect(findShipPaths(mockPorts(), '/nirgends')).rejects.toThrow('Wurzel nicht lesbar')
    await expect(
      findShipPaths(mockPorts({ dirs: { '/leer': [] } }), '/leer'),
    ).resolves.toStrictEqual([])
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
        /*
         * A remote per ship, because the mock's command map is keyed by the command alone and
         * would otherwise hand eleven repositories the same `origin` — at which point
         * `foldAliases` is right to call them one project, and this fleet collapses to a single
         * ship. It did, and that is how the fold got its first real test.
         */
        if (cwd !== undefined && [command, ...args].join(' ') === 'git remote -v') {
          const name = cwd.split('/').at(-1) ?? 'ship'
          return {
            code: 0,
            stderr: '',
            stdout: `origin\tgit@github.com:org/${name}.git (fetch)`,
          }
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

  /**
   * A share needs a denominator, and a caller that guessed one from its own last snapshot would
   * be wrong exactly when it matters: the first survey of a machine, or the one right after a
   * repository was cloned. It arrives before the first ship does, so a bar can start at nought.
   */
  it('says how many there are before it measures the first one', async () => {
    const { ports } = fleet(5)
    const order: string[] = []

    await surveyHarbor(ports, ROOT, {
      progress: {
        onCount: (total) => order.push(`count:${String(total)}`),
        onShip: (ship) => order.push(ship.name),
      },
    })

    expect(order[0]).toBe('count:5')
    expect(order).toHaveLength(6)
  })

  it('counts a directory the register adopted, like any other', async () => {
    const { ports } = fleet(2)
    let total = 0

    await surveyHarbor(ports, ROOT, {
      register: { archived: [], enlisted: [], roots: [] },
      progress: { onCount: (count) => (total = count) },
    })

    expect(total).toBe(2)
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

describe('two directories, one project', () => {
  /**
   * Measured on this machine: `kombuese/addons/AddOns` is linked into five game directories and
   * drew as six identical ships of 948 days, filling a third of the basin with one repository. A
   * link is invisible to every other call here — `isDirectory` follows one without saying so.
   */
  it('counts a repository reached through a link once, at its real path', async () => {
    const real = `${ROOT}/sources/addons`
    const ports = mockPorts({
      dirs: {
        [ROOT]: ['sources', 'games'],
        [`${ROOT}/sources`]: ['addons'],
        [real]: [],
        [`${real}/.git`]: [],
        [`${ROOT}/games`]: ['one', 'two'],
        [`${ROOT}/games/one`]: [],
        [`${ROOT}/games/one/.git`]: [],
        [`${ROOT}/games/two`]: [],
        [`${ROOT}/games/two/.git`]: [],
      },
      links: { [`${ROOT}/games/one`]: real, [`${ROOT}/games/two`]: real },
    })

    await expect(findAcrossRoots(ports, [ROOT])).resolves.toStrictEqual([real])
  })

  /**
   * The other half, and it cannot be answered before measuring: the only thing that says two
   * separate clones belong together is what each of them reports as `origin`. Measured on this
   * machine: `takel` beside `takel_local`, `peilung-app` beside `peilung-app-old`.
   */
  it('folds two checkouts of one remote into one ship and an alias', async () => {
    const ports = mockPorts({
      dirs: {
        [ROOT]: ['org'],
        [`${ROOT}/org`]: ['ship', 'ship_local'],
        [`${ROOT}/org/ship`]: [],
        [`${ROOT}/org/ship/.git`]: [],
        [`${ROOT}/org/ship_local`]: [],
        [`${ROOT}/org/ship_local/.git`]: [],
      },
      commands: gitCommands(),
      now: NOW,
    })

    const ships = await surveyHarbor(ports, ROOT)

    expect(ships).toHaveLength(1)
    expect(ships[0]?.path).toBe(`${ROOT}/org/ship`)
    expect(ships[0]?.aliases).toStrictEqual([`${ROOT}/org/ship_local`])
  })

  /**
   * Never without a remote. Nothing about two unrelated directories says they are one project, and
   * guessing from the name would fold two unrelated `notes` together.
   */
  it('leaves two remoteless directories alone', async () => {
    const ports = mockPorts({
      dirs: {
        [ROOT]: ['org'],
        [`${ROOT}/org`]: ['notes', 'notes_alt'],
        [`${ROOT}/org/notes`]: [],
        [`${ROOT}/org/notes/.git`]: [],
        [`${ROOT}/org/notes_alt`]: [],
        [`${ROOT}/org/notes_alt/.git`]: [],
      },
      commands: gitCommands({ 'git remote -v': '' }),
      now: NOW,
    })

    const ships = await surveyHarbor(ports, ROOT)

    expect(ships).toHaveLength(2)
    expect(ships[0]?.aliases).toBeUndefined()
  })
})

describe(countLines, () => {
  /** One line per text file: `HEAD:<path>:<count>`, and a path may hold colons. */
  it('adds up what git reported', () => {
    expect(countLines('HEAD:src/a.ts:12\nHEAD:src/b.ts:30')).toBe(42)
    expect(countLines('HEAD:weird:name:7')).toBe(7)
  })

  /** No answer and no lines are two different things and must not look alike. */
  it('says nothing where git said nothing', () => {
    expect(countLines(null)).toBeNull()
    expect(countLines('')).toBe(0)
  })

  it('ignores a line that carries no count', () => {
    expect(countLines('HEAD:src/a.ts:5\nkaputt')).toBe(5)
  })
})
