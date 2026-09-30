/**
 * Which page a ship belongs on.
 *
 * Ninety hulls on one sheet answered "what is the fleet like" and nothing else. The question a
 * person actually has in front of them is about the handful they are working on — so the active
 * ones get a page to themselves, and the rest is one scroll away instead of in the middle of it.
 *
 * Banded by **activity** and not by `stage`: what git found (a dock open, a branch ahead) says
 * something about a repository, but only "is this in hand" is a thing a fleet view can honestly
 * sort by. `activityOf` already answers it; this is the page layer on top.
 */

import { activityOf, shipPoints } from '@hafen/core'

import type { Activity, Ship } from '@hafen/core'

/** The pages, in the order they are offered. */
export const BANDS = ['active', 'dormant', 'archived'] as const

export type Band = (typeof BANDS)[number]

export const BAND_LABEL: Record<Band, string> = {
  active: 'Aktiv',
  dormant: 'Ruhend',
  archived: 'Archiviert',
}

/** What put a ship on this page — shown under the tab, because a label alone invites guessing. */
export const BAND_MEANING: Record<Band, string> = {
  active: 'in den letzten 30 Tagen angefasst, oder ein Worktree steht offen',
  dormant: 'länger nichts passiert — nicht aufgegeben, nur still',
  archived: 'von Hand weggeräumt, im Register',
}

/**
 * The band a ship falls in.
 *
 * `archived` comes off the ship because the register decided it; the other two are read from the
 * calendar and the worktrees. One function, so the tabs and the count can never disagree.
 */
export function bandOf(ship: Ship): Band {
  const activity: Activity = activityOf(ship, { archived: ship.archived })
  return activity
}

/** Ships per band, every band present even when empty — a tab that vanishes is a tab nobody finds. */
export function byBand(ships: readonly Ship[]): Record<Band, readonly Ship[]> {
  const out: Record<Band, Ship[]> = { active: [], dormant: [], archived: [] }
  for (const ship of ships) {
    out[bandOf(ship)].push(ship)
  }
  return out
}

/**
 * What a band is worth, both counts.
 *
 * Per band and not only in the header, because the header's one figure is the whole machine and
 * answers a different question: "how much of this is in hand" against "how much is there". A fleet
 * whose points are nearly all archived is a different fleet from one whose points are all active,
 * and until now the two looked identical from the tabs.
 */
export function bandPoints(ships: readonly Ship[]): { project: number; own: number } {
  return ships.reduce(
    (sum, ship) => {
      const points = shipPoints(ship)
      return { project: sum.project + points.project, own: sum.own + points.own }
    },
    { project: 0, own: 0 },
  )
}

/**
 * Which band to open on.
 *
 * The active one unless it is empty, because that is the page somebody came for. An empty first
 * page that has to be clicked away is the kind of thing a tool does once before it is closed.
 */
export function firstBand(ships: readonly Ship[]): Band {
  const grouped = byBand(ships)
  return BANDS.find((band) => grouped[band].length > 0) ?? 'active'
}
