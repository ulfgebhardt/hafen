/**
 * The window measuring by itself.
 *
 * Until now it measured by **starting the CLI**: `$HAFEN_CLI`, else `hafen` on the PATH. On a
 * stranger's machine neither exists, so a downloaded binary measured nothing and showed an error
 * with an environment variable in it. This is the same survey `packages/core` has always run,
 * driven from here over `tauriPorts` — which is what `ports.ts` was built for.
 *
 * Nothing about *what* is measured moves: `surveyHarbor` is the one survey, and this file only
 * answers the four questions it asks — where to look, what is demanded, who the reader is, and
 * what the forge said.
 */

import {
  EMPTY_REGISTER,
  mergeCatalogs,
  parseRegister,
  readQuestCatalog,
  renderRegister,
  surveyHarbor,
} from '@hafen/core'

import { tauriPorts } from './adapters/tauri'
import { builtInCatalog } from './catalog'

import type { ForgeStats, Quest, Register, Ship } from '@hafen/core'

/** Where the window's own files live, as the Rust half resolves them. */
export interface Places {
  store: string
  snapshot: string
  roots: readonly string[]
}

/** How far a measurement has got, reported as it runs. */
export interface Watching {
  onCount?: (total: number) => void
  onShip?: (ship: Ship) => void
}

/**
 * The catalog: what the window carries, and then whatever the store adds.
 *
 * The same rule the CLI keeps and for the same reason — **the shipped catalog leads, the store
 * adds**. A store quest reusing an id the catalog already demands is discarded, and the ids are
 * handed back so that can be *said*: a rule whose only bite is invisible is no rule.
 */
export async function demandsOf(store: string): Promise<{
  quests: readonly Quest[]
  overridden: readonly string[]
  unreadable: readonly string[]
}> {
  const builtIn = builtInCatalog()
  const mine = await readQuestCatalog(tauriPorts.fs, store)
  const merged = mergeCatalogs(builtIn, mine)
  return {
    quests: merged.quests,
    overridden: merged.overridden,
    unreadable: [...builtIn.unreadable, ...mine.unreadable],
  }
}

/**
 * Which addresses count as the reader's.
 *
 * `git config --get user.email`, the same question the CLI asks. Without one, every commit would
 * count as somebody else's and a personal nought would stand beside a busy fleet — which is worse
 * than no figure at all.
 */
export async function identities(): Promise<readonly string[]> {
  const configured = await tauriPorts.proc.run('git', ['config', '--get', 'user.email'])
  const own = configured.code === 0 ? configured.stdout.trim().toLowerCase() : ''
  return own === '' ? [] : [own]
}

/** The register: what is put away, what to treat as a ship anyway, and where to look. */
export async function registerIn(store: string): Promise<Register> {
  const raw = await tauriPorts.fs.readFile(`${store}/register.md`)
  // A machine with no register has made no decisions, which is not the same as a broken one — and
  // anything that is not text is the same answer: there is nothing here that was written by hand.
  return typeof raw === 'string' ? parseRegister(raw) : EMPTY_REGISTER
}

/**
 * Writes the register back.
 *
 * The format is `packages/core`'s, here as in the CLI — the window only reads it, changes it with
 * `setArchived`, `setEnlisted` or `setRoot`, and writes what comes out. A second opinion about
 * the shape of a file both of them edit is the one thing that must not exist.
 *
 * It went through the CLI before, which meant a stranger's machine could not record a decision at
 * all: no `hafen` on the PATH, no archiving, no first-run answer.
 */
export async function writeRegister(store: string, register: Register): Promise<void> {
  const failure = await tauriPorts.fs.writeFile(`${store}/register.md`, renderRegister(register))
  if (failure !== null) {
    throw new Error(failure)
  }
}

/**
 * Where to look, and in which order the two sources count.
 *
 * `$HAFEN_ROOT` **leads** where it is set: it is an override somebody typed on purpose, and an
 * override a stored decision could beat would not be one. Otherwise the register, which is where
 * the answer to the first-run question goes.
 *
 * Neither, and the answer is **nothing** — not `~/Projects`, not `~/src`, not `$HOME`. A guess
 * list is what this tool does not do: "Wer eine Rateliste pflegt, hat die Messung gegen eine
 * bessere Vermutung getauscht." An empty harbour that says nobody has been asked yet is a true
 * drawing; a full one built out of a guess is not.
 */
export function rootsFor(places: Places, register: Register): readonly string[] {
  return places.roots.length > 0 ? places.roots : register.roots
}

/** Whether this machine has ever been told where its projects are. */
export function needsRoots(places: Places, register: Register): boolean {
  return rootsFor(places, register).length === 0
}

/**
 * Measure the fleet, here, in this window.
 *
 * `forge` is handed in rather than fetched: the survey asks nobody anything, and what it reads is
 * the file `hafen forge` wrote earlier, with its own timestamp.
 */
export async function surveyInWindow(
  places: Places,
  options: {
    forge?: readonly ForgeStats[]
    watching?: Watching
    /** Asked before each repository — see `SurveyOptions.stop`. What is measured is kept. */
    stop?: () => boolean
  } = {},
): Promise<{ ships: readonly Ship[]; overridden: readonly string[] }> {
  const [catalog, register, ownEmails] = await Promise.all([
    demandsOf(places.store),
    registerIn(places.store),
    identities(),
  ])

  const ships = await surveyHarbor(tauriPorts, rootsFor(places, register), {
    register,
    catalog: catalog.quests,
    ownEmails,
    forge: options.forge ?? [],
    progress: {
      ...options.watching,
      ...(options.stop === undefined ? {} : { stop: options.stop }),
    },
  })

  return { ships, overridden: catalog.overridden }
}

/**
 * Ask the human where their projects are, once.
 *
 * The native folder picker, through the one global this file already reaches Tauri by — so the
 * browser build still carries no Tauri code at all. `null` is "they closed it", which is an
 * answer and not a failure.
 *
 * This is the measurement that replaces the guess. The CLI took `$HAFEN_ROOT` or two directories
 * of one person's own convention; a list of `~/Projects`, `~/src`, `~/code` would be the tool
 * trading a measurement for a better-looking assumption. Asking is cheap and it is *right*.
 */
export async function askForRoot(): Promise<string | null> {
  const host = globalThis as {
    __TAURI_INTERNALS__?: {
      invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>
    }
  }
  const invoke = host.__TAURI_INTERNALS__?.invoke
  if (invoke === undefined) {
    return null
  }
  const chosen = await invoke('plugin:dialog|open', {
    options: { directory: true, multiple: false, title: 'Wo liegen deine Projekte?' },
  })
  return typeof chosen === 'string' && chosen !== '' ? chosen : null
}
