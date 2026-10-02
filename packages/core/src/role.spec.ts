import { describe, expect, it } from 'vitest'

import {
  bodyBuilds,
  bodyRoles,
  buildsArtifact,
  claimOf,
  delegationOf,
  namedAsWriter,
  nameProximity,
  toolOf,
  unreadCommand,
} from './role'

describe(bodyRoles, () => {
  it('reads the same role out of two different script names', () => {
    // The whole point: `"lint"` and `"test:lint"` run the same linter, and only one of them
    // used to count.
    expect(bodyRoles('eslint --max-warnings 0 .')).toStrictEqual(['lint'])
    expect(bodyRoles('eslint .')).toStrictEqual(['lint'])
  })

  it.each([
    ['biome check .', 'lint'],
    ['stylelint "**/*.{css,vue}"', 'lint'],
    ['next lint', 'lint'],
    ['vue-tsc --noEmit', 'typecheck'],
    ['nuxt typecheck', 'typecheck'],
    ['TZ=UTC jest --runInBand --forceExit', 'unit'],
    ['cross-env TZ=UTC bun test', 'unit'],
    ['vue-cli-service test:unit', 'unit'],
    ['node --test "src/**/*.spec.ts"', 'unit'],
    ['cypress run --e2e', 'e2e'],
    ['playwright test --reporter=list', 'e2e'],
  ])('reads %s as the %s role', (body, role) => {
    expect(bodyRoles(body)).toStrictEqual([role])
  })

  it('asks for --noEmit before calling tsc a typecheck', () => {
    // Ocelot's `packages/branding` declares `"typecheck": "tsc -p tsconfig.json"`, which emits
    // JavaScript. Whether its tsconfig says `noEmit` is not in the command, and this module
    // reads nothing else.
    expect(bodyRoles('tsc --noEmit')).toStrictEqual(['typecheck'])
    expect(bodyRoles('tsc -p tsconfig.json')).toStrictEqual([])
  })

  // `vitest` alone watches; a button on it hangs the Abnahme rather than answering it.
  it.each([
    'vitest',
    'cross-env TZ=UTC vitest',
    'jest --watch',
    'playwright test --ui',
    'cypress open --e2e',
    'node --inspect-brk ./node_modules/jest/bin/jest.js --runInBand',
  ])('does not call %s a check', (body) => {
    expect(bodyRoles(body)).toStrictEqual([])
  })

  it('counts the same runner once the run is named', () => {
    expect(bodyRoles('vitest run')).toStrictEqual(['unit'])
    expect(bodyRoles('vitest --run --coverage')).toStrictEqual(['unit'])
  })

  it('does not call a run that rewrites the tree a check', () => {
    // `test:lintfix` and `test:unit:update` exist in the fleet. A button reporting green because
    // it changed the code to make itself pass is worse than no button.
    expect(bodyRoles('eslint . --fix')).toStrictEqual([])
    expect(bodyRoles('jest --updateSnapshot')).toStrictEqual([])
    expect(bodyRoles('vitest run --coverage -u')).toStrictEqual([])
    // A flag that merely begins like one of those is not one of them.
    expect(bodyRoles('eslint --fix-type problem .')).toStrictEqual(['lint'])
  })

  it('installing a runner is not running it', () => {
    expect(bodyRoles('npx playwright install --with-deps chromium')).toStrictEqual([])
  })

  it('reads the tool as a word, not as a piece of a filename', () => {
    // Ocelot's webapp: `"postinstall": "node scripts/fix-vue2-jest.js"` came out as this member's
    // unit test, because `jest` stands inside the name of a patch script.
    expect(
      bodyRoles('node scripts/fix-vue2-jest.js && node scripts/fix-v-mapbox.js'),
    ).toStrictEqual([])
    // A path in front and a `.js` behind is still the tool itself.
    expect(bodyRoles('node ./node_modules/jest/bin/jest.js --runInBand')).toStrictEqual(['unit'])
  })

  it('does not read a script name as an invocation of the tool it mentions', () => {
    // `npm run test:lint:eslint` runs no linter by itself — what it runs is resolved by following
    // the hand-off, and that is a question about the manifest, not about this string.
    expect(bodyRoles('npm run test:lint:eslint')).toStrictEqual([])
  })

  it('reads each command on its own, so a flag cannot be lent to the next one', () => {
    expect(bodyRoles('node scripts/strip.mjs --noEmit && tsc -p tsconfig.json')).toStrictEqual([])
    expect(bodyRoles('npm run build && node --test "src/**/*.spec.ts"')).toStrictEqual(['unit'])
  })

  it('reports every role a single script runs, which is what makes a collector one', () => {
    expect(bodyRoles('eslint . && tsc --noEmit && vitest run')).toStrictEqual([
      'lint',
      'typecheck',
      'unit',
    ])
  })

  it('reads the roles in a fixed order, so a survey reads the same twice', () => {
    expect(bodyRoles('vitest run && eslint .')).toStrictEqual(['lint', 'unit'])
  })

  /** The verb rule for checks: lint and typecheck by subcommand, never `test`. */
  it('takes a lint or typecheck subcommand at its word, whatever the tool', () => {
    expect(bodyRoles('make lint')).toStrictEqual(['lint'])
    expect(bodyRoles('nuxi typecheck')).toStrictEqual(['typecheck'])
    expect(bodyRoles('somerunner test')).toStrictEqual([])
    expect(bodyRoles('pnpm lint')).toStrictEqual([])
  })

  it('finds nothing in a command that reports on no code', () => {
    expect(bodyRoles("echo 'TODO: FIX & ADD TESTING!'")).toStrictEqual([])
    expect(bodyRoles('size-limit --json')).toStrictEqual([])
    expect(bodyRoles('publint && attw --pack .')).toStrictEqual([])
    expect(bodyRoles('vite build')).toStrictEqual([])
    expect(bodyRoles('nuxt dev')).toStrictEqual([])
  })
})

describe(delegationOf, () => {
  it('reads a script that runs another script of the same manifest', () => {
    expect(delegationOf('npm run test:lint:eslint')).toStrictEqual({
      script: 'test:lint:eslint',
      scope: 'self',
    })
    expect(delegationOf('pnpm run test:units')).toStrictEqual({
      script: 'test:units',
      scope: 'self',
    })
    // yarn and pnpm let the `run` be left out.
    expect(delegationOf('yarn test:unit')).toStrictEqual({ script: 'test:unit', scope: 'self' })
    expect(delegationOf('npm test')).toStrictEqual({ script: 'test', scope: 'self' })
  })

  it('reads a script that fans out into the other members', () => {
    // The only thing that lets a root script stand for the members' own buttons.
    expect(delegationOf('turbo test:lint')).toStrictEqual({ script: 'test:lint', scope: 'members' })
    expect(delegationOf('turbo run build')).toStrictEqual({ script: 'build', scope: 'members' })
    expect(delegationOf('pnpm -r test:unit')).toStrictEqual({
      script: 'test:unit',
      scope: 'members',
    })
    expect(delegationOf('lerna run test')).toStrictEqual({ script: 'test', scope: 'members' })
  })

  it('prefers the fan-out reading where both forms match', () => {
    expect(delegationOf('pnpm --filter @werft/cli run test:unit')).toStrictEqual({
      script: 'test:unit',
      scope: 'members',
    })
  })

  it('finds no hand-off where a command runs something itself', () => {
    expect(delegationOf('eslint .')).toBeNull()
    expect(delegationOf('npm ci')).toBeNull()
    expect(delegationOf('docker compose build')).toBeNull()
    expect(delegationOf('cp .env.example .env')).toBeNull()
  })
})

describe(namedAsWriter, () => {
  it('refuses the writing twin of a check, whose flag is not always on the line', () => {
    // `A11Y_UPDATE_BASELINE=1 playwright test a11y` writes its baseline through an environment
    // variable; gemeinschafts-atlas and kooperative both offered it as a check.
    expect(namedAsWriter('test:e2e:a11y:update')).toBe(true)
    expect(namedAsWriter('test:lintfix')).toBe(true)
    expect(namedAsWriter('test:lint:locales:fix')).toBe(true)
  })

  it('leaves a check alone whose name merely reads a little like one', () => {
    expect(namedAsWriter('test:lint')).toBe(false)
    expect(namedAsWriter('test:fixtures')).toBe(false)
    expect(namedAsWriter('test:unit')).toBe(false)
  })
})

describe(nameProximity, () => {
  it('ranks the house name above the role word above the tool above nothing', () => {
    // The ladder from the order this came from: `test:e2e` > `cypress:run` > `test:visual`.
    const cypress = ['cypress run']

    expect(nameProximity('test:e2e', 'e2e', 'test:e2e', cypress)).toBe(4)
    expect(nameProximity('e2e:ci', 'e2e', 'test:e2e', cypress)).toBe(3)
    expect(nameProximity('cypress:run', 'e2e', 'test:e2e', cypress)).toBe(2)
    expect(nameProximity('test:visual', 'e2e', 'test:e2e', ['playwright test'])).toBe(1)
  })

  it('reads a name in its parts, however the project separates them', () => {
    expect(nameProximity('test-e2e', 'e2e', 'test:e2e', [])).toBe(3)
    expect(nameProximity('test:units', 'unit', 'test:unit', [])).toBe(1)
  })
})

describe(buildsArtifact, () => {
  /** Read off the command: `"bundle": "vite build"` builds, and the name says nothing. */
  it('finds the builders by what they run', () => {
    expect(buildsArtifact('vite build')).toBe(true)
    expect(buildsArtifact('nuxt generate')).toBe(true)
    expect(buildsArtifact('cargo build --release')).toBe(true)
    expect(buildsArtifact('tauri build')).toBe(true)
    expect(buildsArtifact('tsc -b')).toBe(true)
  })

  /** A tool that also does other things only builds where it says so. */
  it('does not take every run of a build tool for a build', () => {
    expect(buildsArtifact('vite')).toBe(false)
    expect(buildsArtifact('cargo test')).toBe(false)
    expect(buildsArtifact('tsc --noEmit')).toBe(false)
    expect(buildsArtifact('next lint')).toBe(false)
  })

  /** And never a word inside something else: `rebuild-index.js` is a script, not a build. */
  it('matches the tool as a word', () => {
    expect(buildsArtifact('node scripts/rebuild-index.js')).toBe(false)
    expect(buildsArtifact('echo build')).toBe(false)
  })

  it('reads a whole body, however many commands it holds', () => {
    expect(bodyBuilds('rimraf dist && vite build')).toBe(true)
    expect(bodyBuilds('eslint . && vitest run')).toBe(false)
  })

  /** Measured on 02.10.2026: Ocelot-Social, IT4C.dev and vuepress-plugin-imagemin built unseen. */
  it('knows the builders the fleet runs without a subcommand', () => {
    expect(buildsArtifact('tsc')).toBe(true)
    expect(buildsArtifact('tsc -p tsconfig.build.json')).toBe(true)
    expect(buildsArtifact('tsup src/index.ts --format esm')).toBe(true)
    expect(buildsArtifact('unbuild')).toBe(true)
  })

  /** The open rule: a tool no list knows, asked by its subcommand to build. */
  it('takes a build subcommand at its word, whatever the tool', () => {
    expect(buildsArtifact('vuepress build docs')).toBe(true)
    expect(buildsArtifact('storybook build -o storybook-static')).toBe(true)
    expect(buildsArtifact('npx vuepress build docs')).toBe(true)
    expect(buildsArtifact('cross-env NODE_ENV=production vike build')).toBe(true)
    expect(buildsArtifact('vuepress dev docs')).toBe(false)
  })

  /** Only where the tool does the work itself — elsewhere `build` is a script, a file or text. */
  it('does not take a build that only names something else for one', () => {
    expect(buildsArtifact('npm run build')).toBe(false)
    expect(buildsArtifact('pnpm build')).toBe(false)
    expect(buildsArtifact('run-s build')).toBe(false)
    expect(buildsArtifact('node build')).toBe(false)
    expect(buildsArtifact('echo build')).toBe(false)
  })

  /** The verbs are a closed table, and a word from an object's prototype is not in it. */
  it('reads no verb out of a word the table does not hold', () => {
    expect(buildsArtifact('vuepress constructor')).toBe(false)
  })
})

describe(toolOf, () => {
  it('reads past wrappers and assignments to the tool itself', () => {
    expect(toolOf('vuepress build docs')).toBe('vuepress')
    expect(toolOf('npx -y vue-tsc --noEmit')).toBe('vue-tsc')
    expect(toolOf('NODE_ENV=production cross-env A=1 ./node_modules/.bin/tsup.js')).toBe('tsup')
  })

  it('finds none in a command that only sets up', () => {
    expect(toolOf('FOO=1')).toBeNull()
  })
})

describe(claimOf, () => {
  it('reads the last part of a name that is a role or a build', () => {
    expect(claimOf('build')).toBe('build')
    expect(claimOf('docs:build')).toBe('build')
    expect(claimOf('test:lint:locales')).toBe('lint')
    expect(claimOf('test:lint:typecheck')).toBe('typecheck')
  })

  it('claims nothing for a name that says nothing', () => {
    expect(claimOf('dev')).toBeNull()
    expect(claimOf('rebuild')).toBeNull()
  })

  /** Measured: `e2e:seed`, `build:dev-brandings`, `test:unit:debug` prepare a run and are none. */
  it('claims nothing for a name that prepares a run', () => {
    expect(claimOf('e2e:seed')).toBeNull()
    expect(claimOf('build:dev-brandings')).toBeNull()
    expect(claimOf('test:unit:debug')).toBeNull()
  })
})

describe(unreadCommand, () => {
  /** Measured on 02.10.2026, before `tsup` was listed: IT4C.dev's backend build. */
  it('names a command no table here knows', () => {
    expect(unreadCommand('mytool --out dist')).toBe('mytool --out dist')
    expect(unreadCommand('node scripts/build.js')).toBe('node scripts/build.js')
    expect(unreadCommand('run-s build:*')).toBe('run-s build:*')
  })

  /** Read is everything with an answer, including the answer "this does not do it". */
  it('reads a known tool, a verb, a hand-off and a helper', () => {
    expect(unreadCommand('vite build')).toBeNull()
    expect(unreadCommand('vitest')).toBeNull()
    expect(unreadCommand('vuepress build docs')).toBeNull()
    expect(unreadCommand('npm run build')).toBeNull()
    expect(unreadCommand('rimraf dist')).toBeNull()
  })

  it('finds nothing unread in a command that only sets up', () => {
    expect(unreadCommand('FOO=1')).toBeNull()
  })

  /** No verdict is an answer too, and `pretty-quick` without `--check` is a writer it knows. */
  it('reads a run that hands back no verdict', () => {
    expect(unreadCommand('node --inspect-brk ./node_modules/jest/bin/jest.js')).toBeNull()
    expect(unreadCommand('pretty-quick --staged')).toBeNull()
    expect(bodyRoles('pretty-quick --check')).toStrictEqual(['lint'])
  })
})
