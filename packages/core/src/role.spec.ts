import { describe, expect, it } from 'vitest'

import { bodyRoles, delegationOf, namedAsWriter, nameProximity } from './role'

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
