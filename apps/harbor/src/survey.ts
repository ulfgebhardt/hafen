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

/** The register: what is put away, and which directories to treat as ships anyway. */
export async function registerIn(store: string): Promise<Register> {
  const raw = await tauriPorts.fs.readFile(`${store}/register.md`)
  return raw === null ? EMPTY_REGISTER : parseRegister(raw)
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

  const ships = await surveyHarbor(tauriPorts, places.roots, {
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
