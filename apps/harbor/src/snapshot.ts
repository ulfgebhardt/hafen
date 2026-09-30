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

import { slugOf } from '@hafen/core'

import { TOOLS } from './components/tools'

import type { ToolName } from './components/tools'
import type { ForgeStats, Ship, Slug } from '@hafen/core'

export interface Snapshot {
  at: string
  root: string
  ships: readonly Ship[]
}

/**
 * Fields added to `Ship` since some snapshot on disk was written.
 *
 * Every one of these blanked the datasheet once: the type says a ship has `branches`, the cache
 * written last week says nothing of the kind, and `staleBranches(undefined)` throws. Guarding at
 * each reader was tried and is the wrong shape — the type is *right* about a freshly measured
 * ship, so every guard reads as unnecessary and the linter says so, and the next field added has
 * the same accident waiting for it.
 *
 * So it is filled in once, here, where a snapshot crosses from disk into this window. Empty and
 * never invented: what an old measurement did not record, this cannot know, and an empty list says
 * that honestly. The remedy is one click away and the bar says so.
 */
const ADDED: Partial<Ship> = {
  branches: [],
  defaultBranch: null,
  submodules: [],
  enlisted: false,
}

/** A snapshot from disk, brought up to the shape this window expects. */
export function adopt(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    ships: snapshot.ships.map((ship) => ({ ...ADDED, ...ship })),
  }
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
  return { snapshot: adopt(JSON.parse(read.json) as Snapshot), source: read.path }
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
  return { snapshot: adopt((await response.json()) as Snapshot), source: at }
}

export async function loadSnapshot(): Promise<Loaded> {
  const invoke = invoker()
  return invoke === null ? await fromWeb() : await fromTauri(invoke)
}

/**
 * Tauri's `invoke` with arguments, for the three commands that take some.
 *
 * Kept apart from `invoker` rather than widening it: the read path takes none, and a signature
 * that allows arguments where there are none is one somebody eventually passes something to.
 */
function caller(): ((command: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const host = globalThis as { __TAURI_INTERNALS__?: { invoke?: unknown } }
  const invoke = host.__TAURI_INTERNALS__?.invoke
  return typeof invoke === 'function'
    ? (invoke as (command: string, args?: Record<string, unknown>) => Promise<unknown>)
    : null
}

/**
 * One repository's new measurement, folded into the snapshot that is on screen.
 *
 * By path, and it may be absent from either side: a repository measured for the first time is
 * added, one that no longer measures as a ship is left where it was rather than vanishing under a
 * person who was reading it. A ship's path is what identifies it everywhere else here too — the
 * scene's `highlight` compares the same field.
 */
export function spliceShip(snapshot: Snapshot, fresh: Snapshot): Snapshot {
  const byPath = new Map(fresh.ships.map((ship) => [ship.path, ship]))
  const kept = snapshot.ships.map((ship) => byPath.get(ship.path) ?? ship)
  const added = fresh.ships.filter((ship) => !snapshot.ships.some((old) => old.path === ship.path))
  return { ...snapshot, at: fresh.at, ships: [...kept, ...added] }
}

/**
 * Measures again — the whole fleet, or one repository of it.
 *
 * The result is written to the cache before it is returned, so the next start shows what was just
 * measured. Writing is a second command on purpose: the merge needs to know what a snapshot is,
 * and the shell deliberately does not.
 *
 * Only in Tauri. In a browser there is nothing to run, and a button that failed in the click would
 * be worse than no button — which is why `canMeasure` exists and the bar asks it first.
 */
export async function remeasure(current: Snapshot, only?: string): Promise<Snapshot> {
  const invoke = caller()
  if (invoke === null) {
    throw new Error('In diesem Fenster laesst sich nicht messen — es laeuft ohne Hafen-Huelle.')
  }

  const measured = (await invoke('measure', { only: only ?? null })) as {
    json: string | null
    error: string | null
  }
  if (measured.json === null) {
    throw new Error(measured.error ?? 'Messung ohne Antwort')
  }

  const fresh = adopt(JSON.parse(measured.json) as Snapshot)
  const next = only === undefined ? fresh : spliceShip(current, fresh)

  const failure = (await invoke('store', { json: JSON.stringify(next) })) as string | null
  if (failure !== null) {
    // Said and not swallowed: the picture is right, the next start would not be, and only one of
    // those two is visible from here.
    throw new SnapshotError(failure, '(Cache)', 'hafen schnappschuss')
  }
  return next
}

/** The four things the register can be told. The CLI's own words — one vocabulary, not a mapping. */
export const REGISTER_ACTIONS = ['archivieren', 'reaktivieren', 'aufnehmen', 'entfernen'] as const

export type RegisterAction = (typeof REGISTER_ACTIONS)[number]

/**
 * Puts a repository away, fetches it back, takes a directory on, or drops it.
 *
 * Followed by a measurement of that one repository, because `archived` travels on the ship and the
 * register is what decides it: flipping the field here as well would be a second opinion about a
 * file that was just written. One round trip more, and nothing to keep in step.
 */
export async function setRegister(
  current: Snapshot,
  action: RegisterAction,
  path: string,
): Promise<Snapshot> {
  const invoke = caller()
  if (invoke === null) {
    throw new Error('In diesem Fenster laesst sich das Register nicht aendern.')
  }

  const failure = (await invoke('register', { action, path })) as string | null
  if (failure !== null) {
    throw new Error(failure)
  }
  return await remeasure(current, path)
}

/**
 * Which of them this machine can actually offer.
 *
 * Asked once and never guessed: a button for an editor nobody installed is a button that fails in
 * the click, and the window has the same rule for measuring. Empty in a browser, where there is no
 * shell to ask.
 */
export async function availableTools(): Promise<readonly ToolName[]> {
  const invoke = caller()
  if (invoke === null) {
    return []
  }
  // An answer this cannot read is no tools rather than a thrown error: whatever went wrong with
  // the tool list, it must not be the reason the harbour fails to draw.
  const named: unknown = await invoke('tools')
  return Array.isArray(named) ? TOOLS.filter((name) => named.includes(name)) : []
}

/**
 * Starts a tool in a repository.
 *
 * Four of the five hand over — they open something a human then decides in. The fifth writes, and
 * narrowly: `git remote prune origin` removes remote-tracking refs for branches the remote no
 * longer has, which is no commit and no local branch.
 */
export async function startTool(name: ToolName, path: string): Promise<void> {
  const invoke = caller()
  if (invoke === null) {
    throw new Error('In diesem Fenster laesst sich kein Werkzeug starten.')
  }
  const failure = (await invoke('run_tool', { name, path })) as string | null
  if (failure !== null) {
    throw new Error(failure)
  }
}

/**
 * Deletes one local branch, with git's own refusal as the safety.
 *
 * `-d` on the Rust side and never `-D`. One at a time and never a sweep: forty branches deleted by
 * one click is forty decisions nobody made.
 */
export async function deleteBranch(path: string, branch: string): Promise<void> {
  const invoke = caller()
  if (invoke === null) {
    throw new Error('In diesem Fenster laesst sich kein Branch loeschen.')
  }
  const failure = (await invoke('branch_delete', { path, branch })) as string | null
  if (failure !== null) {
    throw new Error(failure)
  }
}

/**
 * What the forges said, read from its own file.
 *
 * A second reading with a second age, and the window shows both times — the survey is six seconds
 * of disk and this is seventeen of network, so they are never the same age and pretending
 * otherwise would be the one lie a timestamp exists to prevent.
 */
export interface Forge {
  at: string
  stats: readonly ForgeStats[]
  unread: readonly { slug: Slug; reason: string }[]
}

const EMPTY_FORGE: Forge = { at: '', stats: [], unread: [] }

/** The reading on disk, or nothing at all — an absent file is not an error, it is "never asked". */
export async function loadForge(): Promise<Forge> {
  const invoke = caller()
  try {
    if (invoke === null) {
      const response = await fetch('forge.json')
      return response.ok ? ((await response.json()) as Forge) : EMPTY_FORGE
    }
    const read = (await invoke('snapshot', { which: 'forge' })) as { json: string | null }
    return read.json === null ? EMPTY_FORGE : (JSON.parse(read.json) as Forge)
  } catch {
    return EMPTY_FORGE
  }
}

/** Asks the forges again, and keeps the answer. */
export async function refetchForge(): Promise<Forge> {
  const invoke = caller()
  if (invoke === null) {
    throw new Error('In diesem Fenster laesst sich keine Forge fragen.')
  }

  const measured = (await invoke('forge')) as { json: string | null; error: string | null }
  if (measured.json === null) {
    throw new Error(measured.error ?? 'Die Forge-Abfrage kam ohne Antwort zurueck.')
  }

  const reading = JSON.parse(measured.json) as Forge
  const failure = (await invoke('store', {
    json: measured.json,
    which: 'forge',
  })) as string | null
  if (failure !== null) {
    throw new SnapshotError(failure, '(Cache)', 'hafen forge')
  }
  return reading
}

/**
 * The figures for one ship, by what its `origin` points at.
 *
 * Matched on the slug and never merged into the snapshot: the two readings have different ages,
 * and folding one into the other would give the older number the younger timestamp.
 */
export function statsFor(forge: Forge, ship: Ship): ForgeStats | null {
  const origin = ship.remotes.find((remote) => remote.name === 'origin')
  const slug = origin === undefined ? null : slugOf(origin.url)
  if (slug === null) {
    return null
  }
  const wanted = `${slug.host}/${slug.owner}/${slug.repo}`.toLowerCase()
  return (
    forge.stats.find(
      (one) => `${one.slug.host}/${one.slug.owner}/${one.slug.repo}`.toLowerCase() === wanted,
    ) ?? null
  )
}

/** Opens a forge page. Checked on the Rust side against a closed list of hosts. */
export async function openForge(url: string): Promise<void> {
  const invoke = caller()
  if (invoke === null) {
    globalThis.open(url, '_blank', 'noopener')
    return
  }
  const failure = (await invoke('open_url', { url })) as string | null
  if (failure !== null) {
    throw new Error(failure)
  }
}
