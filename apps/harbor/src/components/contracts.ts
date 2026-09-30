/**
 * The catalog read across the whole fleet — one row per demand instead of one per ship.
 *
 * The datasheet asks a quest of one ship. This asks one quest of ninety, and that is a different
 * question with a different answer. Measured on this fleet, two of thirteen demands settle
 * *nothing at all*: `werft/build` is `nicht messbar` on all 44 repositories it reaches, and
 * `auslauf/geschuetzter-hauptzweig` is `Voraussetzung offen` on 38 of them. Read per ship each of
 * those is one grey line among thirteen and invisible; read per demand it is the whole row.
 *
 * Here beside `fleet.ts` rather than in `core` for the same reason `countVerdicts` is: it is what
 * a page needs to know, worked out once so a template cannot be argued with. If a `hafen
 * vertraege` ever wants the same rows, this moves and nothing else changes.
 *
 * **"Vertrag" here is the fleet's demand, not the ship's `Test-Vertrag`.** The sheet uses that
 * second phrase for the scripts a repository runs, which is how it *answers* these demands. Two
 * sides of one agreement, and worth saying out loud because the two words are nearly the same.
 */

import { QUEST_CHAINS } from '@hafen/core'

import type { QuestChain, QuestResult, QuestVerdict, Ship } from '@hafen/core'

/** One demand, weighed against every ship it reaches. */
export interface ContractTally {
  id: string
  chain: QuestChain
  title: string
  /** The demand's own reason — the decision behind it, carried so a row is not just a number. */
  why: string
  counts: ReadonlyMap<QuestVerdict, number>
  /** How many ships it reaches: everything it did not answer `notApplicable` about. */
  binding: number
  /**
   * How many ships it found wanting: `verletzt` plus `Voraussetzung offen`.
   *
   * **Not** `binding - met`, and the difference was visible the first time this page was drawn:
   * `werft/build` is `nicht messbar` on all 44 repositories it reaches, and that arithmetic
   * reported "44 offen" — a claim that 44 ships owe something, off a demand that measured nothing.
   * Unmessbar ist nicht verletzt, and a number is the easiest place to break that rule by
   * accident.
   */
  outstanding: number
  /**
   * Whether it decided anything anywhere — no `erfüllt` and no `verletzt` on the whole fleet.
   *
   * Not an error and never drawn as one. A demand can be right and unanswerable here, and the
   * five verdicts exist so that that can be said. But a demand that answers nothing is worth
   * *seeing*, because it is indistinguishable from a working one until somebody counts.
   */
  silent: boolean
}

/** One chain, and the demands under it. */
export interface ChainTally {
  chain: QuestChain
  contracts: readonly ContractTally[]
  /** Distinct ships at least one demand in this chain reaches. */
  binding: number
}

/**
 * The whole catalog, grouped by chain, in the chains' own order.
 *
 * Every chain is offered, including the ones nothing is filed under. Same argument as the empty
 * band tab: "diese Kette fordert heute nichts" is an answer, and a heading that disappears when
 * it is empty is one nobody finds again to ask why.
 *
 * The demands come out of the *ships* and not out of a catalog file, because that is what was
 * actually measured — a quest a repository added locally shows up here as itself, and a quest in
 * the store that reached nothing simply has no row rather than a row of zeroes it never earned.
 */
export function tallyContracts(ships: readonly Ship[]): readonly ChainTally[] {
  const rows = new Map<string, { quest: QuestResult; counts: Map<QuestVerdict, number> }>()
  const reached = new Map<QuestChain, Set<string>>()

  for (const ship of ships) {
    for (const quest of ship.quests) {
      const row = rows.get(quest.id) ?? { quest, counts: new Map<QuestVerdict, number>() }
      row.counts.set(quest.verdict, (row.counts.get(quest.verdict) ?? 0) + 1)
      rows.set(quest.id, row)

      if (quest.verdict !== 'notApplicable') {
        const seen = reached.get(quest.chain) ?? new Set<string>()
        seen.add(ship.path)
        reached.set(quest.chain, seen)
      }
    }
  }

  const tallies = [...rows.values()].map(({ quest, counts }): ContractTally => {
    const of = (verdict: QuestVerdict): number => counts.get(verdict) ?? 0
    return {
      id: quest.id,
      chain: quest.chain,
      title: quest.title,
      why: quest.why,
      counts,
      binding: [...counts].reduce(
        (sum, [verdict, count]) => sum + (verdict === 'notApplicable' ? 0 : count),
        0,
      ),
      outstanding: of('violated') + of('waiting'),
      silent: of('met') === 0 && of('violated') === 0,
    }
  })

  return QUEST_CHAINS.map((chain) => ({
    chain,
    // By id within a chain: the only second key that does not move between two snapshots.
    contracts: tallies
      .filter((one) => one.chain === chain)
      .sort((a, b) => a.id.localeCompare(b.id)),
    binding: reached.get(chain)?.size ?? 0,
  }))
}

/**
 * What was picked on the catalog page.
 *
 * `verdict: null` is the row itself and means **found wanting**: `verletzt` or `Voraussetzung
 * offen`. A named verdict is one segment of its bar.
 *
 * Both are needed and neither covers the other. `geschuetzter-hauptzweig` has no `verletzt` at
 * all, so "show me who breaks it" would answer nothing where 38 ships are waiting on it — and
 * `nicht messbar` is in neither, because a demand that could not look has found nothing.
 */
export interface ContractFilter {
  id: string
  verdict: QuestVerdict | null
}

/** Whether this ship is what the pick asked for. */
export function matchesContract(ship: Ship, filter: ContractFilter): boolean {
  const quest = ship.quests.find((one) => one.id === filter.id)
  if (quest === undefined) {
    return false
  }
  return filter.verdict === null
    ? quest.verdict === 'violated' || quest.verdict === 'waiting'
    : quest.verdict === filter.verdict
}

/**
 * The ships a pick leaves, in the order they came.
 *
 * Same rule as the search filter: taking away, never rearranging. A basin that also reshuffled
 * would move a hull for two reasons at once.
 */
export function filterByContract(
  ships: readonly Ship[],
  filter: ContractFilter | null,
): readonly Ship[] {
  return filter === null ? ships : ships.filter((ship) => matchesContract(ship, filter))
}

/**
 * How many ships a pick would leave — for the row, before anybody clicks it.
 *
 * The same function the filter uses, so the number under the cursor and the basin behind it can
 * never say different things.
 */
export function contractCount(ships: readonly Ship[], filter: ContractFilter): number {
  return filterByContract(ships, filter).length
}
