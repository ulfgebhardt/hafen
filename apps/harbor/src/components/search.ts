/**
 * Finding one repository among ninety.
 *
 * Here and not in a template for the reason every other reading is: what counts as a match is a
 * decision about what a person sees, and a decision belongs where a test can point at it.
 *
 * Matched against **name, org and path** — three fields and not one, because all three are how
 * somebody actually names a repository from memory. `ocelot`, `gradido`, `games` and `mojotrollz`
 * are each the only word a person would have, and only one of them is a repository name.
 *
 * Deliberately **not** fuzzy. A substring is a rule a reader can predict, and predictability is
 * the whole value of a filter over ninety things: a fuzzy match that quietly brings up three
 * unrelated repositories costs more trust than it saves keystrokes.
 */

import type { Ship } from '@hafen/core'

/**
 * Every word has to match somewhere — not the whole phrase in one field.
 *
 * `ocelot deploy` should find `Ocelot-Social-Community/Ocelot-Social-Deploy-Aufbau`, and it does
 * not as one substring. Words are the unit somebody types in; a phrase is what they would have to
 * get right.
 */
export function matches(ship: Ship, query: string): boolean {
  const words = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '')
  if (words.length === 0) {
    return true
  }

  const haystack = `${ship.org}/${ship.name} ${ship.path}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/**
 * The ships a query leaves, in the order they came.
 *
 * The order is not re-sorted by relevance, and that is on purpose: the harbour is drawn biggest
 * first, and a filter that also reshuffled would move a ship for two reasons at once. Filtering
 * takes things away; it does not rearrange what is left.
 */
export function filterShips(ships: readonly Ship[], query: string): readonly Ship[] {
  return query.trim() === '' ? ships : ships.filter((ship) => matches(ship, query))
}
