/**
 * What the measured work is worth.
 *
 * Separate from `work.ts` on purpose, and it is the same split the quests make: a count is a
 * fact, a weight is a decision. The raw signals stay in the snapshot, so a different weighting
 * can be tried without measuring anything again — which matters, because the first set of
 * weights is always wrong and the second one usually is too.
 *
 * Two scores and not one, because they answer different questions:
 *
 * - **Project points** say what a *repository* has accumulated. Every author counts. A busy
 *   shared project scores high, and that is correct: the number describes the project.
 * - **User points** say what *this person* did with their fleet. Own commits only, plus two
 *   things no single repository can show — how clean the trees are kept, and how many projects
 *   are held in hand at once.
 *
 * Conflating them is the failure mode this split exists to avoid: eighteen thousand points from
 * a project with forty contributors are not a personal score, and a harbour that said otherwise
 * would flatter whoever stands nearest the biggest repository.
 */

import { bindingQuests } from './chain'
import { COMMIT_KINDS } from './work'

import type { Ship } from './ship'
import type { CommitKind, Work } from './work'

/**
 * What each kind of commit is worth.
 *
 * Weights, not measurements — chosen once and applied everywhere so two repositories are
 * comparable. A feature moves a product, a chore keeps it running, and the ratio says which of
 * the two a year of commits was spent on. Nothing here is worth zero: a repository whose year
 * was documentation and CI did work, and scoring that as nothing would be a lie about the year.
 */
export const KIND_POINTS: Record<CommitKind, number> = {
  feat: 3,
  fix: 2,
  perf: 2,
  refactor: 1,
  docs: 1,
  test: 1,
  build: 1,
  ci: 1,
  style: 1,
  chore: 1,
}

/**
 * A landed pull request, on top of the commits in it.
 *
 * Worth something of its own because it is the one signal here that somebody *else* could have
 * looked: a pull request is where review becomes possible. Whether it happened is not measurable
 * from a clone, so this counts the opportunity and not the review.
 */
export const PULL_POINTS = 2

/** An unscored commit still did something; it just did not say what. */
export const UNSCORED_POINTS = 1

/** Points for one body of work, however it was filtered. */
export function scoreWork(work: Work): number {
  let points = work.unscored * UNSCORED_POINTS
  for (const kind of COMMIT_KINDS) {
    points += (work.byKind[kind] ?? 0) * KIND_POINTS[kind]
  }
  return points + work.pulls * PULL_POINTS
}

export interface ShipPoints {
  /** Everything the repository accumulated, every author. */
  project: number
  /** The share of it belonging to the reader. */
  own: number
}

/**
 * A repository's score, and the reader's share of it.
 *
 * Quests deliberately do *not* enter here. A demand met is not an achievement to be banked — it
 * is a state the ship is supposed to be in, and it can be lost again tomorrow by a commit nobody
 * scored. Points count what was *done*; the deck already says what is owed, and adding the two
 * would let a repository buy its way out of a violated contract with commit volume.
 */
export function shipPoints(ship: Ship): ShipPoints {
  return {
    project: scoreWork(ship.ledger.total),
    own: scoreWork(ship.ledger.own),
  }
}

/**
 * What counts as a project somebody is currently holding.
 *
 * Thirty days, the same window `activityOf` uses. Two definitions of "active" in one tool would
 * be two answers to the question the whole harbour is about.
 */
export const ACTIVE_WINDOW_DAYS = 30

/** Points per project kept in hand at once — see `FleetPoints.breadth`. */
export const BREADTH_POINTS = 5

/** Points for a repository with nothing open, nothing unpushed, nothing stashed. */
export const SHIPSHAPE_POINTS = 3

export interface FleetPoints {
  /** Own commits and pull requests across every repository. */
  work: number
  /**
   * Repositories touched inside the active window.
   *
   * Scored because holding several projects at once is its own skill and its own cost, and
   * nothing in a single repository can show it. This is the one number here that only exists at
   * fleet level.
   */
  breadth: number
  /**
   * Repositories left in a clean state: no open work, nothing unpushed, nothing stashed.
   *
   * The counterweight to `work`. Commits alone reward motion, and a fleet optimised for motion
   * is one where ninety trees are half-finished — this is the part of the score that goes *down*
   * when work is left lying about, which is exactly what a stash is.
   */
  tidy: number
  /** The three, added. */
  total: number
  /** How many repositories the breadth and tidiness were counted over. */
  fleet: number
  /** Of those, how many are clean — so `tidy` can be read as a ratio rather than a number. */
  clean: number
  /** And how many are active. */
  active: number
}

/** Whether a repository is in a state its owner could walk away from. */
export function isClean(ship: Ship): boolean {
  return !ship.dirty && ship.stash === 0 && (ship.ahead ?? 0) === 0 && ship.working.conflicted === 0
}

/** Whether somebody touched it inside the window. */
export function isActive(ship: Ship): boolean {
  return ship.rustDays !== null && ship.rustDays <= ACTIVE_WINDOW_DAYS
}

/**
 * The reader's score across the whole fleet.
 *
 * Three parts, and the second and third are why this is not just a sum of `shipPoints().own`:
 * breadth and tidiness are properties of *keeping a fleet*, and neither is visible from inside
 * any one repository.
 */
export function fleetPoints(ships: readonly Ship[]): FleetPoints {
  const work = ships.reduce((sum, ship) => sum + scoreWork(ship.ledger.own), 0)
  const active = ships.filter(isActive).length
  const clean = ships.filter(isClean).length

  const breadth = active * BREADTH_POINTS
  const tidy = clean * SHIPSHAPE_POINTS

  return {
    work,
    breadth,
    tidy,
    total: work + breadth + tidy,
    fleet: ships.length,
    clean,
    active,
  }
}

/** The fleet's own total, for the harbour's header. */
export function projectPoints(ships: readonly Ship[]): number {
  return ships.reduce((sum, ship) => sum + scoreWork(ship.ledger.total), 0)
}

/**
 * Ships worth looking at first, strongest project score down.
 *
 * Beside the contract ordering and never instead of it: `byCondition` answers "what is broken",
 * this answers "what was built". They are different questions and the harbour sorts by the first.
 */
export function byProjectPoints(a: Ship, b: Ship): number {
  return (
    scoreWork(b.ledger.total) - scoreWork(a.ledger.total) ||
    `${a.org}/${a.name}`.localeCompare(`${b.org}/${b.name}`)
  )
}

/** Quests a ship meets, over those that bind it — shown beside the points, never added to them. */
export function questRatio(ship: Ship): { met: number; binding: number } {
  const binding = bindingQuests(ship.quests)
  return {
    met: binding.filter((quest) => quest.verdict === 'met').length,
    binding: binding.length,
  }
}
