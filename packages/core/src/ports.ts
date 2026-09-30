/**
 * Ports are the only way `core` touches the outside world.
 *
 * Why: the same logic has to run in the Tauri app, in the CLI and in tests. A direct
 * `node:fs` import here would make two of those three impossible.
 */

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export interface ProcPort {
  /** Runs a command. Must not throw on a non-zero exit code — report it in `code`. */
  run: (command: string, args: readonly string[], cwd?: string) => Promise<CommandResult>
  /** Absolute path of an executable on PATH, or null when it is missing. */
  which: (command: string) => Promise<string | null>
}

export interface FsPort {
  /** File contents, or null when the file does not exist. Never throws on absence. */
  readFile: (path: string) => Promise<string | null>
  /** Directory entry names, or null when the directory does not exist. */
  readDir: (path: string) => Promise<readonly string[] | null>
  isDirectory: (path: string) => Promise<boolean>
  /**
   * The path with every symbolic link resolved, or null when it cannot be resolved.
   *
   * Needed because a link is invisible to every other call here: `isDirectory` follows one without
   * saying so, so a repository reachable through six links is six repositories. Measured on this
   * machine: `kombuese/addons/AddOns` was linked into five game directories and drew as six
   * identical ships, all 948 days old, filling a third of the basin.
   */
  realPath: (path: string) => Promise<string | null>
  /**
   * Writes a file, creating the directories above it. The reason it failed, or `null` on success.
   *
   * The one writing call here, and it is not a hole in "der Hafen verändert kein Repository": what
   * goes through it is the register, and the register holds decisions a human made — what is
   * archived, and which directories to treat as ships anyway. Nothing measured is ever written,
   * and no path inside a project repository is.
   */
  writeFile: (path: string, contents: string) => Promise<string | null>
}

export interface HostPort {
  /** Logical CPU count. */
  cpuCount: () => number
  /** Total memory in bytes. */
  totalMemory: () => number
  /** Free bytes on the filesystem holding `path`. */
  freeDiskBytes: (path: string) => Promise<number | null>
}

/**
 * One model call: prompt in, text out. No tools, no session, no memory of the last one.
 *
 * This is the `Agent` port of concept section 8 and deliberately *not* `Decision`:
 * `Decision` answers a typed question with a calibrated confidence and generates no text
 * at all, which is why a small local model can serve it. Prose written from a diff is the
 * other kind of work, and mixing the two would mean one port that neither model fits.
 *
 * Equally deliberately not the dock's agent. Asking the running session would work and is
 * the wrong trade: it pays for its whole context — around 300k tokens per turn, concept
 * section 10 — to produce one line, and it only exists while an agent is alive. A dock a
 * human worked in by hand has no session and still needs a commit.
 */
export interface AgentPort {
  /**
   * @param prompt the whole question; the port carries no state to put it in
   * @param cwd where to run, so paths in the answer mean what they say
   * @returns the raw answer. Callers sanitise — a model may fence or chatter.
   */
  ask: (prompt: string, cwd: string) => Promise<string>
}

export interface Clock {
  now: () => Date
}

export interface Ports {
  proc: ProcPort
  fs: FsPort
  host: HostPort
  clock: Clock
}
