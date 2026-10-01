import { mockPorts, readQuestCatalog, renderQuest } from '@hafen/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nodePorts } from './adapters/node'
import { BUILTIN_STORE, DEFAULT_ROOT, DEFAULT_STORE, main, USAGE } from './command'

import type { MockSetup, Ports, ProcPort, Quest } from '@hafen/core'

const ROOT = '/repos'
const STORE = '/store'

/**
 * Several mock setups as one.
 *
 * Spelled out rather than spread, because a spread of two setups silently drops one side's `dirs`
 * for the other's — which is how this spec first "proved" that a ship's own quest wins over the
 * catalog: the store simply was not readable.
 */
function combine(...setups: readonly MockSetup[]): MockSetup {
  return setups.reduce<MockSetup>(
    (into, setup) => ({
      ...into,
      ...setup,
      dirs: { ...into.dirs, ...setup.dirs },
      files: { ...into.files, ...setup.files },
      commands: { ...into.commands, ...setup.commands },
    }),
    {},
  )
}

function quest(id: string, overrides: Partial<Quest> = {}): Quest {
  return {
    id,
    chain: 'werft',
    title: id,
    requires: [],
    appliesTo: [],
    checks: [],
    why: 'weil es die Flotte fordert',
    ...overrides,
  }
}

/** An empty but readable root: the harbor's contents are core's concern, not this module's. */
function ports(setup: MockSetup = {}): Ports {
  return mockPorts({ ...setup, dirs: { [ROOT]: [], ...setup.dirs } })
}

/** A root with one ship, for the answers that are about a ship arriving at all. */
function withShip(setup: MockSetup = {}): Ports {
  return mockPorts({
    ...setup,
    dirs: {
      [ROOT]: ['org'],
      [`${ROOT}/org`]: ['ship'],
      [`${ROOT}/org/ship`]: [],
      [`${ROOT}/org/ship/.git`]: [],
      ...setup.dirs,
    },
  })
}

/**
 * A ship that is a node project, so a quest bound to `gilt_fuer: [node]` actually applies.
 *
 * Without the manifest the survey is right to answer `notApplicable`, and a test that accepts
 * that verdict proves only that the quest was listed — not that anything was measured.
 */
function nodeShip(scripts: Record<string, string>, ...setups: readonly MockSetup[]): Ports {
  return withShip(
    combine(
      {
        files: { [`${ROOT}/org/ship/package.json`]: JSON.stringify({ scripts }) },
        commands: { 'git ls-files -z -- *package.json': { stdout: 'package.json' } },
      },
      ...setups,
    ),
  )
}

/** A quest bound to node projects, measured by whether anything fills the role. */
function roleQuest(id: string, role: string): Quest {
  return quest(id, {
    appliesTo: ['node'],
    checks: [{ probe: 'rolle', kind: 'datei', args: { rolle: role }, question: null }],
  })
}

/** What a ship keeps in its own store, under the same layout as the fleet's. */
function shipStoring(quests: readonly Quest[]): MockSetup {
  return {
    dirs: {
      [`${ROOT}/org/ship/.hafen/quests`]: ['werft'],
      [`${ROOT}/org/ship/.hafen/quests/werft`]: quests.map((entry) => `${entry.id}.md`),
    },
    files: Object.fromEntries(
      quests.map((entry) => [
        `${ROOT}/org/ship/.hafen/quests/werft/${entry.id}.md`,
        renderQuest(entry),
      ]),
    ),
  }
}

/** A store holding one quest, under the layout `readQuestCatalog` reads. */
function storing(quests: readonly Quest[], extra: Record<string, string> = {}): MockSetup {
  return {
    dirs: {
      [`${STORE}/quests`]: ['werft'],
      [`${STORE}/quests/werft`]: quests.map((entry) => `${entry.id}.md`),
    },
    files: {
      ...Object.fromEntries(
        quests.map((entry) => [`${STORE}/quests/werft/${entry.id}.md`, renderQuest(entry)]),
      ),
      ...extra,
    },
  }
}

/**
 * Everything written to a stream, as one string.
 *
 * The chunks are collected here rather than read back off `spy.mock.calls`, because
 * `process.stdout.write` is overloaded and the spy's call tuple comes out as `any` — a dozen
 * unchecked member accesses in a file whose whole job is to check what was written.
 */
function capture(stream: 'stdout' | 'stderr'): () => string {
  const chunks: string[] = []
  vi.spyOn(process[stream], 'write').mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return () => chunks.join('')
}

const out = (): (() => string) => capture('stdout')
const err = (): (() => string) => capture('stderr')

describe(main, () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints the usage and succeeds when asked for nothing', async () => {
    const stdout = out()

    await expect(main([], ports())).resolves.toBe(0)
    expect(stdout()).toBe(USAGE)
  })

  /** A command nobody has is a mistake, and the exit code is the only way a script hears it. */
  it('prints the usage and fails on a command it does not have', async () => {
    const stdout = out()

    await expect(main(['musterung'], ports())).resolves.toBe(2)
    expect(stdout()).toBe(USAGE)
  })

  it('draws the harbor as text', async () => {
    const stdout = out()

    await expect(main(['hafen', ROOT], ports())).resolves.toBe(0)
    expect(stdout()).toContain('HAFEN')
  })

  it('answers as JSON when asked', async () => {
    const stdout = out()

    await main(['hafen', ROOT, '--json'], withShip())

    expect(JSON.parse(stdout()) as unknown[]).toStrictEqual([
      expect.objectContaining({ name: 'ship', org: 'org' }),
    ])
  })

  it('carries the time and the root in a snapshot, beside the ships', async () => {
    const stdout = out()
    const now = new Date('2026-09-29T12:00:00Z')

    await expect(main(['schnappschuss', ROOT], withShip({ now }))).resolves.toBe(0)
    expect(JSON.parse(stdout()) as unknown).toStrictEqual({
      at: now.toISOString(),
      root: ROOT,
      ships: [expect.objectContaining({ name: 'ship' })],
    })
  })

  it('falls back to the default root and store when given neither', async () => {
    const stdout = out()

    // Nothing is readable there in a mock, and an unreadable root is a fault worth throwing.
    await expect(main(['hafen'], mockPorts())).rejects.toThrow(DEFAULT_ROOT)
    expect(USAGE).toContain(DEFAULT_STORE)
    expect(stdout()).toBe('')
  })

  it('measures the fleet against the catalog it was pointed at', async () => {
    const stdout = out()

    await main(
      ['hafen', ROOT, `--store=${STORE}`, '--json'],
      nodeShip({ 'test:lint': 'eslint .' }, storing([roleQuest('lint', 'lint')])),
    )

    const [ship] = JSON.parse(stdout()) as [{ quests: { id: string; verdict: string }[] }]

    // The verdict and not just the id: a listed quest proves nothing was measured.
    expect(ship.quests).toStrictEqual([expect.objectContaining({ id: 'lint', verdict: 'met' })])
  })

  it('reports a demand the ship does not meet as violated', async () => {
    const stdout = out()

    await main(
      ['hafen', ROOT, `--store=${STORE}`, '--json'],
      nodeShip({ build: 'vite build' }, storing([roleQuest('lint', 'lint')])),
    )

    const [ship] = JSON.parse(stdout()) as [{ quests: { verdict: string }[] }]

    expect(ship.quests[0]?.verdict).toBe('violated')
  })

  /**
   * "Beides, der Katalog fuehrt": a ship may add a demand and never weaken one. The rule lives in
   * `catalog.ts`; this is the seam that has to actually read the ship's own store.
   */
  it('folds in what a ship demands of itself, and says which quest that was', async () => {
    const stdout = out()

    await main(
      ['hafen', ROOT, `--store=${STORE}`, '--json'],
      nodeShip(
        { 'test:lint': 'eslint .' },
        storing([roleQuest('lint', 'lint')]),
        shipStoring([roleQuest('dav-schema', 'e2e')]),
      ),
    )

    const [ship] = JSON.parse(stdout()) as [
      { quests: { id: string; verdict: string }[]; ownQuests: string[] },
    ]

    expect(ship.quests).toStrictEqual([
      expect.objectContaining({ id: 'dav-schema', verdict: 'violated' }),
      expect.objectContaining({ id: 'lint', verdict: 'met' }),
    ])
    expect(ship.ownQuests).toStrictEqual(['dav-schema'])
  })

  /** The one time the rule bites has to be visible, or it is not a rule. */
  it('drops a ship quest that renames one the catalog already demands, and says so', async () => {
    const stdout = out()

    await main(
      ['hafen', ROOT, `--store=${STORE}`, '--json'],
      nodeShip(
        { 'test:lint': 'eslint .' },
        storing([roleQuest('lint', 'lint')]),
        // The ship demands the same id against a role it happens to fill — a weakening.
        shipStoring([roleQuest('lint', 'unit')]),
      ),
    )

    const [ship] = JSON.parse(stdout()) as [
      {
        quests: { id: string; verdict: string }[]
        overriddenQuests: string[]
        ownQuests: string[]
      },
    ]

    expect(ship.quests).toStrictEqual([expect.objectContaining({ id: 'lint', verdict: 'met' })])
    expect(ship.overriddenQuests).toStrictEqual(['lint'])
    expect(ship.ownQuests).toStrictEqual([])
  })

  /** No demands shown means no ship owes anything — which is not the same as meeting everything. */
  it('measures nothing where no catalog was handed in', async () => {
    const stdout = out()

    await main(['hafen', ROOT, `--store=${STORE}`, '--json'], withShip())

    const [ship] = JSON.parse(stdout()) as [{ quests: unknown[] }]

    expect(ship.quests).toStrictEqual([])
  })

  /**
   * Reported and never swallowed: a quest file with a typo is a demand the whole fleet silently
   * stops being held to, and the only sign of it would be a number going down.
   */
  it('names a quest file that did not read as one', async () => {
    out()
    const stderr = err()

    await main(
      ['hafen', ROOT, `--store=${STORE}`],
      withShip({
        dirs: {
          [`${STORE}/quests`]: ['werft'],
          [`${STORE}/quests/werft`]: ['kaputt.md'],
        },
        files: { [`${STORE}/quests/werft/kaputt.md`]: 'kein Frontmatter' },
      }),
    )

    expect(stderr()).toContain(`! keine lesbare Quest: ${STORE}/quests/werft/kaputt.md`)
  })

  /**
   * A directory the survey cannot find is a decision, so it comes out of the register — the one
   * place that holds decisions rather than measurements.
   */
  it('takes enlisted directories out of the register', async () => {
    const stdout = out()

    await main(
      ['hafen', ROOT, `--store=${STORE}`, '--json'],
      ports({
        dirs: { '/elsewhere/thing': [] },
        files: { [`${STORE}/register.md`]: '## Aufgenommen\n\n- /elsewhere/thing\n' },
      }),
    )

    expect(JSON.parse(stdout()) as unknown[]).toStrictEqual([
      expect.objectContaining({ path: '/elsewhere/thing' }),
    ])
  })

  it('surveys without a register rather than failing for the want of one', async () => {
    const stdout = out()

    await expect(main(['hafen', ROOT, `--store=${STORE}`], ports())).resolves.toBe(0)
    expect(stdout()).toContain('HAFEN')
  })

  it('shows the evidence when asked for it', async () => {
    const stdout = out()

    await main(
      ['hafen', ROOT, '--evidenz', `--store=${STORE}`],
      nodeShip({ 'test:lint': 'eslint .' }, storing([roleQuest('lint', 'lint')])),
    )

    // What was asked and what stood there — only the verbose form prints it.
    expect(stdout()).toContain('misst die Rolle lint')
    expect(stdout()).toContain('test:lint')
  })

  describe('punkte', () => {
    /** Own work is counted against the configured address, which is one process and not ninety. */
    it('scores the fleet against the configured identity', async () => {
      const stdout = out()
      const log = ['me@x\u0000feat: meins\u0000abc', 'other@x\u0000fix: fremd\u0000abc'].join('\n')

      await main(
        ['punkte', ROOT, `--store=${STORE}`],
        nodeShip(
          {},
          {
            commands: {
              'git config --get user.email': { stdout: 'me@x\n' },
              'git log --format=%ae%x00%s%x00%P': { stdout: log },
            },
          },
        ),
      )

      expect(stdout()).toContain('PROJEKTPUNKTE')
      expect(stdout()).toContain('DEINE PUNKTE')
    })

    /**
     * Without an address every commit counts as somebody else's, so the command says which
     * measurement is missing instead of printing a zero.
     */
    it('says what it cannot know when no address is configured', async () => {
      const stdout = out()

      await main(
        ['punkte', ROOT, `--store=${STORE}`],
        nodeShip({}, { commands: { 'git config --get user.email': { code: 1, stdout: '' } } }),
      )

      expect(stdout()).toContain('Keine eigene Adresse bekannt')
    })

    it('answers as JSON when asked, with the raw counts and no points', async () => {
      const stdout = out()

      await main(
        ['punkte', ROOT, `--store=${STORE}`, '--json'],
        nodeShip({}, { commands: { 'git config --get user.email': { stdout: 'me@x\n' } } }),
      )

      const answer = JSON.parse(stdout()) as { ships: { ledger: unknown }[] }

      expect(answer.ships[0]).toHaveProperty('ledger')
      expect(stdout()).not.toContain('"points"')
    })
  })

  /**
   * The harbor measures and draws — it changes no repository. Asserted against the port rather
   * than trusted: this is the promise the whole tool rests on, and it runs in eighty-odd working
   * trees that mostly are not ours alone.
   *
   * The promise used to add "and it goes nowhere near a network". That half is gone, deliberately:
   * `hafen forge` asks GitHub and Gitea what they say about these repositories. What did **not**
   * change is the half that matters — every one of those calls is a question. `gh api graphql` and
   * a `curl` GET read; nothing here posts, patches or deletes. So the list below covers both
   * commands, and the network calls are in it by name.
   *
   * An allow list and deliberately not a list of forbidden verbs, because the two fail in
   * opposite directions. A forbidden-verb list with one gap lets a write through in silence,
   * while an allow list at worst trips over a new *reading* call — a line in this test rather
   * than a commit in somebody else's repository. `git worktree list` is the proof: matching the
   * word `worktree` called a read a write. It has earned its keep three times since, most
   * recently on `git for-each-ref`.
   */
  it('runs nothing but reads', async () => {
    const reading: readonly string[] = [
      'git remote -v',
      'git rev-parse',
      'git status --porcelain',
      'git log -1',
      'git worktree list --porcelain',
      'git rev-list --count',
      'git ls-files -z',
      // Added when the working tree and the stash became measurements: this list noticed it,
      // which is the whole reason it is an allow list.
      'git stash list',
      // Added with the ledger: the whole history in one call, and the identity to compare it
      // against. This list noticed both, which is the whole reason it is an allow list.
      'git log --format=',
      'git config --get user.email',
      // Added with the branches and the carried repositories. Every one of them a question: what
      // refs are here, which of them the default contains, what the remote calls its default, and
      // which submodules are checked out where.
      'git for-each-ref --format=',
      'git branch --merged',
      'git symbolic-ref --short refs/remotes/origin/HEAD',
      /*
       * Added with the size reading: `git grep -I -c '' HEAD` counts the lines of every text file
       * in the tree, and the `-I` leaves git to decide what is binary. A search is a question —
       * and this list noticed it before anybody had to think about it, which is the whole reason
       * it is an allow list.
       */
      'git grep -I -c',
      'git submodule status',
      // The forge reading, and the only two that leave this machine. Both are GETs: a GraphQL
      // *query* has no side effect by definition, and `curl` is given no method and no body.
      'gh api graphql -f query=query(',
      'curl --silent --fail',
    ]

    out()
    const run = vi.fn<ProcPort['run']>(async () =>
      Promise.resolve({ code: 0, stdout: '', stderr: '' }),
    )
    const base = nodeShip({ 'test:lint': 'eslint .' }, storing([roleQuest('lint', 'lint')]))

    const watched = { ...base, proc: { ...base.proc, run } }
    await main(['hafen', ROOT, `--store=${STORE}`], watched)
    // The network command too, because that is the half of the promise that just moved.
    await main(['forge', ROOT, `--store=${STORE}`], watched)

    expect(run.mock.calls.length).toBeGreaterThan(0)

    for (const [command, args] of run.mock.calls) {
      const invocation = `${command} ${args.join(' ')}`

      expect(
        reading.some((allowed) => invocation.startsWith(allowed)),
        `nicht als lesend bekannt: ${invocation}`,
      ).toBe(true)
    }
  })
})

describe('register', () => {
  /**
   * The only thing this tool writes, and the reason it writes it here rather than in the window's
   * shell: the register's format then has one implementation. A Rust half that knew the file would
   * be a second opinion about a file both of them edit.
   */
  it('puts a repository away and says so', async () => {
    const setup = ports()
    const stdout = out()

    await expect(
      main(['register', 'archivieren', '/repos/org/ship', `--store=${STORE}`], setup),
    ).resolves.toBe(0)

    const written = await setup.fs.readFile(`${STORE}/register.md`)

    expect(written).toContain('/repos/org/ship')
    expect(stdout()).toContain('archivieren')
  })

  /** Fetching it back is the same file with one line fewer, not a second kind of entry. */
  it('takes it out again', async () => {
    const setup = ports({
      files: { [`${STORE}/register.md`]: '# R\n\n## Archiviert\n\n- /repos/org/ship\n' },
    })
    out()

    await expect(
      main(['register', 'reaktivieren', '/repos/org/ship', `--store=${STORE}`], setup),
    ).resolves.toBe(0)
    await expect(setup.fs.readFile(`${STORE}/register.md`)).resolves.not.toContain(
      '- /repos/org/ship',
    )
  })

  it('adopts a directory the survey would not find, and drops it again', async () => {
    const setup = ports()
    out()

    await expect(
      main(['register', 'aufnehmen', '/anderswo/ding', `--store=${STORE}`], setup),
    ).resolves.toBe(0)
    await expect(setup.fs.readFile(`${STORE}/register.md`)).resolves.toContain('/anderswo/ding')

    await expect(
      main(['register', 'entfernen', '/anderswo/ding', `--store=${STORE}`], setup),
    ).resolves.toBe(0)
    await expect(setup.fs.readFile(`${STORE}/register.md`)).resolves.not.toContain(
      '- /anderswo/ding',
    )
  })

  /** A word it does not know is a refusal, never a guess at which of the four was meant. */
  it('refuses an action it does not know, and a missing path', async () => {
    const stderr = err()

    await expect(main(['register', 'verschrotten', '/repos/org/ship'], ports())).resolves.toBe(2)
    await expect(main(['register', 'archivieren'], ports())).resolves.toBe(2)

    expect(stderr()).toContain('archivieren')
  })

  /** A write that failed is reported and not swallowed: the caller asked for a change. */
  it('says why nothing was written', async () => {
    const base = ports()
    const broken: Ports = {
      ...base,
      // eslint-disable-next-line @typescript-eslint/require-await -- a port, not a caller
      fs: { ...base.fs, writeFile: async () => 'Platte voll' },
    }
    const stderr = err()

    await expect(main(['register', 'archivieren', '/x', `--store=${STORE}`], broken)).resolves.toBe(
      1,
    )
    expect(stderr()).toContain('Platte voll')
  })

  it('answers with the register itself where asked to', async () => {
    const stdout = out()

    await expect(
      main(['register', 'archivieren', '/x', '--json', `--store=${STORE}`], ports()),
    ).resolves.toBe(0)
    expect(JSON.parse(stdout()) as { archived: string[] }).toStrictEqual({
      archived: ['/x'],
      enlisted: [],
    })
  })
})

describe('schnappschuss --nur', () => {
  /**
   * For the window's per-project refresh. A full survey is ninety repositories and some seconds,
   * and asking for all of them to learn what one just did is the reason refreshing felt like
   * something to avoid. The shape of the answer is the same either way, so the caller splices by
   * path and needs no second format.
   */
  it('measures one repository and answers in the same shape', async () => {
    const stdout = out()

    await expect(
      main(['schnappschuss', ROOT, `--nur=${ROOT}/org/ship`, `--store=${STORE}`], withShip()),
    ).resolves.toBe(0)

    const answer = JSON.parse(stdout()) as { ships: { path: string }[]; at: string }

    expect(answer.ships).toHaveLength(1)
    expect(answer.ships[0]?.path).toBe(`${ROOT}/org/ship`)
    expect(answer.at).not.toBe('')
  })

  /**
   * `--fortschritt` reports to stderr while the survey runs: the count first, then one line per
   * repository as it lands.
   *
   * On stderr because stdout carries the snapshot and nothing else — a caller that reads the
   * answer by piping it must not have to filter progress out of it. The window is the caller this
   * exists for: it had no way to say anything but "misst …" for six seconds.
   */
  it('reports the count and then every ship, on stderr', async () => {
    const stdout = out()
    const stderr = err()

    await expect(
      main(['schnappschuss', ROOT, '--fortschritt', `--store=${STORE}`], withShip()),
    ).resolves.toBe(0)

    const lines = stderr().trim().split('\n')

    expect(JSON.parse(lines[0] ?? '{}')).toStrictEqual({ of: 1 })
    expect(JSON.parse(lines[1] ?? '{}')).toStrictEqual({ at: 1, path: `${ROOT}/org/ship` })
    // The answer itself is untouched by it.
    expect((JSON.parse(stdout()) as { ships: unknown[] }).ships).toHaveLength(1)
  })

  it('says nothing about progress unless it was asked to', async () => {
    const stderr = err()

    await expect(main(['schnappschuss', ROOT, `--store=${STORE}`], withShip())).resolves.toBe(0)

    expect(stderr()).toBe('')
  })

  /** An empty value is how a shell spells "unset" by accident, and must not mean "measure /". */
  it('treats an empty --nur as no --nur', async () => {
    const stdout = out()

    await expect(
      main(['schnappschuss', ROOT, '--nur=', `--store=${STORE}`], withShip()),
    ).resolves.toBe(0)
    expect((JSON.parse(stdout()) as { ships: unknown[] }).ships).toHaveLength(1)
  })
})

describe('schnappschuss --forge', () => {
  /**
   * The survey still asks nobody anything: this is the file `hafen forge` wrote, read off the
   * disk. It exists because some demands cannot be answered from a working tree at all.
   */
  it('reads the forge file it is pointed at', async () => {
    const stdout = out()
    const reading = {
      at: '2026-10-01T00:00:00Z',
      stats: [
        {
          slug: { host: 'github.com', owner: 'org', repo: 'ship' },
          stars: 3,
          watchers: 0,
          forks: 0,
          issues: 0,
          pulls: 0,
          language: null,
          guard: { pullRequest: true, statusChecks: true, source: 'ruleset', admin: false },
        },
      ],
      unread: [],
    }
    const withForge = withShip()
    withForge.fs.readFile = async (path: string) =>
      Promise.resolve(path === '/tmp/forge.json' ? JSON.stringify(reading) : null)

    await expect(
      main(['schnappschuss', ROOT, '--forge=/tmp/forge.json', `--store=${STORE}`], withForge),
    ).resolves.toBe(0)

    expect(stdout()).toContain('"ships"')
  })

  /** An empty value is how a caller says "measure the disk and nothing else". */
  it('takes an empty --forge as none', async () => {
    const stdout = out()

    await expect(
      main(['schnappschuss', ROOT, '--forge=', `--store=${STORE}`], withShip()),
    ).resolves.toBe(0)
    expect((JSON.parse(stdout()) as { ships: unknown[] }).ships).toHaveLength(1)
  })
})

describe('the catalog that travels with the tool', () => {
  /**
   * A fresh checkout used to measure against no demands at all: the catalog lived in a store
   * somebody had to create first, so every quest verdict was simply absent. Read off the real
   * directory with the real adapter, because "it ships with the tool" is a claim about the disk.
   */
  it('ships a readable catalog in the repository', async () => {
    const catalog = await readQuestCatalog(nodePorts.fs, BUILTIN_STORE)

    expect(catalog.unreadable).toStrictEqual([])
    expect(catalog.quests.map((one) => one.id)).toContain('lint')
    expect(catalog.quests.length).toBeGreaterThan(5)
  })

  /** The built-in catalog leads and the store adds — and a repeated id is said out loud. */
  it('says which ids a store repeats', async () => {
    const stderr = err()
    const lint = roleQuest('lint', 'lint')
    const mine = storing([lint])
    const both = {
      dirs: {
        ...mine.dirs,
        [`${BUILTIN_STORE}/quests`]: ['werft'],
        [`${BUILTIN_STORE}/quests/werft`]: ['lint.md'],
      },
      files: {
        ...mine.files,
        [`${BUILTIN_STORE}/quests/werft/lint.md`]: renderQuest(lint),
      },
    }

    await expect(
      main(
        ['schnappschuss', ROOT, `--store=${STORE}`],
        nodeShip({ 'test:lint': 'eslint .' }, both),
      ),
    ).resolves.toBe(0)

    expect(stderr()).toContain('fordert 1 Id(s) erneut')
    expect(stderr()).toContain('lint')
  })
})
