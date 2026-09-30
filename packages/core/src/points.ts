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

/**
 * Points for each quest met, across the fleet.
 *
 * In the *user* score and deliberately not in the project one. The rule a repository is held to
 * stays: it cannot buy its way out of a violated contract with commit volume, because
 * `shipPoints` never sees a quest. But a person who goes and meets a demand did something, and a
 * board that offers tasks without a number on them is a board that cannot say which task is
 * worth doing first.
 *
 * Worth more than tidying one tree, because it stays met: a stash comes back tomorrow, a CI
 * workflow does not.
 */
export const QUEST_POINTS = 8

/**
 * Past this many members nothing more is learned about how wide a repository is.
 *
 * Measured over 92 repositories: the widest carries thirteen, and the distribution is 64 at zero,
 * 16 at one, and a thin tail. Sixteen is therefore a ceiling that never binds today and will not
 * surprise anybody the day something crosses it.
 */
export const SPAN_CEILING = 16

/**
 * How many members of this repository actually carry a check.
 *
 * **Carrying** and not merely declared, and that distinction is the whole measurement: `vike` has
 * sixty-seven `package.json` files and three of them run anything. Counting manifests would have
 * made an examples directory the widest repository in the fleet.
 *
 * At least one, always: a repository with no members at all is still one repository, and a demand
 * on it is still a demand.
 */
export function spanOf(ship: Ship): number {
  const carrying = ship.contract.members.filter((member) => member.checks.length > 0).length
  return Math.max(1, Math.min(carrying, SPAN_CEILING))
}

/**
 * What a demand is worth on a repository this wide, as a multiplier.
 *
 * Square root, the same shape `hullOf` uses for length, and for the same reason: more, but
 * diminishing. Meeting `lint` in eleven packages is not eleven times meeting it in one — the
 * config is shared and the fix is copied — but it is plainly more than once, because each package
 * brings its own scripts, its own overrides and its own failures.
 *
 * The alternative that was measured and rejected is counting *checks*: Ocelot-Social runs thirty
 * and gradido forty-three, and a demand does not get four times harder because somebody split
 * `test` into `test:unit` and `test:integration`.
 */
export function spanWeight(ship: Ship): number {
  return Math.sqrt(spanOf(ship))
}

/**
 * What one met demand is worth on this ship.
 *
 * The fix for a real complaint: Ocelot-Social is held to the same nine demands as a one-package
 * repository and meeting them costs eleven times the places to touch — and it scored the same.
 * Rounded, so nothing in the window ever prints a fraction of a point.
 */
export function questValue(ship: Ship): number {
  return Math.round(QUEST_POINTS * spanWeight(ship))
}

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
  /**
   * Quests met across the fleet.
   *
   * Counted here and nowhere else — see `QUEST_POINTS` for why the project score does not get
   * them.
   */
  contracts: number
  /** The four, added. */
  total: number
  /** How many repositories the breadth and tidiness were counted over. */
  fleet: number
  /** Of those, how many are clean — so `tidy` can be read as a ratio rather than a number. */
  clean: number
  /** And how many are active. */
  active: number
  /** Quests met, over quests that bind — so `contracts` reads as a ratio. */
  met: number
  binding: number
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

  const quests = ships.flatMap((ship) => bindingQuests(ship.quests))
  const met = quests.filter((quest) => quest.verdict === 'met').length

  const breadth = active * BREADTH_POINTS
  const tidy = clean * SHIPSHAPE_POINTS
  // Per ship and not over the flat list: what a demand is worth depends on how wide the repository
  // it was met on is, and a flat count cannot see which ship a quest came from.
  const contracts = ships.reduce(
    (sum, ship) =>
      sum +
      bindingQuests(ship.quests).filter((quest) => quest.verdict === 'met').length *
        questValue(ship),
    0,
  )

  return {
    work,
    breadth,
    tidy,
    contracts,
    total: work + breadth + tidy + contracts,
    fleet: ships.length,
    clean,
    active,
    met,
    binding: quests.length,
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
