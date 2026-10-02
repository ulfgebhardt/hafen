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

import { inspectShip, setArchived, setEnlisted, setRoot, slugOf } from '@hafen/core'

import { tauriPorts } from './adapters/tauri'
import { NOTHING_RUNNING } from './components/measuring'
import { TOOLS } from './components/tools'
import {
  askForges,
  demandsOf,
  identities,
  registerIn,
  surveyInWindow,
  writeRegister,
} from './survey'

import type { Progress } from './components/measuring'
import type { ToolName } from './components/tools'
import type { Places } from './survey'
import type { ForgeStats, Ship, Slug } from '@hafen/core'

export interface Snapshot {
  /** When the **whole** fleet was last surveyed. Never moved by measuring one repository. */
  at: string
  root: string
  ships: readonly Ship[]
  /** When one repository was last measured on its own, where that has happened since. */
  touched?: string
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
  lines: null,
  roots: [],
  lineage: [],
}

/**
 * And the one field that is *inside* a list, so a spread cannot reach it.
 *
 * A submodule gained its url with kinship, and an older cache holds the entries without one — so
 * the list is there, `submodules: []` never fires, and the first reader of `tender.url` gets
 * `undefined` where the type promises `string | null`. The same accident as the others, one level
 * down, and it needs the same answer in the same place rather than a guard at the reader.
 */
const ADDED_TO_TENDER = { url: null }

/** A snapshot from disk, brought up to the shape this window expects. */
export function adopt(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    ships: snapshot.ships.map((ship) => {
      // The shallow fill first, so the list is certainly there — then each entry in it.
      const whole = { ...ADDED, ...ship }
      return {
        ...whole,
        submodules: whole.submodules.map((tender) => ({ ...ADDED_TO_TENDER, ...tender })),
      }
    }),
  }
}

/**
 * How far the measurement has got, and whether somebody has asked it to stop.
 *
 * Kept here because the measuring now happens here. It used to be a *process* with a progress file
 * and a kill signal; a window that measures by itself has neither, and polling a command for a
 * number this module already holds would be the longer way round to the same answer.
 */
let running: Progress = NOTHING_RUNNING
let asked = false

/**
 * A file next to another one.
 *
 * The forge reading is placed *beside* the snapshot and never derived from a cache key: an
 * override names a **file**, and rebuilding its name would throw the override's own filename
 * away. The Rust half keeps the same rule — one placement, two readers.
 */
function beside(path: string, name: string): string {
  const cut = path.lastIndexOf('/')
  return cut < 0 ? name : `${path.slice(0, cut)}/${name}`
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
  // Stamped with the moment it was read, because it is now younger than the picture around it.
  const byPath = new Map(
    fresh.ships.map((ship) => [ship.path, { ...ship, measuredAt: fresh.at }] as const),
  )
  const kept = snapshot.ships.map((ship) => byPath.get(ship.path) ?? ship)
  const added = [...byPath.values()].filter(
    (ship) => !snapshot.ships.some((old) => old.path === ship.path),
  )
  /*
   * `at` stays the time of the last **whole** survey, and that is the point of the field.
   *
   * It used to take the fresh one, so measuring a single repository stamped the other
   * ninety-one with a minute they were not read in — the one lie a timestamp exists to prevent,
   * and the header says that time out loud. `touched` carries the single reading instead, beside
   * it and never over it.
   */
  return { ...snapshot, touched: fresh.at, ships: [...kept, ...added] }
}

/**
 * Where this window keeps its own files, as the Rust half resolves them.
 *
 * Asked rather than rebuilt: the rules are the host's — `$HOME`, the XDG variables, the overrides
 * — and the CLI resolves the same three. Two path conventions for one store would be two opinions
 * about where a register is.
 */
export async function currentPlaces(): Promise<Places> {
  const invoke = caller()
  if (invoke === null) {
    throw new Error('In diesem Fenster gibt es keine Pfade — es laeuft ohne Hafen-Huelle.')
  }
  return (await invoke('port_places')) as Places
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
/**
 * One repository, measured on its own — what the per-ship button asks for.
 *
 * A full survey is ninety repositories and some seconds, and asking for all of them to learn what
 * one of them just did is the reason refreshing felt like something to avoid. The shape of the
 * answer is the same either way, so the caller splices by path and needs no second format.
 */
async function inspectInWindow(
  places: Places,
  path: string,
  forge: readonly ForgeStats[],
): Promise<{ ships: readonly Ship[] }> {
  const [catalog, register, ownEmails] = await Promise.all([
    demandsOf(places.store),
    registerIn(places.store),
    identities(),
  ])
  return {
    ships: [
      await inspectShip(tauriPorts, path, {
        catalog: catalog.quests,
        ownEmails,
        archived: register.archived.includes(path),
        forge,
      }),
    ],
  }
}

export async function remeasure(current: Snapshot, only?: string): Promise<Snapshot> {
  const invoke = caller()
  if (invoke === null) {
    throw new Error('In diesem Fenster laesst sich nicht messen — es laeuft ohne Hafen-Huelle.')
  }

  const places = (await invoke('port_places')) as Places
  running = { at: 0, of: only === undefined ? 0 : 1, path: '', running: true, stopped: false }
  asked = false

  try {
    /*
     * What the forge said, read off the disk — **a file, never a request**.
     *
     * The survey asks nobody anything, here as in the CLI: this is what `hafen forge` wrote
     * earlier, with its own timestamp. Without it the quests that can only be answered from a
     * forge stay `nicht messbar`, which is the fifth verdict doing its job.
     */
    const cached = await tauriPorts.fs.readFile(beside(places.snapshot, 'forge.json'))
    const forge = cached === null ? [] : (JSON.parse(cached) as Forge).stats
    const measured =
      only === undefined
        ? await surveyInWindow(places, {
            forge,
            watching: {
              onCount: (total) => {
                running = { ...running, of: total }
              },
              onShip: (ship) => {
                running = { ...running, at: running.at + 1, path: ship.path }
              },
            },
            stop: () => asked,
          })
        : await inspectInWindow(places, only, forge)

    const fresh = adopt({
      at: new Date().toISOString(),
      root: places.roots.join(', '),
      ships: measured.ships,
    })
    const next = only === undefined ? fresh : spliceShip(current, fresh)

    const failure = await tauriPorts.fs.writeFile(places.snapshot, JSON.stringify(next))
    if (failure !== null) {
      // Said and not swallowed: the picture is right, the next start would not be, and only one of
      // those two is visible from here.
      throw new SnapshotError(failure, places.snapshot, 'hafen schnappschuss')
    }
    return next
  } finally {
    running = { ...running, running: false }
  }
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
  if (path.trim() === '') {
    throw new Error('kein Pfad angegeben')
  }

  /*
   * Written here, with `packages/core`'s own functions.
   *
   * It went through the CLI before, so on a machine without `hafen` on the PATH nothing could be
   * archived, taken on or answered — a register nobody can write is a decision nobody can make.
   * The *format* is still core's and nowhere else: this reads it, hands it to the function that
   * changes it, and writes back what comes out.
   */
  const places = (await invoke('port_places')) as Places
  const register = await registerIn(places.store)
  await writeRegister(
    places.store,
    action === 'archivieren'
      ? setArchived(register, path, true)
      : action === 'reaktivieren'
        ? setArchived(register, path, false)
        : action === 'aufnehmen'
          ? setEnlisted(register, path, true)
          : setEnlisted(register, path, false),
  )
  return await remeasure(current, path)
}

/**
 * Takes a directory on as a place to look, or drops it again — and measures the fleet anew.
 *
 * The whole fleet and not one repository, because this is the one decision that changes *which*
 * repositories there are.
 */
export async function setSearchRoot(
  current: Snapshot,
  path: string,
  searched: boolean,
): Promise<Snapshot> {
  const invoke = caller()
  if (invoke === null) {
    throw new Error('In diesem Fenster laesst sich das Register nicht aendern.')
  }
  const places = (await invoke('port_places')) as Places
  await writeRegister(places.store, setRoot(await registerIn(places.store), path, searched))
  return await remeasure(current)
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

  /*
   * Asked here, in this window.
   *
   * It went through the CLI, so on a machine without `hafen` the button failed for a reason that
   * had nothing to do with the forge. `readStats` answers honestly where a tool is missing — "gh
   * ist nicht installiert" is a *reading* and not an error — so what the capability line says and
   * what this button does now have one cause.
   */
  const places = (await invoke('port_places')) as Places
  const current = await loadSnapshot()
  const reading = await askForges(current.snapshot.ships, null)
  const json = JSON.stringify(reading)
  const failure = await tauriPorts.fs.writeFile(beside(places.snapshot, 'forge.json'), json)
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

/**
 * How far the measurement has got — asked, not pushed.
 *
 * Polled rather than listened for, because this file reaches Tauri through the one global it
 * already uses and carries no `@tauri-apps/api`: a command it can call beats a channel it would
 * have to grow a dependency for, and the thing being polled changes at most ninety times.
 */
export type { Progress } from './components/measuring'
export { NOTHING_RUNNING } from './components/measuring'

export function measuring(): Progress {
  return running
}

/**
 * Stop measuring.
 *
 * It was a signal to a separate process; the window measures by itself now, so it is a flag the
 * survey reads before each repository. What has been measured is **kept** — the cache still holds
 * the last complete measurement, which is exactly what the header goes on saying, and a reading
 * already taken is true whether or not the rest followed.
 */
export function stopMeasuring(): void {
  asked = true
  running = { ...running, stopped: true }
}
