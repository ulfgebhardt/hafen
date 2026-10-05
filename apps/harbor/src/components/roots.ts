/**
 * The roots, as the bar lists them: where the survey looks, and what it found under each.
 *
 * Read off the disk and the snapshot, never kept: a count stored beside a root would be the kept
 * status field this tool exists to replace. The one reading that matters most is the dead root —
 * an unreadable root fails the whole survey on purpose, and a list that hid it would leave the
 * window without the remedy for its own error.
 */

import type { Ship } from '@hafen/core'

/** One root as the disk answered for it. `real` is `null` where it is no directory. */
export interface RootReading {
  path: string
  real: string | null
}

/** Where the list comes from. `fixed` is `$HAFEN_ROOT`, which leads and is not the register's. */
export interface Roots {
  readings: readonly RootReading[]
  fixed: boolean
}

export const NO_ROOTS: Roots = { readings: [], fixed: false }

export interface RootRow {
  path: string
  /** Ships under this root, or `null` where there is no directory to look in. */
  ships: number | null
}

/**
 * Counted against the resolved path, because the survey resolves the ships': a root reached
 * through a link would otherwise count nothing under it. Roots that overlap both count a ship
 * that lies in both — each figure answers "what is under this one", not a share of the fleet.
 */
export function rootRows(roots: Roots, ships: readonly Ship[]): readonly RootRow[] {
  return roots.readings.map(({ path, real }) => ({
    path,
    ships:
      real === null
        ? null
        : ships.filter((ship) => ship.path === real || ship.path.startsWith(`${real}/`)).length,
  }))
}
