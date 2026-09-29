import { mockPorts, renderQuest } from '@hafen/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_ROOT, DEFAULT_STORE, main, USAGE } from './command'

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

  /**
   * The harbor measures and draws — it changes no repository, and it goes nowhere near a network.
   * Asserted against the port rather than trusted: this is the promise the whole tool rests on,
   * and it runs in eighty-odd working trees that mostly are not ours alone.
   *
   * An allow list and deliberately not a list of forbidden verbs, because the two fail in
   * opposite directions. A forbidden-verb list with one gap lets a write through in silence,
   * while an allow list at worst trips over a new *reading* call — a line in this test rather
   * than a commit in somebody else's repository. `git worktree list` is the proof: matching the
   * word `worktree` called a read a write.
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
    ]

    out()
    const run = vi.fn<ProcPort['run']>(async () =>
      Promise.resolve({ code: 0, stdout: '', stderr: '' }),
    )
    const base = nodeShip({ 'test:lint': 'eslint .' }, storing([roleQuest('lint', 'lint')]))

    await main(['hafen', ROOT, `--store=${STORE}`], { ...base, proc: { ...base.proc, run } })

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
