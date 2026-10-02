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

/**
 * The page that is not a band: the catalog, read across the fleet instead of per ship.
 *
 * Not a fourth `Band`, and the distinction is load-bearing. `bandOf` maps a ship to a page, and
 * every ship has exactly one — the catalog page has no ships at all, it has demands. Folding it
 * into `BANDS` would make `byBand` owe a list for a page that does not ask for one, and the first
 * thing to break would be the counts beside the tabs.
 */
export const CONTRACTS = 'contracts'

/**
 * The whole fleet at once, drawn as a fan and grouped by organisation.
 *
 * Its own page and **not** a switch on the band pages, because it deliberately ignores the bands:
 * the question it answers is "what does this organisation own", and an answer split across three
 * tabs by how recently each repository was touched is not that answer. A dormant mirror belongs
 * beside the product it mirrors.
 */
export const FLEET = 'fleet'

/**
 * The same sheet with the archive on it.
 *
 * The fleet page leaves the archived ships off by default: they are put away by a decision in the
 * register, and a sheet of the whole machine where half the hulls are ones nobody means to touch
 * again is mostly archive. They are still part of the answer to "what does this organisation
 * own", so the full sheet is one tab away rather than gone — the same reasoning that keeps the
 * empty bands on the dock's tab bar.
 */
export const FLEET_ARCHIVE = 'fleetArchive'

export type Page = Band | typeof CONTRACTS | typeof FLEET | typeof FLEET_ARCHIVE

export const PAGES: readonly Page[] = [...BANDS, FLEET, FLEET_ARCHIVE, CONTRACTS]

export const PAGE_LABEL: Record<Page, string> = {
  ...BAND_LABEL,
  [FLEET]: 'Flotte',
  [FLEET_ARCHIVE]: 'mit Archiv',
  [CONTRACTS]: 'Verträge',
}

export const PAGE_MEANING: Record<Page, string> = {
  ...BAND_MEANING,
  [FLEET]: 'alle Schiffe außer den archivierten, nach Reederei — ohne Bänder',
  [FLEET_ARCHIVE]: 'alle Schiffe, auch die archivierten, nach Reederei — ohne Bänder',
  [CONTRACTS]: 'was die Flotte fordert — je Forderung statt je Schiff',
}

/** Whether this is one of the fleet sheets, with or without the archive. */
export function isFleet(page: Page): page is typeof FLEET | typeof FLEET_ARCHIVE {
  return page === FLEET || page === FLEET_ARCHIVE
}

/** Whether this page splits the fleet into bands at all. */
export function isBand(page: Page): page is Band {
  return page !== CONTRACTS && !isFleet(page)
}

/**
 * The ships a page draws, out of the ones that came in.
 *
 * One place, because two things ask: the drawing, and the count and points beside the tab. Worked
 * out separately they were already two answers once — the fleet tab counted demands while the
 * sheet beside it drew hulls.
 */
export function shipsOn(page: Page, ships: readonly Ship[]): readonly Ship[] {
  if (page === CONTRACTS) {
    return []
  }
  if (page === FLEET_ARCHIVE) {
    return ships
  }
  if (page === FLEET) {
    return ships.filter((ship) => bandOf(ship) !== 'archived')
  }
  return byBand(ships)[page]
}

/**
 * Which fleet sheet a ship is on, starting from the one last open.
 *
 * The same courtesy the dock switch pays with `bandOf`: the ship being read comes along, so a
 * switch to the fleet with an archived ship held opens the sheet she is on rather than one where
 * she is not drawn and the reader has lost her.
 */
export function fleetPageFor(
  ship: Ship | null,
  last: typeof FLEET | typeof FLEET_ARCHIVE,
): typeof FLEET | typeof FLEET_ARCHIVE {
  return ship !== null && bandOf(ship) === 'archived' ? FLEET_ARCHIVE : last
}

/** Whether this page draws a harbour — both kinds of page that do, and neither that does not. */
export function draws(page: Page): boolean {
  return page !== CONTRACTS
}

/**
 * The page a ship belongs on, seen from the page that is open.
 *
 * For the moment a measurement moves her: a repository committed to after months of rest is
 * active now, and a band page that kept showing the band she left had simply lost her — the datasheet
 * still read her, the drawing no longer carried her. So the page follows her, the same way a switch
 * between views does. The fleet sheet without the archive follows her onto the full one when the
 * register put her away; the full sheet and the catalog carry everyone and stay.
 */
export function pageFor(page: Page, ship: Ship): Page {
  if (isBand(page)) {
    return bandOf(ship)
  }
  return page === FLEET ? fleetPageFor(ship, FLEET) : page
}

/**
 * Which set of pages the tab bar offers, and it is a **view** rather than a fourth page.
 *
 * Eight figures and five tabs on one line was a bar nobody could aim at: the fleet page and the
 * band pages answer different questions, and offering both at once made the reader pick the
 * question before they could pick the page. So the question is picked first, with two buttons,
 * and the tabs under it are the ones that belong to it.
 *
 * The catalog is in both, because it is in neither: it counts demands and not hulls, and is as
 * much about one dock as about the whole fleet.
 */
export const VIEWS = ['dock', 'fleet', 'contracts'] as const

export type View = (typeof VIEWS)[number]

export const VIEW_LABEL: Record<View, string> = {
  dock: 'Dock',
  fleet: 'Flotte',
  contracts: 'Verträge',
}

export const VIEW_MEANING: Record<View, string> = {
  dock: 'die Baender: Aktiv, Ruhend, Archiviert',
  fleet: 'die ganze Flotte auf einem Blatt, nach Reederei',
  contracts: 'was die Flotte fordert — je Forderung statt je Schiff',
}

/**
 * The pages one view offers, in the order they are drawn.
 *
 * The catalog is in neither list: it counts demands and not hulls, so it is not a *band* of the
 * fleet at all — it is a third question, and it sits with the other two as a button rather than
 * as a tab among pages it has nothing in common with. That also takes the one entry out of the
 * tab bar that meant something different from everything beside it.
 */
export function pagesOf(view: View): readonly Page[] {
  switch (view) {
    case 'fleet':
      return [FLEET, FLEET_ARCHIVE]
    case 'contracts':
      return [CONTRACTS]
    case 'dock':
      return [...BANDS]
  }
}

/** Which view a page belongs to — so a page picked elsewhere can put the buttons right. */
export function viewOf(page: Page): View {
  return isFleet(page) ? 'fleet' : page === CONTRACTS ? 'contracts' : 'dock'
}

/**
 * Which of the two arrangements a page is drawn with.
 *
 * `lanes` packs docks into rows and answers "what is on this page". `basins` draws one ring per
 * *project* — the kindreds `kin.ts` measures — and answers "what belongs with what", which is the
 * fleet page's whole question. The fan that used to answer it spent four times the area saying
 * less.
 */
export type Layout = 'lanes' | 'basins'
