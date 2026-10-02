import { CONTRACT_SCRIPTS } from './contract'
import { forgeOf } from './forge'
import { CHECK_ROLES } from './role'

import type { Contract, MemberCheck } from './contract'
import type { CommandResult, Ports } from './ports'
import type { CheckRole } from './role'
import type { Remote } from './ship'

/** A command invocation matched by `"<command> <args joined by space>"`. */
export type CommandMap = Record<string, Partial<CommandResult>>

export interface MockSetup {
  /** Absolute paths to file contents. */
  files?: Record<string, string>
  /** Absolute paths to directory entry names. */
  dirs?: Record<string, readonly string[]>
  /** Symbolic links: a path, and what it really is. Anything absent is itself. */
  links?: Record<string, string>
  commands?: CommandMap
  onPath?: readonly string[]
  cpuCount?: number
  totalMemoryBytes?: number
  freeDiskBytes?: number | null
  now?: Date
}

const FAILED: CommandResult = { code: 1, stdout: '', stderr: 'mock: not configured' }

export function mockPorts(setup: MockSetup = {}): Ports {
  const files = setup.files ?? {}
  const dirs = setup.dirs ?? {}
  const commands = setup.commands ?? {}
  const onPath = new Set(setup.onPath ?? [])
  const now = setup.now ?? new Date('2026-09-27T12:00:00Z')

  return {
    proc: {
      run: async (command, args) => {
        const key = [command, ...args].join(' ')
        const hit = commands[key]
        return hit === undefined ? FAILED : { ...FAILED, code: 0, ...hit }
      },
      which: async (command) => (onPath.has(command) ? `/usr/bin/${command}` : null),
    },
    fs: {
      readFile: async (path) => files[path] ?? null,
      readDir: async (path) =>
        dirs[path]?.map((name) => ({ name, directory: Object.hasOwn(dirs, `${path}/${name}`) })) ??
        null,
      isDirectory: async (path) => Object.hasOwn(dirs, path),
      // Nothing is a link unless a test says so: a mock that resolved paths of its own would be
      // answering a question the test never asked.
      realPath: async (path) => setup.links?.[path] ?? path,
      // Into the same table `readFile` reads from, so a test can write and read back.
      writeFile: async (path, contents) => {
        files[path] = contents
        return null
      },
    },
    host: {
      cpuCount: () => setup.cpuCount ?? 8,
      totalMemory: () => setup.totalMemoryBytes ?? 32 * 1024 ** 3,
      freeDiskBytes: async () =>
        setup.freeDiskBytes === undefined ? 100 * 1024 ** 3 : setup.freeDiskBytes,
    },
    clock: { now: () => now },
  }
}

/**
 * A promise somebody else resolves.
 *
 * For holding one call open while the thing that made it is looked at mid-flight — the only way to
 * test what is on screen *during* a survey, which is the question the window is judged by. Beside
 * `mockPorts` for the same reason it exists: one copy of the scaffolding, or three that drift.
 */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let settle: (value: T) => void = () => {}
  // eslint-disable-next-line promise/avoid-new -- the resolver has to escape the executor
  const promise = new Promise<T>((resolve) => {
    settle = resolve
  })
  return {
    promise,
    resolve: (value) => {
      settle(value)
    },
  }
}

/**
 * A member that measures exactly these roles, under Werft's own names.
 *
 * Here and not in five spec files, because that is where it was: every fixture spelled out a
 * member by hand, and when the shape of one changed — the day a role stopped being read off the
 * name — five files said the old thing. A fixture builder is the same argument as `mockPorts`.
 */
export function mockChecks(roles: Record<CheckRole, boolean>): readonly MemberCheck[] {
  return CHECK_ROLES.filter((role) => roles[role]).map((role) => ({
    script: CONTRACT_SCRIPTS[role],
    role,
    delegates: false,
  }))
}

/**
 * A contract measuring exactly the roles it is given, under Werft's own names and in one member.
 *
 * Beside `mockChecks` and for the same argument: `scripts`, `members` and `gaps` are one
 * measurement in `detectContract`, and a fixture that sets them by hand can claim a ship that
 * cannot exist — a role that is a gap *and* is measured by a member. Anything a test really
 * wants to differ in it overrides by name.
 */
export function mockContract(overrides: Partial<Contract> = {}): Contract {
  const scripts =
    overrides.scripts ??
    (Object.fromEntries(CHECK_ROLES.map((role) => [role, false])) as Record<CheckRole, boolean>)
  return {
    kind: 'node',
    scripts,
    members: [{ dir: '.', checks: mockChecks(scripts) }],
    devEntry: 'none',
    inCi: [],
    builds: false,
    gaps: CHECK_ROLES.filter((role) => !scripts[role]),
    ...overrides,
  }
}

/**
 * A remote the way `inspectShip` would have measured one: `origin` unless a test says otherwise,
 * and the forge read off the URL rather than stated beside it.
 *
 * Same argument as `mockChecks`. A fixture that spells the pair out by hand can claim a pairing
 * the production code would never make — `{ url: 'git@example.com/x', forge: 'github' }` — and
 * then a component passes its test against a ship that cannot exist.
 */
export function mockRemote(url: string, name = 'origin'): Remote {
  return { name, url, forge: forgeOf(url) }
}
