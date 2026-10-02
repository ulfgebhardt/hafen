import { describe, expect, it, vi } from 'vitest'

import { mockContract, mockPorts } from './mock'
import { measureQuests, namedInCi, runCheck } from './probe'

import type { QuestFacts } from './probe'
import type { Quest, QuestCheck } from './quest'

function check(
  probe: string,
  args: Record<string, string> = {},
  kind: QuestCheck['kind'] = 'datei',
): QuestCheck {
  return { probe, kind, args, question: null }
}

/**
 * `count` workflow files, contents irrelevant.
 *
 * Most of these specs assert the *count* and the "are there any at all" split; the ones that
 * care what is inside pass a body.
 */
function ciFiles(count: number, body = 'name: ci\n'): readonly string[] {
  return Array.from({ length: count }, () => body)
}

function facts(overrides: Partial<QuestFacts> = {}): QuestFacts {
  return {
    contract: mockContract(),
    traits: ['node'],
    files: new Map(),
    dependencies: [],
    workflows: ciFiles(0),
    forge: null,
    ...overrides,
  }
}

function quest(checks: readonly QuestCheck[], appliesTo: Quest['appliesTo'] = []): Quest {
  return { id: 'q', chain: 'werft', title: 'q', requires: [], appliesTo, checks, why: '' }
}

/** What `git ls-files` says when a Tauri config is in the tree, NUL-separated as git writes it. */
const LISTS_TAURI = {
  'git ls-files -z -- *tauri.conf.json': {
    stdout: 'apps/harbor/src-tauri/tauri.conf.json\0',
  },
}

describe(runCheck, () => {
  describe('rolle', () => {
    it('finds the role under whatever name the project gave it', () => {
      const contract = mockContract({
        scripts: { lint: true, typecheck: false, unit: false, e2e: false },
        members: [{ dir: '.', checks: [{ script: 'lint', role: 'lint', delegates: false }] }],
      })

      expect(
        runCheck(check('rolle', { rolle: 'lint' }), facts({ contract, workflows: ciFiles(2) })),
      ).toStrictEqual({
        ok: true,
        evidence: {
          question: 'irgendetwas misst die Rolle lint',
          where: '1 Manifest, 2 Workflows',
          found: 'lint',
        },
      })
    })

    it('counts a role only the CI measures — that is a Rust crate with clippy', () => {
      const contract = mockContract({ kind: 'other', members: [], inCi: ['lint'] })
      const result = runCheck(
        check('rolle', { rolle: 'lint' }),
        facts({ contract, workflows: ciFiles(1) }),
      )

      expect(result.ok).toBe(true)
      expect(result.evidence.found).toBe('kein Skript, aber die CI misst es')
    })

    it('cannot answer where there is neither a manifest nor a workflow', () => {
      // The whole reason `null` exists: reading "no package.json" as "declares no lint script" is
      // how the fixed list of four produced gaps that were not there.
      const contract = mockContract({ kind: 'other', members: [] })
      const result = runCheck(check('rolle', { rolle: 'lint' }), facts({ contract }))

      expect(result.ok).toBeNull()
      expect(result.evidence.found).toContain('nichts zu lesen')
    })

    it('names the member a check lives in, so evidence points somewhere', () => {
      const contract = mockContract({
        scripts: { lint: true, typecheck: false, unit: false, e2e: false },
        members: [
          { dir: '.', checks: [] },
          { dir: 'packages/ui', checks: [{ script: 'lint', role: 'lint', delegates: false }] },
        ],
      })

      expect(
        runCheck(check('rolle', { rolle: 'lint' }), facts({ contract, workflows: ciFiles(1) }))
          .evidence.found,
      ).toBe('lint (packages/ui)')
    })
  })

  describe('rolle-in-ci', () => {
    it('separates "no workflow runs it" from "there are no workflows"', () => {
      const contract = mockContract({ inCi: ['unit'] })

      expect(runCheck(check('rolle-in-ci', { rolle: 'lint' }), facts({ contract })).ok).toBeNull()
      expect(
        runCheck(
          check('rolle-in-ci', { rolle: 'lint' }),
          facts({ contract, workflows: ciFiles(3) }),
        ).ok,
      ).toBe(false)
      expect(
        runCheck(
          check('rolle-in-ci', { rolle: 'unit' }),
          facts({ contract, workflows: ciFiles(3) }),
        ).ok,
      ).toBe(true)
    })
  })

  describe('haus-name', () => {
    it('is only a question once there is a check to name', () => {
      // Answering `false` would report one absence twice — as the missing step and as the wrong
      // name — and make one gap look like two.
      expect(runCheck(check('haus-name', { rolle: 'lint' }), facts()).ok).toBeNull()
    })

    it("compares the project's own name against the house one", () => {
      const own = mockContract({
        scripts: { lint: true, typecheck: false, unit: false, e2e: false },
        members: [{ dir: '.', checks: [{ script: 'lint', role: 'lint', delegates: false }] }],
      })
      const house = mockContract({
        scripts: { lint: true, typecheck: false, unit: false, e2e: false },
      })

      expect(runCheck(check('haus-name', { rolle: 'lint' }), facts({ contract: own })).ok).toBe(
        false,
      )
      expect(runCheck(check('haus-name', { rolle: 'lint' }), facts({ contract: house })).ok).toBe(
        true,
      )
    })
  })

  describe('datei', () => {
    it('answers from what the survey read', () => {
      const files = new Map([['.tool-versions', 'nodejs 22.11.0\n']])

      expect(runCheck(check('datei', { datei: '.tool-versions' }), facts({ files })).ok).toBe(true)
      expect(
        runCheck(
          check('datei', { datei: 'eslint.config.ts' }),
          facts({ files: new Map([['eslint.config.ts', null]]) }),
        ).ok,
      ).toBe(false)
    })

    it('refuses a path the catalog was not allowed to read', () => {
      const result = runCheck(check('datei', { datei: '../../.ssh/id_ed25519' }), facts())

      expect(result.ok).toBeNull()
      expect(result.evidence.found).toBe('Pfad liegt nicht im Schiff')
    })
  })

  describe('datei-enthaelt', () => {
    const files = new Map([
      ['eslint.config.ts', "import it4c from 'eslint-config-it4c'\n"],
      ['prettier.config.ts', 'export default {}\n'],
      ['fehlt.ts', null],
    ])

    it('separates "not there" from "there and silent"', () => {
      const asked = (datei: string): string =>
        runCheck(check('datei-enthaelt', { datei, text: 'eslint-config-it4c' }), facts({ files }))
          .evidence.found

      expect(asked('eslint.config.ts')).toBe('nennt eslint-config-it4c')
      expect(asked('prettier.config.ts')).toBe('nennt eslint-config-it4c nicht')
      expect(asked('fehlt.ts')).toBe('nicht vorhanden')
    })
  })

  describe('ci-nennt', () => {
    /**
     * The case that forced this probe: release-please lives in `release.yml` in five of these
     * repositories, `release-please-lint.yml` in another, `ui-release.yml` in a third. A quest
     * naming one path would measure the file name instead of the practice.
     */
    it('finds a tool in whichever workflow happens to hold it', () => {
      const workflows = ['name: ci\n', 'name: release\nuses: googleapis/release-please-action@v4\n']

      expect(runCheck(check('ci-nennt', { text: 'release-please' }), facts({ workflows })).ok).toBe(
        true,
      )
    })

    it('says no where every workflow is silent about it', () => {
      const result = runCheck(
        check('ci-nennt', { text: 'release-please' }),
        facts({ workflows: ciFiles(3) }),
      )

      expect(result.ok).toBe(false)
      expect(result.evidence.found).toBe('nennt release-please nirgends')
      expect(result.evidence.where).toContain('3 Workflows')
    })

    /**
     * "No workflow says so" and "there are no workflows" are different sentences, and the second
     * is not a gap — the same split `rolle-in-ci` makes, and for the same reason.
     */
    it('cannot answer where there is no CI at all', () => {
      const result = runCheck(
        check('ci-nennt', { text: 'release-please' }),
        facts({ workflows: [] }),
      )

      expect(result.ok).toBeNull()
      expect(result.evidence.found).toContain('keine Workflows')
    })
  })

  describe('abhaengigkeit', () => {
    it('reads the declared packages, and says so when there is no manifest', () => {
      const asked = (given: Partial<QuestFacts>): ReturnType<typeof runCheck> =>
        runCheck(check('abhaengigkeit', { paket: 'eslint-config-it4c' }), facts(given))

      expect(asked({ dependencies: ['eslint-config-it4c', 'vitest'] }).ok).toBe(true)
      expect(asked({ dependencies: ['vitest'] }).ok).toBe(false)
      expect(asked({ contract: mockContract({ kind: 'other', members: [] }) }).ok).toBeNull()
    })
  })

  it('answers a manual check with the blind spot instead of a verdict', () => {
    const result = runCheck({ ...check('manuell'), kind: 'manuell' }, facts())

    expect(result.ok).toBeNull()
    expect(result.evidence.found).toBe('nicht maschinell prüfbar')
  })

  it('says which art and which probe it does not measure, rather than failing the ship', () => {
    expect(runCheck(check('antwortet', {}, 'http'), facts()).evidence.found).toContain(
      'Prüfart http',
    )
    expect(runCheck(check('erfunden'), facts()).evidence.found).toContain('kennt diese Werft nicht')
  })

  it('takes the question from the catalog where the demand says more than its measurement', () => {
    const asked = { ...check('datei', { datei: 'x' }), question: 'die Node-Version ist gepinnt' }

    expect(runCheck(asked, facts()).evidence.question).toBe('die Node-Version ist gepinnt')
  })
})

describe(measureQuests, () => {
  const SHIP = '/repos/org/ship'

  it('reads only what the catalog names, and counts the workflows', async () => {
    const ports = mockPorts({
      files: {
        [`${SHIP}/.github/workflows/a.yml`]: 'name: a\n',
        [`${SHIP}/.github/workflows/b.yaml`]: 'name: b\n',
        [`${SHIP}/.tool-versions`]: 'nodejs 22.11.0\n',
        [`${SHIP}/Cargo.toml`]: '[package]\n',
        [`${SHIP}/package.json`]: JSON.stringify({ devDependencies: { vitest: '^4' } }),
      },
      dirs: { [`${SHIP}/.github/workflows`]: ['a.yml', 'b.yaml', 'README.md'] },
      // Listed *and* readable: the facts carry the bodies now, so a directory entry with no
      // file behind it is correctly not a workflow.
    })

    const measured = await measureQuests(ports, SHIP, mockContract(), [
      quest([check('datei', { datei: '.tool-versions' }), check('datei', { datei: 'fehlt.txt' })]),
    ])

    expect([...measured.files.keys()]).toStrictEqual(['.tool-versions', 'fehlt.txt'])
    expect(measured.files.get('fehlt.txt')).toBeNull()
    expect(measured.workflows).toHaveLength(2)
    expect(measured.traits).toStrictEqual(['node', 'rust'])
    // Nothing asked for a dependency, so no manifest was parsed a second time for one.
    expect(measured.dependencies).toStrictEqual([])
  })

  /**
   * Asked of git and not of a list of likely places: the config sits at `src-tauri/` in one
   * repository and at `apps/<name>/src-tauri/` in the next, and a candidate list would be the
   * guess this tool refuses everywhere else it looks for a file.
   */
  it('finds the bundler config wherever git says it is', async () => {
    const measured = await measureQuests(
      mockPorts({ commands: LISTS_TAURI }),
      SHIP,
      mockContract(),
      [quest([check('ci-nennt', { text: 'includeUpdaterJson' })], ['tauri'])],
    )

    expect(measured.traits).toContain('tauri')
  })

  /**
   * A repository with no config is not a repository with a gap. A library ships no binary and owes
   * it no update path — `notApplicable`, which is what the trait is for.
   */
  it('does not call a repository without one a Tauri app', async () => {
    const measured = await measureQuests(mockPorts(), SHIP, mockContract(), [
      quest([check('ci-nennt', { text: 'includeUpdaterJson' })], ['tauri']),
    ])

    expect(measured.traits).not.toContain('tauri')
  })

  /**
   * One git call per repository is nothing; eighty-odd of them for a trait no quest gates on is a
   * cost paid for an answer nobody reads. Same discipline as the dependencies.
   */
  it('does not ask git at all when no quest gates on the trait', async () => {
    const ports = mockPorts({ commands: LISTS_TAURI })
    const run = vi.spyOn(ports.proc, 'run')

    const measured = await measureQuests(ports, SHIP, mockContract(), [
      quest([check('datei', { datei: 'README.md' })]),
    ])

    expect(measured.traits).not.toContain('tauri')
    expect(run).not.toHaveBeenCalled()
  })

  it('leaves a path out of the read list when it would climb out of the ship', async () => {
    const measured = await measureQuests(mockPorts(), SHIP, mockContract(), [
      quest([check('datei', { datei: '../secrets' }), check('datei', { datei: '/etc/passwd' })]),
    ])

    expect([...measured.files.keys()]).toStrictEqual([])
  })

  it('collects the dependencies of every member when a quest asks for one', async () => {
    const ports = mockPorts({
      files: {
        [`${SHIP}/package.json`]: JSON.stringify({
          devDependencies: { 'eslint-config-it4c': '^0' },
        }),
        [`${SHIP}/packages/ui/package.json`]: JSON.stringify({ dependencies: { vue: '^3' } }),
      },
    })
    const contract = mockContract({
      members: [
        { dir: '.', checks: [] },
        { dir: 'packages/ui', checks: [] },
      ],
    })

    const measured = await measureQuests(ports, SHIP, contract, [
      quest([check('abhaengigkeit', { paket: 'eslint-config-it4c' })]),
    ])

    expect(measured.dependencies).toStrictEqual(['eslint-config-it4c', 'vue'])
  })

  it('says a ship is neither node nor rust when it is neither', async () => {
    const measured = await measureQuests(
      mockPorts(),
      SHIP,
      mockContract({ kind: 'other', members: [] }),
      [],
    )

    expect(measured.traits).toStrictEqual([])
  })
})

describe('datei-eine-von', () => {
  const oneOf = (dateien: string): QuestCheck => check('datei-eine-von', { dateien })

  const seen = (files: Record<string, string | null>): QuestFacts =>
    facts({ files: new Map(Object.entries(files)) })

  /**
   * A licence is spelled `LICENSE`, `LICENSE.md`, `LICENCE` or `COPYING`. Measured over 44 node
   * repositories here: 16 carry the first and 10 the second, so a quest naming one path would
   * report a gap in ten repositories that do exactly what is asked.
   */
  it('is answered by whichever of them is there', () => {
    const result = runCheck(
      oneOf('LICENSE, LICENSE.md, COPYING'),
      seen({ LICENSE: null, 'LICENSE.md': 'MIT', COPYING: null }),
    )

    expect(result.ok).toBe(true)
    expect(result.evidence.found).toBe('LICENSE.md vorhanden')
  })

  it('says no where none of them is', () => {
    const result = runCheck(oneOf('LICENSE, COPYING'), seen({ LICENSE: null, COPYING: null }))

    expect(result.ok).toBe(false)
    expect(result.evidence.found).toBe('keine davon vorhanden')
  })

  /**
   * A catalog that named only paths this survey refuses has said nothing about the ship, and
   * `null` is what that is — the same rule `datei` follows for a path climbing out of the tree.
   */
  it('cannot say where no named path may be read', () => {
    expect(runCheck(oneOf('/etc/passwd, ../../.ssh/id_ed25519'), seen({})).ok).toBeNull()
    expect(runCheck(oneOf(''), seen({})).ok).toBeNull()
  })

  it('names every path it looked at, so the answer can be argued with', () => {
    const result = runCheck(oneOf('LICENSE, COPYING'), seen({ LICENSE: null, COPYING: null }))

    expect(result.evidence.where).toBe('LICENSE, COPYING')
  })
})

describe(namedInCi, () => {
  const workflow = [
    'jobs:',
    '  release-please:',
    '    steps:',
    '      - uses: googleapis/release-please-action@v5',
    '        with:',
    '          config-file: .github/release-please/config.json',
    '          manifest-file: ".github/release-please/manifest.json"',
  ].join('\n')

  /** The path is measured out of the workflow, not guessed from where people usually put it. */
  it('reads the path a workflow names under a key', () => {
    expect(namedInCi([workflow], 'config-file')).toBe('.github/release-please/config.json')
    expect(namedInCi([workflow], 'manifest-file')).toBe('.github/release-please/manifest.json')
  })

  it('says nothing where no workflow names it', () => {
    expect(namedInCi([workflow], 'gibt-es-nicht')).toBeNull()
    expect(namedInCi([], 'config-file')).toBeNull()
    expect(namedInCi([workflow], '')).toBeNull()
  })

  /**
   * A workflow is a file in somebody else's repository. It must not be able to make this survey
   * read outside the ship — the same refusal `wantedFiles` makes.
   */
  it('refuses a path that climbs out of the ship', () => {
    expect(namedInCi(['  config-file: ../../.ssh/id_ed25519'], 'config-file')).toBeNull()
    expect(namedInCi(['  config-file: /etc/passwd'], 'config-file')).toBeNull()
  })
})

describe('a configuration the CI points at', () => {
  const workflows = ['  with:\n    config-file: .github/release-please/config.json']

  /**
   * The failure this answers: two repositories on this fleet run release-please with the config
   * under `.github/release-please/`, and a quest naming the default path alone called both of
   * them a gap — while the workflow beside it said exactly where the file is.
   */
  it('reads the file where the workflow says it is', () => {
    const seenFacts: QuestFacts = {
      ...facts(),
      workflows,
      files: new Map([['.github/release-please/config.json', '{}']]),
    }

    const seen = runCheck(
      check('datei-aus-ci', { schluessel: 'config-file', sonst: 'release-please-config.json' }),
      seenFacts,
    )

    expect(seen.ok).toBe(true)
    expect(seen.evidence.where).toContain('.github/workflows')
  })

  /** Where no workflow names one, the tool's own default is the question — and it is said so. */
  it('falls back to the default and says that it did', () => {
    const seenFacts: QuestFacts = {
      ...facts(),
      workflows: ['  with:\n    token: x'],
      files: new Map([['release-please-config.json', '{}']]),
    }

    const seen = runCheck(
      check('datei-aus-ci', { schluessel: 'config-file', sonst: 'release-please-config.json' }),
      seenFacts,
    )

    expect(seen.ok).toBe(true)
    expect(seen.evidence.where).toContain('Vorgabe')
  })

  it('is unmeasured where neither a key nor a default was named', () => {
    expect(runCheck(check('datei-aus-ci', {}), facts()).ok).toBeNull()
  })

  /** A missing file is still a missing file, wherever the workflow pointed. */
  it('reports the gap where the named file is not there', () => {
    const seenFacts: QuestFacts = {
      ...facts(),
      workflows,
      files: new Map([['.github/release-please/config.json', null]]),
    }

    expect(runCheck(check('datei-aus-ci', { schluessel: 'config-file' }), seenFacts).ok).toBe(false)
  })
})

describe('whether anything here builds', () => {
  /** Read off the commands: `"bundle": "vite build"` builds and `"build": "turbo build"` delegates. */
  it('answers from the scripts and not from a name', () => {
    const builds = facts({ contract: mockContract({ builds: true }) })
    const not = facts({ contract: mockContract({ builds: false }) })

    expect(runCheck(check('baut'), builds).ok).toBe(true)
    expect(runCheck(check('baut'), not).ok).toBe(false)
  })

  /** No manifest is no answer: a repository with nothing to read owes no build either. */
  it('is unmeasured where there is no manifest at all', () => {
    const bare = facts({ contract: mockContract({ members: [] }) })

    expect(runCheck(check('baut'), bare).ok).toBeNull()
  })

  it('finds a build among the run steps of a workflow', () => {
    const ci = facts({ workflows: ['jobs:\n  x:\n    steps:\n      - run: pnpm vite build\n'] })

    expect(runCheck(check('baut-in-ci'), ci).ok).toBe(true)
  })

  /** And not in a job *called* build, which half the workflows on this fleet are. */
  it('does not take a job name for a build step', () => {
    const named = facts({ workflows: ['jobs:\n  build:\n    steps:\n      - run: pnpm test\n'] })

    expect(runCheck(check('baut-in-ci'), named).ok).toBe(false)
  })

  it('is unmeasured where the ship has no workflows', () => {
    expect(runCheck(check('baut-in-ci'), facts()).ok).toBeNull()
  })
})

describe('what guards the default branch', () => {
  const reading = (guard: unknown): QuestFacts =>
    facts({
      forge: {
        slug: { host: 'github.com', owner: 'o', repo: 'r' },
        stars: 0,
        watchers: 0,
        forks: 0,
        issues: 0,
        pulls: 0,
        language: null,
        guard,
      } as QuestFacts['forge'],
    })

  const asked = check('forge-schutz', { fordert: 'pull-request, status-checks' }, 'forge')

  /** The reading is a file somebody fetched, never a request this survey makes. */
  it('is unmeasured where nobody asked the forge', () => {
    const seen = runCheck(asked, facts())

    expect(seen.ok).toBeNull()
    expect(seen.evidence.found).toContain('hafen forge')
  })

  it('reads what the ruleset demands', () => {
    const guarded = reading({
      pullRequest: true,
      statusChecks: true,
      source: 'ruleset',
      admin: false,
    })

    expect(runCheck(asked, guarded).ok).toBe(true)
  })

  it('names what is missing rather than only failing', () => {
    const half = reading({ pullRequest: true, statusChecks: false, source: 'rule', admin: true })
    const seen = runCheck(asked, half)

    expect(seen.ok).toBe(false)
    expect(seen.evidence.found).toContain('status-checks')
  })

  /**
   * The distinction the whole field exists for: rulesets are public, the classic rule is not. An
   * empty answer from a repository we do not administer means "we may not look", and reading that
   * as a gap would be inventing one.
   */
  it('refuses to call a repository unguarded when it may not look', () => {
    const blind = reading({ pullRequest: false, statusChecks: false, source: 'none', admin: false })

    expect(runCheck(asked, blind).ok).toBeNull()
  })

  it('does call it unguarded where it could see everything', () => {
    const open = reading({ pullRequest: false, statusChecks: false, source: 'none', admin: true })

    expect(runCheck(asked, open).ok).toBe(false)
  })

  /** A reading written before this field existed carries no `guard` — and is not a finding. */
  it('takes an older reading as one that cannot answer', () => {
    expect(runCheck(asked, reading(undefined)).ok).toBeNull()
  })
})
