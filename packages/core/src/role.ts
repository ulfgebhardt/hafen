/**
 * What a command measures.
 *
 * The role of a check sits in the command, not in the name of the script that holds it:
 * `"lint": "eslint ."` and `"test:lint": "eslint ."` run the same linter, and a survey that
 * reads only the keys of `scripts` calls one of them a gap. Measured against
 * Leuchtturm-Verbund/Leuchtturm on 28.09.2026, that reading found one of some twenty
 * checks the repo actually has — and then ranked the repo as the most urgent thing in the fleet
 * for lacking them. This module is the other direction: Werft adapts to the ship, and the house
 * names in `contract.ts` become Werft's own naming instead of the yardstick for everyone else.
 *
 * Nothing here touches the filesystem, and nothing here knows the house contract. It answers one
 * question about one string, which is why it can be tested exhaustively against the real scripts
 * of the fleet (1150 of them across 44 node ships, read on 29.09.2026).
 */

/** The four roles an Abnahme asks about. `contract.ts` holds what Werft calls them in its own repos. */
export type CheckRole = 'lint' | 'typecheck' | 'unit' | 'e2e'

/** Fixed order — cheapest verdict first, the way an Abnahme runs. A survey reads the same twice. */
export const CHECK_ROLES: readonly CheckRole[] = ['lint', 'typecheck', 'unit', 'e2e']

/** One way to run a role: the tool that is invoked, and what must stand beside it. */
interface RoleCommand {
  /**
   * The tool, matched as a *word* of the command and never as a substring.
   *
   * Measured at Leuchtturm on 29.09.2026: `"postinstall": "node scripts/fix-vue2-jest.js"`
   * came out as this member's unit test, because `jest` stands inside a filename. A path is
   * allowed in front of the word and a `.js` behind it (`./node_modules/jest/bin/jest.js` is
   * a real invocation), but the basename has to *be* the tool.
   *
   * Also the third rung of the name-proximity ladder (`nameProximity`), which is why it is a
   * string and not a pattern.
   */
  tool: string
  /**
   * Words that have to stand in the same command: a subcommand (`cypress run`) or a flag.
   *
   * `tsc` needs `--noEmit`, because `tsc -p tsconfig.json` emits JavaScript and is a build step
   * — whether its tsconfig says `noEmit` is not visible in the command, and this module reads
   * nothing else. Leuchtturm's `packages/branding` has exactly that script.
   */
  needs?: readonly RegExp[]
}

/**
 * The commands that *are* a role.
 *
 * A closed list, for the same reason `COMPOSE_FILES` and `CHORE_VERBS` are closed: an open rule
 * ("anything containing test") counts `pretest`, `latest` and `test:size` and stops meaning
 * anything. It grows when a ship arrives that runs something else — that is the fleet's answer,
 * not a guess about tools nobody here uses.
 */
const ROLE_COMMANDS: Record<CheckRole, readonly RoleCommand[]> = {
  lint: [
    { tool: 'eslint' },
    { tool: 'biome', needs: [/\b(?:check|lint|ci)\b/] },
    { tool: 'stylelint' },
    { tool: 'textlint' },
    { tool: 'markdownlint' },
    { tool: 'vue-cli-service', needs: [/\blint\b/] },
    { tool: 'next', needs: [/\blint\b/] },
    { tool: 'ruff', needs: [/\bcheck\b/] },
    { tool: 'clippy' },
  ],
  typecheck: [
    { tool: 'tsc', needs: [/--noEmit\b/] },
    { tool: 'vue-tsc' },
    { tool: 'nuxt', needs: [/\btypecheck\b/] },
    { tool: 'mypy' },
    { tool: 'pyright' },
  ],
  unit: [
    // `vitest` alone watches. The run has to be named, or there is no verdict to wait for —
    // `test:watch` and `test:unit:dev` are nine such scripts in the fleet.
    { tool: 'vitest', needs: [/\b(?:run|related|bench)\b|--run\b/] },
    { tool: 'jest' },
    { tool: 'bun', needs: [/\btest\b/] },
    { tool: 'node', needs: [/--test\b/] },
    { tool: 'pytest' },
    { tool: 'cargo', needs: [/\btest\b/] },
    { tool: 'vue-cli-service', needs: [/\btest:unit\b/] },
  ],
  e2e: [
    { tool: 'cypress', needs: [/\brun\b/] },
    { tool: 'playwright', needs: [/\btest\b/] },
    { tool: 'nightwatch' },
  ],
}

/**
 * The same tools, invoked so that they never hand back a verdict.
 *
 * Two kinds, one consequence. A watcher or an interactive session behind a button hangs the
 * Abnahme instead of failing it — `test:watch`, `test:unit:dev`, `test:e2e:ui`, `test:unit:debug`
 * are eleven such scripts in the fleet, and none of them ends. And a run with `--fix` or `-u`
 * *changes the tree* to make itself pass: `test:lintfix` and `test:unit:update` would be buttons
 * that rewrite code and snapshots while reporting green. Neither is a check under any name.
 *
 * `playwright install --with-deps` is the sibling case, and it needs no entry here: the patterns
 * above ask for `playwright test`, and installing is not running.
 */
const NO_VERDICT: readonly RegExp[] = [
  /--watch(?![\w-])/,
  /--watchAll(?![\w-])/,
  /--ui(?![\w-])/,
  /\bcypress\s+open\b/,
  /--inspect-brk(?![\w-])/,
  /\bnodemon\b/,
  // `--fix-type` alone fixes nothing (eslint ignores it without `--fix`), so that one keeps its
  // boundary. Every `--update…` writes, including playwright's `--update-snapshots`.
  /--fix(?![\w-])/,
  /--write(?![\w-])/,
  /--update/i,
  /\s-u(?![\w-])/,
]

/**
 * One script body as the separate commands it runs.
 *
 * Split before matching, so `npm run build && tsc --noEmit` cannot lend its `--noEmit` to a
 * `tsc` in another command — and so that "how many roles does this script run" is a count over
 * commands, which is what makes a collector recognisable.
 */
export function splitCommands(body: string): readonly string[] {
  return body
    .split(/&&|\|\||[;|\n]/)
    .map((command) => command.trim())
    .filter((command) => command !== '')
}

/**
 * Whether this one command ends with a verdict instead of watching, waiting or rewriting.
 *
 * Exported because it also decides whether a hand-off counts: `"test:unit:update": "npm test --
 * --updateSnapshot"` delegates to a real test run, and taking the delegated command's word for it
 * made the snapshot writer this member's unit check (Leuchtturm's webapp, 29.09.2026).
 */
export function judges(command: string): boolean {
  return !NO_VERDICT.some((pattern) => pattern.test(command))
}

/** The words of a command, with quotes left alone — only the shape matters here. */
function words(command: string): readonly string[] {
  return command.split(/\s+/).filter((word) => word !== '')
}

/**
 * Whether this command invokes that tool.
 *
 * A path in front is fine and a JavaScript extension behind it too, but the basename has to be
 * the tool itself — `scripts/fix-vue2-jest.js` runs no tests.
 */
function invokes(command: string, tool: string): boolean {
  return words(command).some((word) => {
    const base = (word.split('/').pop() ?? word).replace(/\.[cm]?js$/, '')
    return base === tool
  })
}

/** Whether this command runs that role's tool, with whatever else that tool needs beside it. */
function runs(command: string, entry: RoleCommand): boolean {
  return invokes(command, entry.tool) && (entry.needs ?? []).every((need) => need.test(command))
}

/** Which roles these commands measure, ignoring anything the commands delegate to. */
export function commandRoles(commands: readonly string[]): readonly CheckRole[] {
  const found = new Set<CheckRole>()
  for (const command of commands.filter(judges)) {
    for (const role of CHECK_ROLES) {
      if (ROLE_COMMANDS[role].some((entry) => runs(command, entry))) {
        found.add(role)
      }
    }
  }
  return CHECK_ROLES.filter((role) => found.has(role))
}

/** Which roles this one body measures — the common case of `commandRoles`. */
export function bodyRoles(body: string): readonly CheckRole[] {
  return commandRoles(splitCommands(body))
}

/**
 * What builds an artifact — and it is **not** a fifth role.
 *
 * A role is something that returns a verdict about the source; a build returns an artifact and
 * writes to the tree (`dist/`, `target/`). Making it a `CheckRole` would put a `fehlt: build` gap
 * on every repository that publishes TypeScript sources, which is not a gap at all. So it is its
 * own question, asked by its own quest, and `judges` is deliberately not applied: a build is not
 * a judge.
 *
 * Read off the command like everything else here. A fleet-wide name check would find `build` in
 * repositories that only delegate it and miss `"bundle": "vite build"`.
 */
const BUILD_COMMANDS: readonly RoleCommand[] = [
  { tool: 'vite', needs: [/(^|\s)build(\s|$)/u] },
  { tool: 'tsc', needs: [/(^|\s)(-b|--build)(\s|$)/u] },
  { tool: 'nuxt', needs: [/(^|\s)(build|generate)(\s|$)/u] },
  { tool: 'next', needs: [/(^|\s)build(\s|$)/u] },
  { tool: 'astro', needs: [/(^|\s)build(\s|$)/u] },
  { tool: 'vue-cli-service', needs: [/(^|\s)build(\s|$)/u] },
  { tool: 'ng', needs: [/(^|\s)build(\s|$)/u] },
  { tool: 'webpack' },
  { tool: 'rollup' },
  { tool: 'esbuild' },
  { tool: 'parcel', needs: [/(^|\s)build(\s|$)/u] },
  { tool: 'cargo', needs: [/(^|\s)build(\s|$)/u] },
  { tool: 'tauri', needs: [/(^|\s)build(\s|$)/u] },
  { tool: 'docker', needs: [/(^|\s)build(\s|$)/u] },
  { tool: 'make', needs: [/(^|\s)build(\s|$)/u] },
  { tool: 'gradle', needs: [/(^|\s)(build|assemble)(\s|$)/u] },
  { tool: 'mvn', needs: [/(^|\s)(package|install)(\s|$)/u] },
]

/** Whether this one command builds an artifact. */
export function buildsArtifact(command: string): boolean {
  return BUILD_COMMANDS.some((entry) => runs(command, entry))
}

/** Whether anything in this script body builds one. */
export function bodyBuilds(body: string): boolean {
  return splitCommands(body).some(buildsArtifact)
}

/** A script that runs another script instead of a tool. */
export interface Delegation {
  /** The script name that is run. */
  script: string
  /**
   * Where that name is looked up. `self`: `npm run X` resolves inside the manifest it stands in.
   * `members`: `turbo X` and its kind run the task in every member, which is the only thing that
   * makes a root script stand for the members' own.
   */
  scope: 'self' | 'members'
}

/**
 * Whatever runs *scripts*: the package managers, and the task runners that fan out.
 *
 * `npx` is not among them — it runs a binary, and reading `npx playwright install` as a hand-off
 * to a script called `playwright` would be an invention.
 */
const RUNNERS: readonly string[] = ['npm', 'pnpm', 'yarn', 'bun', 'turbo', 'lerna']

/** Runners that always mean every member, whatever else stands on the line. */
const FANOUT_RUNNERS: readonly string[] = ['turbo', 'lerna']

/** Flags that turn a package manager's run into every member's. */
const FANOUT_FLAGS: readonly string[] = ['-r', '--recursive', '--workspaces', '--filter', '-F']

/** Flags that take the next word as their value, which is therefore not the script name. */
const FLAGS_WITH_VALUE: readonly string[] = ['--filter', '-F', '-C', '--dir', '--workspace', '-w']

/**
 * A package manager's own subcommands.
 *
 * `pnpm install` and `npm ci` run no script of the project, and reading them as one would credit
 * a repo with whatever its `install` lifecycle script happens to do. Only relevant without an
 * explicit `run`: `npm run install` is unambiguous and is a script.
 */
const SUBCOMMANDS: readonly string[] = [
  'install',
  'i',
  'ci',
  'add',
  'remove',
  'rm',
  'up',
  'update',
  'upgrade',
  'exec',
  'dlx',
  'create',
  'init',
  'link',
  'unlink',
  'publish',
  'pack',
  'audit',
  'outdated',
  'dedupe',
  'why',
  'store',
  'config',
]

/**
 * Which script this one command hands off to, or `null` when it runs something itself.
 *
 * Read word by word rather than by pattern: the forms are `<runner> [flags] [run] <name>` with
 * every combination of the middle, and one regex per combination is both unreadable and — the
 * linter is right — a nest of quantifiers over untrusted text.
 */
export function delegationOf(command: string): Delegation | null {
  const spoken = words(command)
  const start = spoken.findIndex((word) => RUNNERS.includes(word))
  if (start === -1) {
    return null
  }

  const runner = spoken[start] ?? ''
  const rest = spoken.slice(start + 1)
  // Read over the whole line, because the flag can stand behind the name (`npm run x --workspaces`).
  const fanout =
    FANOUT_RUNNERS.includes(runner) ||
    rest.some((word) => FANOUT_FLAGS.includes(word.split('=')[0] ?? ''))
  const scope = fanout ? 'members' : 'self'
  let explicit = false

  for (let index = 0; index < rest.length; index += 1) {
    const word = rest[index] ?? ''
    if (word === 'run') {
      explicit = true
      continue
    }
    if (word.startsWith('-')) {
      // The value of `--filter x` is not the script name. `--filter=x` carries its own and needs
      // no skip, which is why this compares the whole word.
      if (FLAGS_WITH_VALUE.includes(word)) {
        index += 1
      }
      continue
    }
    if (!explicit && SUBCOMMANDS.includes(word)) {
      return null
    }
    return { script: word, scope }
  }

  return null
}

/**
 * Which tools of this role these commands actually name.
 *
 * Only used for the name-proximity ladder: `cypress:run` is closer to the e2e role than
 * `test:visual` is, and the reason is that the script's name says what it runs.
 */
export function roleTools(commands: readonly string[], role: CheckRole): readonly string[] {
  const found = new Set<string>()
  for (const command of commands.filter(judges)) {
    for (const entry of ROLE_COMMANDS[role]) {
      if (runs(command, entry)) {
        found.add(entry.tool)
      }
    }
  }
  return [...found]
}

/** A script name in its parts, so `test:e2e`, `test-e2e` and `e2e:ci` read the same. */
function segments(name: string): readonly string[] {
  return name.split(/[:\-_.\s]+/).filter((segment) => segment !== '')
}

/** What a script calls itself when it is the writing twin of a check. */
const WRITING: readonly string[] = ['update', 'updates', 'write', 'fix', 'fixup']

/**
 * Whether a script's *name* says it rewrites rather than reports.
 *
 * The one place a name decides something, and deliberately so — but it decides a different
 * question than the role: not "what does this measure" but "is it safe to press". The flags are
 * not always there to be read. `"test:e2e:a11y:update": "A11Y_UPDATE_BASELINE=1 playwright test
 * a11y"` writes its baseline through an environment variable, and gezeitenatlas and
 * genossenschaft both offered it as a check until this existed.
 *
 * It fails in the safe direction: at worst a real check whose name says `fix` is not offered, and
 * nothing is offered that overwrites the answer it was asked for.
 */
export function namedAsWriter(name: string): boolean {
  return segments(name).some(
    (segment) => WRITING.includes(segment) || (segment.endsWith('fix') && segment !== 'fix'),
  )
}

/**
 * How close a script's name is to a role, for the one case where a member has several scripts
 * measuring the same thing: the closest name is *the* check for that role, the rest stay visible
 * without claiming it.
 *
 * The ladder, and the example from the order it comes from — `test:e2e` > `cypress:run` >
 * `test:visual`:
 *
 * 4. the house name itself, which is a project saying outright that this is the check
 * 3. the role as a part of the name (`e2e`, `test:e2e:chrome`, `lint`)
 * 2. the tool the command runs, named in the script (`cypress:run` running `cypress run`)
 * 1. anything else — measured, but nothing in the name says so
 *
 * Deliberately a small ladder and not a string distance: the answer has to be explainable at the
 * button, and "why does this one count as e2e" is a question a distance cannot answer.
 */
export function nameProximity(
  name: string,
  role: CheckRole,
  houseName: string,
  commands: readonly string[],
): number {
  if (name === houseName) {
    return 4
  }
  if (segments(name).includes(role)) {
    return 3
  }
  return roleTools(commands, role).some((tool) => name.includes(tool)) ? 2 : 1
}
