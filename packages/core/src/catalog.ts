/**
 * Two catalogs, one norm: the fleet's demands, plus what a ship demands of itself.
 *
 * The fleet catalog is the norm — a repository that could answer its own demands down could
 * exempt itself, and then the evaluation is a kept status field again rather than a
 * measurement against something somebody decided. So a ship may **add** and never **weaken**:
 * a local quest with an id the fleet already demands is dropped, and dropped *out loud*.
 *
 * Why a ship may add at all: `gilt_fuer` is a closed vocabulary over the whole fleet (`node`,
 * `rust`), and there is no way to write "this one project owes a DAV migration check" into it.
 * That demand is real, belongs to one repository, and has nowhere else to live.
 *
 * Exempting is the other direction and deliberately not here: a ship that owes a demand and
 * should not is a decision of the human's, and it belongs in the register — one place, visible,
 * beside the other decision the register already carries.
 */

import { questCatalog, readQuestCatalog } from './quest'

import type { FsPort } from './ports'
import type { Quest, QuestCatalog } from './quest'

/**
 * Where a ship keeps what it demands of itself: `<ship>/.hafen/quests/<kette>/<id>.md`.
 *
 * Under a dot directory and not at the root, because most of these repositories are not ours
 * alone — a `quests/` beside `src/` is a directory this tool put in somebody else's project.
 * The layout under it is the store's, verbatim, so the same reader answers both and a quest
 * can be moved from one to the other by copying the file.
 */
export const SHIP_STORE = '.hafen'

/** Where a quest came from. Carried beside the verdict, because "the fleet demands this" and
 * "this repository demands this of itself" are read differently by whoever is looking. */
export type QuestOrigin = 'fleet' | 'ship'

export interface MergedCatalog {
  /** What applies, in catalog order. */
  quests: readonly Quest[]
  /** Origin per quest id — every id in `quests` has one. */
  origin: ReadonlyMap<string, QuestOrigin>
  /**
   * Ids the ship demanded that the fleet already demands, so its file was dropped.
   *
   * Said rather than skipped: a human who wrote a quest file and sees no effect is owed the
   * reason, and "the catalog leads" is only a rule if the one time it bites is visible.
   */
  overridden: readonly string[]
  /** Paths that did not read as a quest, fleet ones first. Prefixed by where they lie. */
  unreadable: readonly string[]
}

/**
 * The fleet catalog with a ship's own demands folded in.
 *
 * Order is the catalog's own (`questCatalog`: by chain, then by id) and not fleet-then-ship —
 * where a demand was written down is not how urgent it is, and a ship's quest sorted to the
 * bottom would read as an afterthought.
 */
export function mergeCatalogs(fleet: QuestCatalog, ship: QuestCatalog): MergedCatalog {
  const known = new Set(fleet.quests.map((quest) => quest.id))
  const origin = new Map<string, QuestOrigin>()
  for (const quest of fleet.quests) {
    origin.set(quest.id, 'fleet')
  }

  const added: Quest[] = []
  const overridden: string[] = []
  for (const quest of ship.quests) {
    if (known.has(quest.id)) {
      overridden.push(quest.id)
      continue
    }
    // A ship that names the same id twice across two chains gets the first; the second is the
    // same collision as against the fleet, and the same answer.
    if (origin.has(quest.id)) {
      overridden.push(quest.id)
      continue
    }
    origin.set(quest.id, 'ship')
    added.push(quest)
  }

  return {
    quests: questCatalog([...fleet.quests, ...added]),
    origin,
    overridden: [...overridden].sort(),
    unreadable: [...fleet.unreadable, ...ship.unreadable.map((path) => `${SHIP_STORE}/${path}`)],
  }
}

/**
 * A ship's own catalog, or an empty one where it keeps none.
 *
 * `readQuestCatalog` answers both stores because the layout under them is the same; this is
 * the one place that knows a ship's is a dot directory inside it.
 */
export async function readShipCatalog(
  fs: Pick<FsPort, 'readDir' | 'readFile'>,
  shipPath: string,
): Promise<QuestCatalog> {
  return await readQuestCatalog(fs, `${shipPath}/${SHIP_STORE}`)
}
