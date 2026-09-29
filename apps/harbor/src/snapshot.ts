/**
 * Where the picture comes from — and never where it is measured.
 *
 * Two ways in, because the window runs in two places and they answer differently:
 *
 * - In Tauri the snapshot is read **at runtime** from disk, through the one command the shell
 *   has. Bundling it with the frontend would make it as old as the build, and nothing on screen
 *   would say so — which is the difference between a desktop app and a screenshot.
 * - In a browser there is no such command, so it is fetched from `public/`. That is the
 *   development path and the reason `pnpm dev` works without building anything Rust.
 *
 * Neither branch measures. `hafen schnappschuss` walks the repositories; this reads what it
 * wrote. The window has no shell permission at all, so that promise is held by the capability
 * file rather than by this comment.
 */

import type { Ship } from '@hafen/core'

export interface Snapshot {
  at: string
  root: string
  ships: readonly Ship[]
}

/** What the Rust side answers: the path either way, the contents or the reason. */
interface Read {
  path: string
  json: string | null
  error: string | null
}

/**
 * Tauri's `invoke`, or `null` in a browser.
 *
 * Read off the global rather than imported from `@tauri-apps/api`, so the browser build carries
 * no Tauri code at all — and so this file has no dependency that only one of its two callers can
 * satisfy.
 */
function invoker(): ((command: string) => Promise<unknown>) | null {
  const host = globalThis as { __TAURI_INTERNALS__?: { invoke?: unknown } }
  const invoke = host.__TAURI_INTERNALS__?.invoke
  return typeof invoke === 'function' ? (invoke as (command: string) => Promise<unknown>) : null
}

export function inTauri(): boolean {
  return invoker() !== null
}

/**
 * The snapshot, with the place it came from.
 *
 * `source` travels with it because the two paths fail differently and a human fixes them
 * differently: a missing file in the cache is one command away, a 404 on `snapshot.json` means
 * the dev server was started without one.
 */
export interface Loaded {
  snapshot: Snapshot
  source: string
}

export class SnapshotError extends Error {
  public constructor(
    message: string,
    /** Where it was looked for — the one useful thing to say about a snapshot that is not there. */
    public readonly source: string,
    /** What to type to make one. */
    public readonly remedy: string,
  ) {
    super(message)
    this.name = 'SnapshotError'
  }
}

async function fromTauri(invoke: (command: string) => Promise<unknown>): Promise<Loaded> {
  const read = (await invoke('snapshot')) as Read
  if (read.json === null) {
    throw new SnapshotError(
      read.error ?? 'nicht lesbar',
      read.path,
      'hafen schnappschuss > "$XDG_CACHE_HOME/hafen/snapshot.json"',
    )
  }
  return { snapshot: JSON.parse(read.json) as Snapshot, source: read.path }
}

async function fromWeb(): Promise<Loaded> {
  const at = 'snapshot.json'
  let response: Response
  try {
    response = await fetch(at)
  } catch (error) {
    throw new SnapshotError(String(error), at, 'pnpm --filter @hafen/harbor snapshot')
  }
  if (!response.ok) {
    throw new SnapshotError(
      `${String(response.status)} ${response.statusText}`,
      at,
      'pnpm --filter @hafen/harbor snapshot',
    )
  }
  return { snapshot: (await response.json()) as Snapshot, source: at }
}

export async function loadSnapshot(): Promise<Loaded> {
  const invoke = invoker()
  return invoke === null ? await fromWeb() : await fromTauri(invoke)
}
