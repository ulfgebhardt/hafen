import { describe, expect, it } from 'vitest'

import { contractChecks, detectContract, hasChecks } from './contract'
import { mockPorts } from './mock'

import type { CommandMap } from './mock'

const SHIP = '/repos/org/ship'

function manifest(scripts: Record<string, string>): string {
  return JSON.stringify({ scripts })
}

/** `git ls-files` as the ship would answer it, NUL-separated like the real command. */
function tracked(...paths: readonly string[]): CommandMap {
  return { 'git ls-files -z -- *package.json': { stdout: paths.join('\0') } }
}

describe(detectContract, () => {
  it('reports every key as a gap when there is no manifest at all', async () => {
    const contract = await detectContract(mockPorts(), SHIP)

    expect(contract.scripts).toStrictEqual({
      lint: false,
      typecheck: false,
      unit: false,
      e2e: false,
    })
    expect(contract.gaps).toStrictEqual([])
    expect(contract.kind).toBe('other')
    expect(contract.devEntry).toBe('none')
    expect(contract.members).toStrictEqual([])
  })

  it('finds the manifest in a subdirectory, as kalender keeps it in app/', async () => {
    const ports = mockPorts({
      files: {
        [`${SHIP}/app/package.json`]: manifest({
          dev: 'nuxt dev',
          'test:lint': 'eslint .',
          'test:unit': 'vitest run',
        }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.scripts.lint).toBe(true)
    expect(contract.scripts.unit).toBe(true)
    expect(contract.gaps).toStrictEqual(['typecheck', 'e2e'])
    expect(contract.devEntry).toBe('script')
  })

  it('skips a malformed manifest instead of failing the whole survey', async () => {
    const ports = mockPorts({
      files: {
        [`${SHIP}/package.json`]: '{ this is not json',
        [`${SHIP}/app/package.json`]: manifest({ 'test:unit': 'vitest run' }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.scripts.unit).toBe(true)
  })

  it('falls back to docker-compose as the dev entry', async () => {
    const ports = mockPorts({
      files: {
        [`${SHIP}/package.json`]: manifest({ 'test:unit': 'vitest run' }),
        [`${SHIP}/docker-compose.yml`]: 'services: {}',
      },
    })

    expect((await detectContract(ports, SHIP)).devEntry).toBe('compose')
  })

  it('detects which contract scripts a CI workflow actually invokes', async () => {
    const ports = mockPorts({
      files: {
        [`${SHIP}/package.json`]: manifest({
          'test:lint': 'eslint .',
          'test:unit': 'vitest run',
        }),
        [`${SHIP}/.github/workflows/app.test.unit.code.yml`]:
          'jobs:\n  unit:\n    steps:\n      - run: npm run test:unit\n',
        [`${SHIP}/.github/workflows/release.yml`]: 'jobs:\n  release:\n    steps: []\n',
      },
      dirs: {
        [`${SHIP}/.github/workflows`]: ['app.test.unit.code.yml', 'release.yml', 'notes.md'],
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.inCi).toStrictEqual(['unit'])
  })

  it('treats a declared script that CI never runs as declared but not verified', async () => {
    const ports = mockPorts({
      files: {
        [`${SHIP}/package.json`]: manifest({ 'test:e2e': 'playwright test' }),
      },
      dirs: { [`${SHIP}/.github/workflows`]: [] },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.scripts.e2e).toBe(true)
    expect(contract.inCi).toStrictEqual([])
  })
})

describe('detectContract project kind', () => {
  it('owes nothing when the repo is not a node project at all', async () => {
    const ports = mockPorts({ files: { [`${SHIP}/README.md`]: '# notes' } })

    const contract = await detectContract(ports, SHIP)

    expect(contract.kind).toBe('other')
    expect(contract.gaps).toStrictEqual([])
  })

  it('unions scripts across npm workspace members', async () => {
    const ports = mockPorts({
      files: {
        [`${SHIP}/package.json`]: JSON.stringify({ workspaces: ['packages/*'] }),
        [`${SHIP}/packages/core/package.json`]: manifest({ 'test:unit': 'vitest run' }),
        [`${SHIP}/packages/web/package.json`]: manifest({ 'test:e2e': 'playwright test' }),
      },
      dirs: { [`${SHIP}/packages`]: ['core', 'web'] },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.kind).toBe('node-workspace')
    expect(contract.scripts.unit).toBe(true)
    expect(contract.scripts.e2e).toBe(true)
    expect(contract.gaps).toStrictEqual(['lint', 'typecheck'])
  })

  it('reads workspace members from pnpm-workspace.yaml', async () => {
    const ports = mockPorts({
      files: {
        [`${SHIP}/package.json`]: JSON.stringify({ private: true }),
        [`${SHIP}/pnpm-workspace.yaml`]: 'packages:\n  - packages/*\n  - apps/*\n',
        [`${SHIP}/packages/core/package.json`]: manifest({ 'test:lint': 'eslint .' }),
      },
      dirs: { [`${SHIP}/packages`]: ['core'], [`${SHIP}/apps`]: [] },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.kind).toBe('node-workspace')
    expect(contract.scripts.lint).toBe(true)
  })

  it('calls a repo with several manifests a workspace even when it declares none', async () => {
    // leuchtturm.example: seven npm projects with their own lockfiles and no `workspaces` field.
    const ports = mockPorts({
      commands: tracked('package.json', 'backend/package.json', 'webapp/package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({ 'cypress:run': 'cypress run' }),
        [`${SHIP}/backend/package.json`]: manifest({ test: 'jest' }),
        [`${SHIP}/webapp/package.json`]: manifest({ test: 'jest' }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.kind).toBe('node-workspace')
    expect(contract.members.map((member) => member.dir)).toStrictEqual(['.', 'backend', 'webapp'])
  })
})

describe('detectContract member discovery', () => {
  it('finds members the guess list would never have looked in', async () => {
    // `packages/ui` and `maintenance` are outside MANIFEST_DIRS, so before git answered
    // this question their contract scripts were invisible.
    const ports = mockPorts({
      commands: tracked('package.json', 'maintenance/package.json', 'packages/ui/package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({}),
        [`${SHIP}/maintenance/package.json`]: manifest({ 'test:unit': 'vitest run' }),
        [`${SHIP}/packages/ui/package.json`]: manifest({ 'test:lint': 'eslint .' }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.scripts.unit).toBe(true)
    expect(contract.scripts.lint).toBe(true)
    expect(contract.gaps).toStrictEqual(['typecheck', 'e2e'])
  })

  it('never credits or blames a manifest inside a nested repository', async () => {
    // The files exist on disk, but git does not list them — they belong to a foreign clone
    // checked out below the ship, as leuchtturm.example keeps nine of them.
    const ports = mockPorts({
      commands: tracked('package.json', 'backend/package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({}),
        [`${SHIP}/backend/package.json`]: manifest({ 'test:unit': 'jest' }),
        [`${SHIP}/deployment/configurations/windstaerke.example/branding/package.json`]: manifest({
          'test:e2e': 'playwright test',
        }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.members.map((member) => member.dir)).toStrictEqual(['.', 'backend'])
    expect(contract.scripts.e2e).toBe(false)
  })

  it('ignores a file that merely ends in the manifest name', async () => {
    // The pathspec is a glob, so `mypackage.json` matches `*package.json` too.
    const ports = mockPorts({
      commands: tracked('package.json', 'docs/mypackage.json'),
      files: { [`${SHIP}/package.json`]: manifest({ 'test:unit': 'vitest run' }) },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.members.map((member) => member.dir)).toStrictEqual(['.'])
    expect(contract.kind).toBe('node')
  })

  it('guesses only when git has no answer, so an uncommitted project still counts', async () => {
    // A fresh `git init` lists nothing; reporting `other` would call a real project a
    // notes repo until its first commit.
    const ports = mockPorts({
      commands: { 'git ls-files -z -- *package.json': { stdout: '' } },
      files: { [`${SHIP}/package.json`]: manifest({ 'test:lint': 'eslint .' }) },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.kind).toBe('node')
    expect(contract.scripts.lint).toBe(true)
  })
})

describe('detectContract role measurement', () => {
  it('reads the role off the command, so a repo under its own names is not a blank slate', async () => {
    // Leuchtturm, 28.09.2026: eslint in seven members, vue-tsc in two, vitest and jest in six,
    // a full Cypress suite — and Werft reported all four roles missing plus "nicht abnehmbar".
    const ports = mockPorts({
      commands: tracked('package.json', 'backend/package.json', 'packages/ui/package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({ 'cypress:run': 'cypress run' }),
        [`${SHIP}/backend/package.json`]: manifest({ lint: 'eslint .', test: 'jest' }),
        [`${SHIP}/packages/ui/package.json`]: manifest({
          test: 'vitest run',
          typecheck: 'vue-tsc --noEmit',
        }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.gaps).toStrictEqual([])
    expect(hasChecks(contract)).toBe(true)
  })

  it('still counts a house name whose command measures nothing readable', async () => {
    // `test-e2e` is a bin this module cannot read, and `turbo …` delegates to nobody here. The
    // house name is the project saying outright that this is the check — Werft's own root lives
    // off exactly that, and a repo already using the names must not lose a button to a better
    // measurement.
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({
          'test:e2e': 'test-e2e',
          'test:lint:typecheck': 'turbo test:lint:typecheck',
        }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.scripts.e2e).toBe(true)
    expect(contract.scripts.typecheck).toBe(true)
    expect(contractChecks(contract).map((check) => check.script)).toStrictEqual([
      'test:e2e',
      'test:lint:typecheck',
    ])
  })

  it('resolves one level of delegation, in the member and across them', async () => {
    // kalender's `test:lint` is three `npm run`s; Werft's own root is `turbo test:lint`.
    const ports = mockPorts({
      commands: tracked('package.json', 'app/package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({ check: 'turbo verify' }),
        [`${SHIP}/app/package.json`]: manifest({
          verify: 'npm run lint:eslint && npm run types',
          'lint:eslint': 'eslint --max-warnings 0 .',
          types: 'vue-tsc --noEmit',
        }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.scripts.lint).toBe(true)
    expect(contract.scripts.typecheck).toBe(true)
    // `verify` runs both roles and is therefore the named check for neither — but it is a check,
    // and the roles it runs are measured.
    expect(contract.members[1]?.checks).toStrictEqual([
      { script: 'verify', role: null, delegates: false },
      { script: 'lint:eslint', role: 'lint', delegates: false },
      { script: 'types', role: 'typecheck', delegates: false },
    ])
    expect(contract.gaps).toStrictEqual(['unit', 'e2e'])
  })

  it('gives the role to the closest name and keeps the rest as checks', async () => {
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({
          'test:visual': 'playwright test',
          'cypress:run': 'cypress run',
          'test:e2e': 'playwright test',
        }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.members[0]?.checks).toStrictEqual([
      { script: 'test:visual', role: null, delegates: false },
      { script: 'cypress:run', role: null, delegates: false },
      { script: 'test:e2e', role: 'e2e', delegates: false },
    ])
  })

  it('leaves a lone visual suite as the e2e role — it is what the ship runs', async () => {
    // Decision of 29.09.2026: `playwright test` is the measurement, and where nothing closer
    // stands beside it, the visual suite *is* this ship's end-to-end check.
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: { [`${SHIP}/package.json`]: manifest({ 'test:visual': 'playwright test' }) },
    })

    expect((await detectContract(ports, SHIP)).scripts.e2e).toBe(true)
  })

  it('does not let a hand-off launder a run that rewrites the tree', async () => {
    // Leuchtturm's webapp: `"test:unit:update": "npm test -- --updateSnapshot"`. The delegated command
    // is a real test run, and taking its word for it made the snapshot writer the unit check —
    // with the closer name, it even won the role from `test`.
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({
          test: 'cross-env NODE_ENV=test jest --coverage',
          'test:unit:update': 'npm test -- --updateSnapshot',
        }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contract.members[0]?.checks).toStrictEqual([
      { script: 'test', role: 'unit', delegates: false },
    ])
  })

  it('finds no check where nothing reports on the code', async () => {
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({
          build: 'vite build',
          dev: 'nuxt dev',
          test: "echo 'TODO: FIX & ADD TESTING!'",
          'test:size': 'size-limit',
        }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(hasChecks(contract)).toBe(false)
    expect(contract.gaps).toStrictEqual(['lint', 'typecheck', 'unit', 'e2e'])
  })
})

describe('detectContract CI reading', () => {
  it('reads the steps a workflow runs, not the text of the file', async () => {
    // Leuchtturm had `inCi: ['lint']` from the display name of a workflow called
    // "test:lint pull request CI", which checks the titles of pull requests. Nothing ran it.
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({ 'test:lint': 'eslint .' }),
        [`${SHIP}/.github/workflows/lint-pr.yml`]:
          'name: "test:lint pull request CI"\njobs:\n  title:\n    steps:\n      - uses: amannn/action-semantic-pull-request@v6\n',
      },
      dirs: { [`${SHIP}/.github/workflows`]: ['lint-pr.yml'] },
    })

    expect((await detectContract(ports, SHIP)).inCi).toStrictEqual([])
  })

  it('follows a step into the script it runs, whatever the project calls it', async () => {
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({ 'test:coverage': 'vitest run --coverage' }),
        [`${SHIP}/.github/workflows/test.yml`]:
          'jobs:\n  unit:\n    steps:\n      - run: npm ci\n      - run: npm run test:coverage\n',
      },
      dirs: { [`${SHIP}/.github/workflows`]: ['test.yml'] },
    })

    expect((await detectContract(ports, SHIP)).inCi).toStrictEqual(['unit'])
  })

  it('reads a block step line by line and a tool called straight from the workflow', async () => {
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({}),
        [`${SHIP}/.github/workflows/all.yml`]:
          'jobs:\n  all:\n    steps:\n      - run: |\n          cp .env.example .env\n          npx eslint .\n      - run: npx playwright test\n',
      },
      dirs: { [`${SHIP}/.github/workflows`]: ['all.yml'] },
    })

    expect((await detectContract(ports, SHIP)).inCi).toStrictEqual(['lint', 'e2e'])
  })

  it('does not read a `defaults: run:` setting as a command', async () => {
    // `defaults:\n  run:\n    shell: bash` stands in every Leuchtturm workflow. Read as a block
    // step, its body would be shell script Werft then searched for tools.
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({}),
        [`${SHIP}/.github/workflows/build.yml`]:
          'defaults:\n  run:\n    shell: bash\njobs:\n  build:\n    steps:\n      - run: npm run build\n',
      },
      dirs: { [`${SHIP}/.github/workflows`]: ['build.yml'] },
    })

    expect((await detectContract(ports, SHIP)).inCi).toStrictEqual([])
  })
})

describe('detectContract CI build reading', () => {
  function ship(scripts: Record<string, string>, workflow: string) {
    return mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest(scripts),
        [`${SHIP}/.github/workflows/ci.yml`]: workflow,
      },
      dirs: { [`${SHIP}/.github/workflows`]: ['ci.yml'] },
    })
  }

  it('finds a tool that builds, called straight from a step', async () => {
    const ports = ship({}, 'jobs:\n  x:\n    steps:\n      - run: pnpm vite build\n')

    expect((await detectContract(ports, SHIP)).buildsInCi).toBe(true)
  })

  /** Leitstand.example and eight more on 02.10.2026: the step names the script, the script names the tool. */
  it('follows a step into the script it runs', async () => {
    const ports = ship(
      { build: 'vite build' },
      'jobs:\n  x:\n    steps:\n      - run: npm install\n      - run: npm run build\n',
    )

    expect((await detectContract(ports, SHIP)).buildsInCi).toBe(true)
  })

  it('reads a block step line by line', async () => {
    const ports = ship(
      { build: 'vite build' },
      'jobs:\n  x:\n    steps:\n      - run: |\n          npm install\n          npm run build\n',
    )

    expect((await detectContract(ports, SHIP)).buildsInCi).toBe(true)
  })

  /** And not in a job *called* build, which half the workflows on this fleet are. */
  it('does not take a job name for a build step', async () => {
    const ports = ship({}, 'jobs:\n  build:\n    steps:\n      - run: pnpm test\n')

    expect((await detectContract(ports, SHIP)).buildsInCi).toBe(false)
  })

  /** A script called `build` that builds nothing is no build — the name is not the measurement. */
  it('does not take a script name for a build', async () => {
    const ports = ship(
      { build: 'echo nothing to build' },
      'jobs:\n  x:\n    steps:\n      - run: npm run build\n',
    )

    expect((await detectContract(ports, SHIP)).buildsInCi).toBe(false)
  })
})

describe('detectContract unread scripts', () => {
  function ship(scripts: Record<string, string>, workflow = '') {
    return mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest(scripts),
        [`${SHIP}/.github/workflows/ci.yml`]: workflow,
      },
      dirs: { [`${SHIP}/.github/workflows`]: workflow === '' ? [] : ['ci.yml'] },
    })
  }

  it('names a script that claims a build and runs nothing readable', async () => {
    const contract = await detectContract(
      ship(
        { build: 'mytool src --out dist' },
        'jobs:\n  x:\n    steps:\n      - run: npm run build\n',
      ),
      SHIP,
    )

    expect(contract.builds).toBe(false)
    expect(contract.unread).toStrictEqual([
      { dir: '.', script: 'build', claims: 'build', command: 'mytool src --out dist', inCi: true },
    ])
  })

  /** A role it claims is a question and no longer a gap: `fehlt` would say nothing was found. */
  it('takes a claimed role out of the gaps', async () => {
    const contract = await detectContract(ship({ 'test:lint:locales': 'scripts/locales.sh' }), SHIP)

    expect(contract.scripts.lint).toBe(false)
    expect(contract.unread.map((one) => one.claims)).toStrictEqual(['lint'])
    expect(contract.gaps).not.toContain('lint')
  })

  it('leaves alone what delivers, what is read and what writes', async () => {
    const contract = await detectContract(
      ship({
        build: 'vite build',
        // Not `test:unit`: the house name is a check whatever it runs.
        unit: 'vitest',
        'test:e2e': 'test-e2e',
        'lint:fix': 'mytool --fix',
        dev: 'mytool serve',
      }),
      SHIP,
    )

    expect(contract.unread).toStrictEqual([])
    expect(contract.gaps).toContain('unit')
  })
})

describe('detectContract CI commands', () => {
  it('lists what a step runs and what the script it hands off to runs', async () => {
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({ 'storybook:build': 'storybook build' }),
        [`${SHIP}/.github/workflows/ci.yml`]:
          'jobs:\n  x:\n    steps:\n      - run: |\n          npm ci\n          npm run storybook:build\n',
      },
      dirs: { [`${SHIP}/.github/workflows`]: ['ci.yml'] },
    })

    expect((await detectContract(ports, SHIP)).ciCommands).toStrictEqual([
      'npm ci',
      'npm run storybook:build',
      'storybook build',
    ])
  })
})

describe(contractChecks, () => {
  it('pairs every declared script with the member it runs in', async () => {
    // dalben.example: `test:lint` in the members, none at the root. Offering the bare
    // script name ran it at the root, where it does not exist.
    const ports = mockPorts({
      commands: tracked('package.json', 'backend/package.json', 'frontend/package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({ release: 'release-it' }),
        [`${SHIP}/backend/package.json`]: manifest({
          'test:lint': 'eslint .',
          'test:unit': 'jest',
        }),
        [`${SHIP}/frontend/package.json`]: manifest({ 'test:lint': 'eslint .' }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contractChecks(contract)).toStrictEqual([
      { dir: 'backend', role: 'lint', script: 'test:lint' },
      { dir: 'backend', role: 'unit', script: 'test:unit' },
      { dir: 'frontend', role: 'lint', script: 'test:lint' },
    ])
  })

  it('offers the name the project uses, because that is the one that runs', async () => {
    // `npm run test:unit` in this repo is "Missing script". Offering the house name was a button
    // that could only fail, and it was the only button Werft knew how to draw.
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: { [`${SHIP}/package.json`]: manifest({ test: 'jest' }) },
    })

    expect(contractChecks(await detectContract(ports, SHIP))).toStrictEqual([
      { dir: '.', role: 'unit', script: 'test' },
    ])
  })

  it('offers nothing where nothing in the repo reports on its code', async () => {
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({ build: 'vite build', start: 'node index.js' }),
      },
    })

    expect(contractChecks(await detectContract(ports, SHIP))).toStrictEqual([])
  })

  it('lets a root script stand for the members it already covers', async () => {
    // Werft's own root `test:lint` is `turbo test:lint`; twelve buttons for four checks is
    // the same check offered three times over.
    const ports = mockPorts({
      commands: tracked('package.json', 'packages/cli/package.json', 'packages/core/package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({ 'test:lint': 'turbo test:lint' }),
        [`${SHIP}/packages/cli/package.json`]: manifest({ 'test:lint': 'eslint .' }),
        [`${SHIP}/packages/core/package.json`]: manifest({
          'test:lint': 'eslint .',
          'test:unit': 'vitest run',
        }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contractChecks(contract)).toStrictEqual([
      { dir: '.', role: 'lint', script: 'test:lint' },
      // `test:unit` has no root script to stand for it, so the member keeps its own button.
      { dir: 'packages/core', role: 'unit', script: 'test:unit' },
    ])
  })

  it('lets a root script stand for the members only when it fans out to them', async () => {
    // The other half of the same rule, and the one the measurement made necessary: a root
    // `"lint": "next lint"` now fills the lint role, and before this it would have hidden the
    // members' own linters behind a command that never runs them.
    const ports = mockPorts({
      commands: tracked('package.json', 'backend/package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({ lint: 'next lint' }),
        [`${SHIP}/backend/package.json`]: manifest({ 'test:lint': 'eslint .' }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contractChecks(contract)).toStrictEqual([
      { dir: '.', role: 'lint', script: 'lint' },
      { dir: 'backend', role: 'lint', script: 'test:lint' },
    ])
  })

  it('offers a collector too — it is not a role, but it is something to run', async () => {
    const ports = mockPorts({
      commands: tracked('package.json'),
      files: {
        [`${SHIP}/package.json`]: manifest({ check: 'eslint . && tsc --noEmit' }),
      },
    })

    const contract = await detectContract(ports, SHIP)

    expect(contractChecks(contract)).toStrictEqual([{ dir: '.', role: null, script: 'check' }])
    // The roles it runs are measured all the same — the ship does lint if something lints.
    expect(contract.gaps).toStrictEqual(['unit', 'e2e'])
  })
})
