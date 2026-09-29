/**
 * Ages, measured against a clock that is handed in.
 *
 * One implementation rather than one per caller: two copies of this drift, and then a ship
 * counts its rust in whole days while a dock counts its silence in another way.
 */

/**
 * Whole days between an ISO timestamp and now, or `null` when there is nothing to measure.
 *
 * Absence and zero must not look alike. A dock with no commit has no age since its last
 * commit, and answering `0` would read as "committed today".
 */
export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (iso === null || iso === undefined || iso === '') {
    return null
  }
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) {
    return null
  }
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000)
}
