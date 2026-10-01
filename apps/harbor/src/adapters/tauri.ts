/**
 * The window's own `Ports`, so it measures by itself.
 *
 * This is what `packages/core` was built around: *"Ports are the only way `core` touches the
 * outside world … A direct `node:fs` import here would make two of those three impossible."* The
 * CLI has had its adapter since the beginning; the window borrowed it by **starting the CLI**,
 * which worked exactly as long as somebody had a checkout. A downloaded binary measured nothing,
 * because no stranger has `hafen` on their PATH.
 *
 * Every call here is one Tauri command, and the readings they may make are gated in `ports.rs` —
 * so the allow list that used to be a *test* about the CLI is now a *guard* the window cannot get
 * past. That is the trade this adapter was chosen for; it is not a side effect of it.
 */

import type { CommandResult, Ports } from '@hafen/core'

/** Tauri's `invoke`, or nothing in a browser. */
function invoker(): ((command: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const host = globalThis as {
    __TAURI_INTERNALS__?: { invoke?: (command: string, args?: Record<string, unknown>) => unknown }
  }
  const invoke = host.__TAURI_INTERNALS__?.invoke
  return typeof invoke === 'function'
    ? (invoke as (command: string, args?: Record<string, unknown>) => Promise<unknown>)
    : null
}

/** Whether this window can measure at all — false in a browser, where there is no Rust half. */
export function canMeasure(): boolean {
  return invoker() !== null
}

/**
 * The machine's own readings, asked once.
 *
 * Nothing in `core` reads them today — `HostPort` came over from Werft with the rest of the
 * interface — so this is the honest shape rather than a cache of something hot: one call, and a
 * reading that is missing says so with a nought rather than with a guess.
 */
let machine: { cpus: number; memory: number } | null = null

/** Tauri's `invoke`, or a loud failure — the one place that decides a window cannot measure. */
function demand(): (command: string, args?: Record<string, unknown>) => Promise<unknown> {
  const invoke = invoker()
  if (invoke === null) {
    throw new Error('Ohne die Rust-Haelfte kann das Fenster nicht messen.')
  }
  return invoke
}

/**
 * The window's ports.
 *
 * Throws where there is no Rust half, and does so **when a call is made** rather than when the
 * module is imported: a browser can still read a published `snapshot.json`, and refusing to load
 * would take that away to prevent something nobody asked for.
 */
export const tauriPorts: Ports = {
  proc: {
    run: async (command, args, cwd): Promise<CommandResult> => {
      const invoke = demand()
      return (await invoke('port_run', {
        command,
        args: [...args],
        cwd: cwd ?? null,
      })) as CommandResult
    },
    which: async (command): Promise<string | null> =>
      (await demand()('port_which', { command })) as string | null,
  },
  fs: {
    readFile: async (path): Promise<string | null> =>
      (await demand()('port_read_file', { path })) as string | null,
    readDir: async (path): Promise<readonly string[] | null> =>
      (await demand()('port_read_dir', { path })) as readonly string[] | null,
    isDirectory: async (path): Promise<boolean> =>
      (await demand()('port_is_directory', { path })) as boolean,
    realPath: async (path): Promise<string | null> =>
      (await demand()('port_real_path', { path })) as string | null,
    writeFile: async (path, contents): Promise<string | null> =>
      (await demand()('port_write_file', { path, contents })) as string | null,
  },
  host: {
    cpuCount: (): number => machine?.cpus ?? 1,
    totalMemory: (): number => machine?.memory ?? 0,
    // Not measured, and that is what a nought-free `null` says. Nothing in `core` asks, and a
    // figure invented for an unused reading is worse than its absence.
    freeDiskBytes: async (): Promise<number | null> => null,
  },
  clock: { now: (): Date => new Date() },
}

/** Reads the machine's own figures once, so `cpuCount` can stay the synchronous call it is. */
export async function readMachine(): Promise<void> {
  const invoke = invoker()
  if (invoke === null) {
    return
  }
  machine = (await invoke('port_host')) as { cpus: number; memory: number }
}
