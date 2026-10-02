import {
  bodyBuilds,
  CHECK_ROLES,
  claimOf,
  commandRoles,
  delegationOf,
  judges,
  nameProximity,
  namedAsWriter,
  splitCommands,
  unreadCommand,
} from './role'

import type { FsPort, Ports } from './ports'
import type { CheckRole, Claim } from './role'

/**
 * What Werft calls the four checks in its own repos.
 *
 * Werft's own naming, and no longer the yardstick for anyone else: which role a script fills is
 * measured on the command it runs (`role.ts`). These names stay for two reasons — they are what
 * `AGENTS.md` asks of this repository, and they are the second signal in the measurement: a
 * project that already uses them says outright that this script is the check, even where the
 * command delegates and measures nothing readable (`"test:lint:typecheck": "turbo …"`).
 */
export const CONTRACT_SCRIPTS: Record<CheckRole, string> = {
  lint: 'test:lint',
  typecheck: 'test:lint:typecheck',
  unit: 'test:unit',
  e2e: 'test:e2e',
}

/** A way to start the project so a human can look at it (Probebecken / phase 4). */
export type DevEntry = 'script' | 'compose' | 'none'

/**
 * The names docker itself looks for, in its own order of precedence.
 *
 * Only ever used to answer *whether* a ship brings compose, never to read one — reading goes
 * through `docker compose config` for the reason spelled out in `basin.ts`. The list is docker's
 * and not Werft's taste, and it is the whole list: checking only `docker-compose.yml` made a ship
 * that uses the modern `compose.yaml` look like a plain Node project.
 */
export const COMPOSE_FILES: readonly string[] = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
]

/** Whether the ship brings a compose file at all — the cheap half of asking docker. */
export async function hasComposeFile(ports: ContractPorts, shipPath: string): Promise<boolean> {
  const found = await Promise.all(
    COMPOSE_FILES.map(async (name) => (await ports.fs.readFile(`${shipPath}/${name}`)) !== null),
  )
  return found.includes(true)
}

/**
 * Whether the contract applies at all. Demanding a unit test from a Markdown or
 * Helmfile repo produces noise, and noise is how a survey loses its reader.
 */
export type ProjectKind = 'node' | 'node-workspace' | 'other'

/** One script of a member that runs a check, under whatever name the project gave it. */
export interface MemberCheck {
  /** The script name the project uses — a button runs exactly this. */
  script: string
  /**
   * The role this script *is* for this member, or `null` for one that measures a role without
   * being the named check for it: a collector running several (`"check": "eslint . && tsc
   * --noEmit"`), or the loser of the name-proximity rule (`test:visual` beside `test:e2e`).
   * Those stay visible — a check nobody can press is a check nobody has.
   */
  role: CheckRole | null
  /**
   * Whether the command fans out into the other members (`turbo test:lint`).
   *
   * The only thing that lets a root script stand for the members' own. Measured rather than
   * assumed, because the assumption breaks the moment a role is read off the command: a root
   * `"lint": "next lint"` fills the lint role without running a single member's linter, and
   * before this it would have hidden their buttons behind its own.
   */
  delegates: boolean
}

/** One manifest inside a ship: the root of a single-package repo, or a monorepo member. */
export interface ContractMember {
  /** Path relative to the ship root; `.` for the root manifest. */
  dir: string
  /** Every script of this member that runs a check, in the order the manifest declares them. */
  checks: readonly MemberCheck[]
}

export interface Contract {
  kind: ProjectKind
  /** Which roles this project measures anywhere, under any name. */
  scripts: Record<CheckRole, boolean>
  /** Every manifest that belongs to this ship, root first. */
  members: readonly ContractMember[]
  devEntry: DevEntry
  /** Roles a CI workflow runs. */
  inCi: readonly CheckRole[]
  /** Roles nothing measures — empty for `other`, where nothing is owed. */
  gaps: readonly CheckRole[]
  /**
   * Whether any script of this ship builds a deliverable artifact.
   *
   * Beside the roles and not among them: a role returns a verdict about the source, a build
   * returns an artifact and writes to the tree. Counting it as a fifth role would hang a gap on
   * every repository that publishes its TypeScript as source — which owes no build at all.
   */
  builds: boolean
  /**
   * Whether a CI workflow builds one — straight from a step, or through the script it runs.
   *
   * Read here and not in the probe, because it is the same reading as `inCi`. Until 02.10.2026
   * the probe matched each line holding `run:` on its own, and that lost both halves of what
   * `inCi` already knew: a `run: |` block keeps its commands on the lines below, and
   * `npm run build` hands off to a script instead of naming a tool. Measured over the fleet, nine
   * ships had a workflow running their build and were told none did.
   */
  buildsInCi: boolean
  /**
   * Scripts whose name claims a role or a build and whose command nothing here can read.
   *
   * The fifth verdict, carried to where it is needed. Until 02.10.2026 such a script counted as
   * nothing, and a ship running `"build": "tsup …"` was told it built nothing — the measurement
   * claimed a gap where it only had a blind spot. Now the quest says `nicht messbar` and names
   * the command, which is also how the closed tables in `role.ts` learn what to add.
   */
  unread: readonly Unread[]
}

/** One script whose name says what it does and whose command does not let us check. */
export interface Unread {
  /** The member it stands in, `.` for the root. */
  dir: string
  script: string
  /** What the name claims. */
  claims: Claim
  /** The first command nothing could read — shown as evidence, so it names the tool. */
  command: string
  /** Whether a workflow step runs this script. */
  inCi: boolean
}

/** Where a single-package repo tends to keep its app, used only when git has no answer. */
const MANIFEST_DIRS = ['.', 'app', 'webapp', 'frontend', 'backend'] as const

/** Only `fs` and `proc` — detection reads files and asks git, and does nothing else. */
export type ContractPorts = Pick<Ports, 'fs' | 'proc'>

interface PackageManifest {
  scripts?: Record<string, unknown>
  workspaces?: readonly string[]
}

async function readManifest(fs: FsPort, path: string): Promise<PackageManifest | null> {
  const raw = await fs.readFile(path)
  if (raw === null) {
    return null
  }
  try {
    return JSON.parse(raw) as PackageManifest
  } catch (error) {
    // A malformed manifest is a finding, not a crash. Anything other than bad JSON is
    // a real defect and must surface.
    if (!(error instanceof SyntaxError)) {
      throw error
    }
    return null
  }
}

/** Expands `packages/*` against the filesystem. Only the trailing-star form occurs here. */
async function expandWorkspaceGlob(
  fs: FsPort,
  shipPath: string,
  pattern: string,
): Promise<readonly string[]> {
  if (!pattern.endsWith('/*')) {
    return [pattern]
  }
  const parent = pattern.slice(0, -2)
  const listing = await fs.readDir(`${shipPath}/${parent}`)
  const entries = listing?.map((one) => one.name) ?? null
  return entries === null ? [] : entries.map((entry) => `${parent}/${entry}`)
}

async function workspaceDirs(
  fs: FsPort,
  shipPath: string,
  root: PackageManifest | null,
): Promise<readonly string[]> {
  const patterns: string[] = [...(root?.workspaces ?? [])]

  if (patterns.length === 0) {
    const pnpm = await fs.readFile(`${shipPath}/pnpm-workspace.yaml`)
    if (pnpm !== null) {
      // Deliberately not a YAML parser: only the `- pattern` list under `packages:`
      // matters, and pulling in a dependency for that is not worth it.
      for (const line of pnpm.split('\n')) {
        const match = /^\s*-\s*['"]?([^'"\s#]+)['"]?\s*$/.exec(line)
        if (match?.[1] !== undefined) {
          patterns.push(match[1])
        }
      }
    }
  }

  const dirs = await Promise.all(
    patterns.map(async (pattern) => expandWorkspaceGlob(fs, shipPath, pattern)),
  )
  return dirs.flat()
}

const MANIFEST = 'package.json'

/**
 * The directories git says carry a manifest of *this* repo.
 *
 * Asking git rather than walking the tree is what makes monorepos and nested repositories
 * come out right at once, because git already draws every boundary that matters: ignored
 * output (`dist`, `.output`, `coverage`), `node_modules`, and — the reason this exists —
 * everything inside a submodule or a foreign clone checked out below the ship.
 * leuchtturm.example keeps nine of those under `deployment/configurations/`, with twelve further
 * manifests in them; a walk would have credited their scripts to leuchtturm and, worse, held
 * leuchtturm to their gaps.
 *
 * `null` when git has no answer — no repository, or nothing committed yet — so the caller
 * can fall back rather than report an empty project.
 */
async function trackedManifestDirs(
  ports: ContractPorts,
  shipPath: string,
): Promise<readonly string[] | null> {
  const result = await ports.proc.run('git', ['ls-files', '-z', '--', `*${MANIFEST}`], shipPath)
  if (result.code !== 0) {
    return null
  }

  const dirs = new Set<string>()
  for (const path of result.stdout.split('\0')) {
    // The pathspec is a glob, so `foo/mypackage.json` matches it too — the basename has to
    // be the manifest itself, not merely end in it.
    if (path !== MANIFEST && !path.endsWith(`/${MANIFEST}`)) {
      continue
    }
    dirs.add(path === MANIFEST ? '.' : path.slice(0, -(MANIFEST.length + 1)))
  }
  return dirs.size > 0 ? [...dirs] : null
}

/** Root first, then alphabetical — a stable order so a survey reads the same twice. */
function byDir(a: string, b: string): number {
  if (a === b) {
    return 0
  }
  if (a === '.') {
    return -1
  }
  if (b === '.') {
    return 1
  }
  return a < b ? -1 : 1
}

/** One manifest of a ship, with the scripts it declares. */
export interface ManifestScripts {
  /** Path relative to the ship root; `.` for the root manifest. */
  dir: string
  /**
   * Script name to command, as the manifest declares them.
   *
   * The commands and not just the names, because that is where the role of a check stands. Only
   * reading the keys is the error this whole module was rebuilt to remove.
   */
  scripts: Readonly<Record<string, string>>
}

/** Which directories carry a manifest — git's answer, and the guess list when it has none. */
async function manifestDirs(
  ports: ContractPorts,
  shipPath: string,
  root: PackageManifest | null,
): Promise<readonly string[]> {
  const tracked = await trackedManifestDirs(ports, shipPath)
  if (tracked !== null) {
    return tracked
  }
  // No git, or nothing committed: back to guessing. The guess list is wrong about monorepos,
  // which is why it is the fallback and not the rule.
  const declaredMembers = await workspaceDirs(ports.fs, shipPath, root)
  return declaredMembers.length > 0 ? ['.', ...declaredMembers] : MANIFEST_DIRS
}

/** Only the string commands — a `scripts` entry that is not one is not runnable either. */
function scriptsOf(manifest: PackageManifest): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(manifest.scripts ?? {}).flatMap(([name, body]) =>
      typeof body === 'string' ? [[name, body]] : [],
    ),
  )
}

/**
 * Every manifest that belongs to this ship, with the scripts in it, root first.
 *
 * Its own function because the contract is not the only thing read out of these files: the
 * environment probe (`detectBasin`) needs the names the contract has no role for — `dev`,
 * `db:migrate`, `cli:seed:demo`. A second survey beside this one would be a second answer to
 * "which directories are this ship's", and the two would disagree the first time a member
 * was added.
 */
export async function shipScripts(
  ports: ContractPorts,
  shipPath: string,
): Promise<readonly ManifestScripts[]> {
  const root = await readManifest(ports.fs, `${shipPath}/${MANIFEST}`)
  const dirs = await manifestDirs(ports, shipPath, root)

  const found = await Promise.all(
    [...dirs].sort(byDir).map(async (dir) => ({
      dir,
      manifest: dir === '.' ? root : await readManifest(ports.fs, `${shipPath}/${dir}/${MANIFEST}`),
    })),
  )

  return found.flatMap(({ dir, manifest }) =>
    manifest === null ? [] : [{ dir, scripts: scriptsOf(manifest) }],
  )
}

/** The role Werft's own naming gives this script name, if any. */
function houseRole(name: string): CheckRole | null {
  return CHECK_ROLES.find((role) => CONTRACT_SCRIPTS[role] === name) ?? null
}

/** One script, measured: what it runs, what role that makes it, and whether it fans out. */
interface Measured {
  script: string
  /** Every command it ends up running, its own and the ones it hands off to. */
  commands: readonly string[]
  /** Every role those commands measure. More than one is a collector. */
  roles: readonly CheckRole[]
  /** The role it can be *the* check for, before the proximity rule picks between candidates. */
  claim: CheckRole | null
  delegates: boolean
}

/**
 * Every command a script ends up running — its own, plus one level of delegation.
 *
 * One level, because that is what the fleet needs and no more: four ships write their `test:lint`
 * as `npm run test:lint:eslint && npm run test:lint:locales && npm run test:lint:typecheck`, and
 * Werft's own root delegates through `turbo test:lint`. Going deeper would buy the `check`
 * collector that calls a script that calls a script, and pay for it with a recursion whose
 * termination depends on nobody writing a cycle into a `package.json`.
 *
 * `delegates` says a members-scoped hand-off actually landed on a script another member declares.
 * An unresolved `turbo build` covers nothing, and a root script that covers nothing must not hide
 * the members' buttons.
 */
function reachedCommands(
  manifests: readonly ManifestScripts[],
  dir: string,
  name: string,
  body: string,
): { commands: readonly string[]; delegates: boolean } {
  const own = splitCommands(body)
  const reached = [...own]
  let delegates = false

  // `judges` before `delegationOf`, not after: `npm test -- --updateSnapshot` hands off to a real
  // test run, and believing the hand-off made the snapshot writer a member's unit check.
  for (const command of own.filter(judges)) {
    const delegation = delegationOf(command)
    if (delegation === null) {
      continue
    }
    const targets = manifests.filter((manifest) =>
      delegation.scope === 'self' ? manifest.dir === dir : manifest.dir !== dir,
    )
    for (const target of targets) {
      const targetBody = target.scripts[delegation.script]
      // A script that runs itself under its own name has nothing to add, and asking again is how
      // one level turns into none.
      if (targetBody === undefined || (target.dir === dir && delegation.script === name)) {
        continue
      }
      reached.push(...splitCommands(targetBody))
      if (delegation.scope === 'members') {
        delegates = true
      }
    }
  }

  return { commands: reached, delegates }
}

/**
 * Every script of one member that runs a check, measured but not yet resolved.
 *
 * The house name wins over the command where the two disagree, and that is the direction that
 * keeps the promise this rebuild was allowed to make: a project already using Werft's names
 * cannot lose a button to a better measurement. It is also the only way `"test:e2e": "test-e2e"`
 * and `"test:lint:typecheck": "turbo test:lint:typecheck"` stay checks — their commands say
 * nothing a table can read.
 */
function measure(manifests: readonly ManifestScripts[], dir: string): readonly Measured[] {
  const member = manifests.find((manifest) => manifest.dir === dir)
  if (member === undefined) {
    return []
  }

  return Object.entries(member.scripts).flatMap(([script, body]) => {
    if (namedAsWriter(script)) {
      return []
    }
    const reached = reachedCommands(manifests, dir, script, body)
    const roles = commandRoles(reached.commands)
    const house = houseRole(script)
    if (house === null && roles.length === 0) {
      return []
    }
    return [
      {
        script,
        commands: reached.commands,
        roles,
        // A collector is none of the roles it runs: which of them would the button be? The roles
        // themselves still count — the ship does lint if something lints — but the named check
        // for each of them is a different question, and this script does not answer it.
        claim: house ?? (roles.length === 1 ? (roles[0] ?? null) : null),
        delegates: reached.delegates,
      },
    ]
  })
}

/**
 * Which of several candidates is *the* check for a role: the closest name wins
 * (`nameProximity`), the rest stay visible without the role.
 *
 * Ties go to the earlier declaration — the project's own order in its `package.json`, which is
 * stable and is somebody's decision, unlike alphabetical.
 */
function assign(measured: readonly Measured[]): readonly MemberCheck[] {
  const winners = new Map<CheckRole, string>()

  for (const role of CHECK_ROLES) {
    let best: Measured | null = null
    let bestScore = 0
    for (const candidate of measured.filter((entry) => entry.claim === role)) {
      const score = nameProximity(
        candidate.script,
        role,
        CONTRACT_SCRIPTS[role],
        candidate.commands,
      )
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }
    if (best !== null) {
      winners.set(role, best.script)
    }
  }

  return measured.map((entry) => ({
    script: entry.script,
    role: entry.claim !== null && winners.get(entry.claim) === entry.script ? entry.claim : null,
    delegates: entry.delegates,
  }))
}

/**
 * Whether anything in this ship can be checked at all, under any name.
 *
 * What `hasForeignHarness` used to answer, and now the same question asked once: with the role
 * read off the command, a "foreign harness" is simply a harness. The old field existed only
 * because the detection went by name — it was reported and never counted, and its whole job was
 * to keep "Test-Vertrag fehlt vollständig, nicht abnehmbar" from being said about a repo with
 * two thousand tests.
 */
export function hasChecks(contract: Contract): boolean {
  return contract.members.some((member) => member.checks.length > 0)
}

/** One runnable check: the project's own script name together with the directory it lives in. */
export interface ContractCheck {
  dir: string
  /** The role it fills, or `null` for a collector or a script that lost on name proximity. */
  role: CheckRole | null
  script: string
}

/** What a root check covers: its role, or — having none — its own name. */
function coverage(check: MemberCheck): string {
  return check.role ?? `~${check.script}`
}

/**
 * Every check the ship actually offers, each with the directory it runs in and the name the
 * project gave it.
 *
 * A monorepo keeps its checks in its members — dalben.earth declares `test:lint` in four
 * of them and none at the root — so a check is only runnable together with a working
 * directory. Offering the bare script name produced a button that ran at the ship root and
 * reported "Missing script".
 *
 * A root script that fans out stands for the members' scripts of the same role, or of the same
 * name where it has no role: it exists in order to cover them (`turbo test:lint`), and listing
 * both offers the same check twice — Werft itself came out with twelve buttons for four checks
 * before this. That it has to *fan out* is the new half, and it is what keeps a root
 * `"lint": "next lint"` from hiding the members' linters behind a command that never runs them.
 */
export function contractChecks(contract: Contract): readonly ContractCheck[] {
  const root = contract.members.find((member) => member.dir === '.')
  const covered = new Set(
    (root?.checks ?? []).filter((check) => check.delegates).map((check) => coverage(check)),
  )

  return contract.members.flatMap((member) =>
    member.checks
      .filter((check) => member.dir === '.' || !covered.has(coverage(check)))
      .map((check) => ({ dir: member.dir, role: check.role, script: check.script })),
  )
}

/**
 * The `run:` steps of one workflow, one command per entry.
 *
 * A hand-rolled reader rather than a YAML parser, for the reason `workspaceDirs` gives: one
 * shape out of the file and nothing else. What it must get right is the difference between a
 * step and a setting — `defaults:\n  run:\n    shell: bash` is a mapping, not a command, and
 * reading its body as one would make every workflow in Leuchtturm look like a shell script.
 * So a block is only a block when the line says so (`|`, `>`), and a bare `run:` is skipped.
 */
const RUN_KEY = 'run'

function runSteps(raw: string): readonly string[] {
  const lines = raw.split('\n')
  const steps: string[] = []

  for (const [index, line] of lines.entries()) {
    // Read by hand rather than by one pattern: indentation in front of an optional list dash in
    // front of the key is three quantifiers over a file nobody here wrote, and the linter is
    // right to call that a hazard. Counting and slicing is also simply easier to follow.
    const indent = line.length - line.trimStart().length
    const bare = line.trimStart().replace(/^- +/, '')
    if (!bare.startsWith(`${RUN_KEY}:`)) {
      continue
    }
    const rest = bare.slice(RUN_KEY.length + 1).trim()

    if (!/^[|>][+-]?$/.test(rest)) {
      if (rest !== '') {
        steps.push(rest)
      }
      continue
    }
    for (const next of lines.slice(index + 1)) {
      if (next.trim() === '') {
        continue
      }
      if (next.length - next.trimStart().length <= indent) {
        break
      }
      steps.push(next.trim())
    }
  }

  return steps
}

/**
 * Which roles the CI workflows run.
 *
 * Read off the steps and resolved like any other command, because the old reading — does the
 * file contain the string `test:lint` anywhere — answered a different question than it claimed.
 * At Leuchtturm it reported `lint` from the *display name* of a workflow called
 * "test:lint pull request CI", which checks the titles of pull requests. No workflow there ever
 * ran `test:lint`, and Werft said one did.
 */
function readCiRoles(
  workflows: readonly string[],
  ofScript: (name: string) => readonly CheckRole[],
): readonly CheckRole[] {
  const found = new Set<CheckRole>()

  for (const raw of workflows) {
    for (const step of runSteps(raw)) {
      for (const role of commandRoles(splitCommands(step))) {
        found.add(role)
      }
      for (const command of splitCommands(step).filter(judges)) {
        const delegation = delegationOf(command)
        if (delegation === null) {
          continue
        }
        for (const role of ofScript(delegation.script)) {
          found.add(role)
        }
      }
    }
  }

  return CHECK_ROLES.filter((role) => found.has(role))
}

/**
 * Whether any CI step builds, read and resolved exactly like `readCiRoles`.
 *
 * Without `judges`, for the reason `bodyBuilds` gives: a build is not a judge, so there is no
 * verdict for a flag to withhold.
 */
function readCiBuilds(
  workflows: readonly string[],
  scriptBuilds: (name: string) => boolean,
): boolean {
  return workflows.some((raw) =>
    runSteps(raw).some((step) =>
      splitCommands(step).some((command) => {
        if (bodyBuilds(command)) {
          return true
        }
        const delegation = delegationOf(command)
        return delegation !== null && scriptBuilds(delegation.script)
      }),
    ),
  )
}

/** Every script name a CI step hands off to — the names, resolved nowhere. */
function readCiScripts(workflows: readonly string[]): ReadonlySet<string> {
  return new Set(
    workflows.flatMap((raw) =>
      runSteps(raw).flatMap((step) =>
        splitCommands(step).flatMap((command) => delegationOf(command)?.script ?? []),
      ),
    ),
  )
}

/**
 * The scripts that claim something by name, deliver nothing readable and run something unread.
 *
 * All three, and in that order. A `test:unit` that runs `vitest run` delivers and is no
 * question, and neither does a house name. A `unit` running bare `vitest` is read — it watches, which is an answer — and
 * stays a gap. Only a command no table knows is unread. A writer (`lint:fix`) claims nothing:
 * it is not a check under any name.
 */
function readUnread(
  manifests: readonly ManifestScripts[],
  ciScripts: ReadonlySet<string>,
): readonly Unread[] {
  return manifests.flatMap((manifest) =>
    Object.entries(manifest.scripts).flatMap(([script, body]) => {
      const claims = claimOf(script)
      if (claims === null || namedAsWriter(script)) {
        return []
      }
      const { commands } = reachedCommands(manifests, manifest.dir, script, body)
      // The house name is a check whatever it runs (`measure`), so it has nothing left to ask.
      const delivered =
        houseRole(script) === claims ||
        (claims === 'build'
          ? commands.some((command) => bodyBuilds(command))
          : commandRoles(commands).includes(claims))
      const command = delivered
        ? null
        : (commands.map(unreadCommand).find((one) => one !== null) ?? null)
      return command === null
        ? []
        : [{ dir: manifest.dir, script, claims, command, inCi: ciScripts.has(script) }]
    }),
  )
}

/**
 * Every workflow file of a ship, as text.
 *
 * Exported because two questions need the same bytes: which roles the CI runs (`inCi`, here) and
 * whether any workflow names a given tool (`ci-nennt`, in `probe.ts`). Reading the directory
 * twice was what it did before — once for the roles and once just to count the files.
 */
export async function readWorkflows(fs: FsPort, shipPath: string): Promise<readonly string[]> {
  const dir = `${shipPath}/.github/workflows`
  const listing = await fs.readDir(dir)
  const entries = listing?.map((one) => one.name) ?? null
  if (entries === null) {
    return []
  }

  const found = await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
      .map(async (entry) => await fs.readFile(`${dir}/${entry}`)),
  )
  return found.filter((raw): raw is string => raw !== null)
}

export async function detectContract(ports: ContractPorts, shipPath: string): Promise<Contract> {
  const { fs } = ports
  const manifests = await shipScripts(ports, shipPath)

  const measured = manifests.map(({ dir }) => ({ dir, entries: measure(manifests, dir) }))
  const members: readonly ContractMember[] = measured.map(({ dir, entries }) => ({
    dir,
    checks: assign(entries),
  }))

  const all = measured.flatMap(({ entries }) => entries)
  const scripts = Object.fromEntries(
    CHECK_ROLES.map((role) => [
      role,
      all.some((entry) => entry.claim === role || entry.roles.includes(role)),
    ]),
  ) as Record<CheckRole, boolean>

  // More than one manifest is a monorepo whether or not it says so. leuchtturm.example declares
  // no workspace at all and still has seven npm projects with their own lockfiles.
  const kind: ProjectKind =
    manifests.length === 0 ? 'other' : manifests.length > 1 ? 'node-workspace' : 'node'

  const hasCompose = await hasComposeFile(ports, shipPath)
  const declared = new Set(manifests.flatMap((manifest) => Object.keys(manifest.scripts)))
  const devEntry: DevEntry = declared.has('dev') ? 'script' : hasCompose ? 'compose' : 'none'

  /**
   * What a CI step reaches when it runs `npm run test:coverage`: the roles of that script,
   * wherever in the ship it is declared, resolved exactly as a member's own check is.
   *
   * Which member is a question the workflow answers in its `working-directory`, and one Werft does
   * not need to ask — `inCi` is a fact about the ship. The house name counts here for the same
   * reason it counts in `measure`: a project that named the script after the contract said what it
   * is, even where the command delegates out of reach.
   */
  const rolesOfScript = (name: string): readonly CheckRole[] => {
    const reached = manifests.flatMap((manifest) => {
      const body = manifest.scripts[name]
      return body === undefined
        ? []
        : commandRoles(reachedCommands(manifests, manifest.dir, name, body).commands)
    })
    const house = houseRole(name)
    return house !== null && declared.has(name) ? [...new Set([house, ...reached])] : reached
  }

  /** Whether a script of that name builds, wherever it is declared — the build twin of the above. */
  const scriptBuilds = (name: string): boolean =>
    manifests.some((manifest) => {
      const body = manifest.scripts[name]
      return (
        body !== undefined &&
        reachedCommands(manifests, manifest.dir, name, body).commands.some((command) =>
          bodyBuilds(command),
        )
      )
    })

  const workflows = await readWorkflows(fs, shipPath)
  const unread = readUnread(manifests, readCiScripts(workflows))

  return {
    kind,
    scripts,
    members,
    builds: manifests.some((manifest) =>
      Object.values(manifest.scripts).some((body) => bodyBuilds(body)),
    ),
    buildsInCi: readCiBuilds(workflows, scriptBuilds),
    devEntry,
    inCi: readCiRoles(workflows, rolesOfScript),
    // A role an unread script claims is not a gap but a question: `fehlt` would say the
    // measurement found nothing, and it found something it cannot read.
    gaps:
      kind === 'other'
        ? []
        : CHECK_ROLES.filter(
            (role) => !scripts[role] && !unread.some((one) => one.claims === role),
          ),
    unread,
  }
}
