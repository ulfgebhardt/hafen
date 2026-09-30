/**
 * What a ship *looks* like, one independent feature at a time.
 *
 * The split this module exists for is the same one `work.ts`/`points.ts` makes: a measurement is a
 * fact, its appearance is a decision. `shipPoints` and `ForgeStats` are the facts; that stars
 * become lit windows and met demands become masts is a choice, and it belongs in one file a reader
 * can argue with rather than spread across a renderer.
 *
 * **Every trait is independent.** Length says nothing about the masts, the glow says nothing about
 * the rust. That is the point: a ship carries as many readings at once as it has features, and a
 * feature that is switched off leaves the others untouched. A single "condition" number would have
 * been a ship that says one thing — and the fleet then has ninety copies of one shape at ninety
 * sizes.
 *
 * Each trait is either a **count** (masts, cranes — a thing you can point at) or a **share**
 * between 0 and 1 (glow, bustle — an intensity). Nothing here is a pixel: the scene decides what a
 * mast is drawn as, this decides how many there are.
 */

import { activityOf, shipPoints } from '@hafen/core'

import { bindingQuests } from './fleet'

import type { ForgeStats, Ship } from '@hafen/core'

/**
 * Where a score stops buying hull.
 *
 * `LENGTH_CEILING` in `vessel.ts` was 6000 and is kept there for the hull itself; this is the
 * ceiling for the *combined* reading once the forge is in it, and it is higher because stars land
 * on top. Measured: the busiest repository on this fleet scores 31 270 project points, and
 * `funkbuch` carries 1743 stars.
 */
export const REACH_CEILING = 40000

/**
 * What a star is worth against a commit, and it is a weight rather than a measurement.
 *
 * Twenty, because a repository with a thousand stars is a different *kind* of thing from one with
 * a thousand commits and ought to read as one — and because the two numbers differ by about that
 * factor on this fleet: 171 684 project points against roughly 4 000 stars in total.
 */
export const STAR_WEIGHT = 20

/** The measured quantities a ship's appearance is built from, before any of it is a decision. */
export interface Readings {
  points: number
  /** Demands this ship answered. Not the demands that exist — the ones it met. */
  met: number
  binding: number
  stars: number
  issues: number
  /** Whether the forge was asked about this ship at all. */
  asked: boolean
  rustDays: number | null
  /** Untidiness: stashes, uncommitted work, a stopped merge. */
  disorder: number
}

export function readingsOf(ship: Ship, stats: ForgeStats | null): Readings {
  const binding = bindingQuests(ship)
  return {
    points: shipPoints(ship).project,
    met: binding.filter((quest) => quest.verdict === 'met').length,
    binding: binding.length,
    stars: stats?.stars ?? 0,
    issues: stats?.issues ?? 0,
    asked: stats !== null,
    rustDays: ship.rustDays,
    disorder:
      ship.stash +
      (ship.dirty ? 1 : 0) +
      (ship.working.staged + ship.working.unstaged + ship.working.untracked > 0 ? 1 : 0),
  }
}

/**
 * 0 … 1, saturating.
 *
 * Every linear share goes through it. `glow` does not, because it is logarithmic — and that is
 * exactly how it escaped its own scale and reached 1.84 at a million stars. It clamps on its own
 * line now; the lesson is that "every share is bounded" has to be true of the ones that take a
 * different route too.
 */
function share(value: number, ceiling: number): number {
  if (ceiling <= 0) {
    return 0
  }
  return Math.min(1, Math.max(0, value) / ceiling)
}

/**
 * What the hull is worth, stars included — and the ship therefore **grows after the forge is
 * asked**.
 *
 * That was a decision and not an oversight. It means the same repository is a different size
 * before and after the button, which a picture is normally not allowed to be. Two things make it
 * honest rather than shifty: the forge reading carries its own timestamp in the header, so the
 * moment the fleet changed shape is readable; and 15 of 86 repositories cannot be read at all, so
 * they stay at their snapshot size permanently — which is the truth about them, not a penalty.
 *
 * The root, like the hull length it feeds: more, but sharply diminishing. Without it the three
 * biggest repositories would be the only ones with any length at all.
 */
export function reachOf(readings: Readings): number {
  return Math.sqrt(share(readings.points + readings.stars * STAR_WEIGHT, REACH_CEILING))
}

/** How many demands this ship has answered, as a share of what is asked of it. */
export function standingOf(readings: Readings): number {
  return readings.binding === 0 ? 0 : readings.met / readings.binding
}

/**
 * The features, each on its own scale.
 *
 * Counts are small on purpose. Four masts is a barque; eight would be a picket fence at this zoom,
 * and the reading stops being countable at a glance somewhere around five — which is the only
 * thing a count is better at than a bar.
 */
export interface Traits {
  /** 0 … 1 of the hull-length range. Points and stars. */
  reach: number
  /** 0 … 4. How much of what is demanded of her she has answered. */
  masts: number
  /** 0 … 3. The same reading at the other end: a ship that meets a lot gets gear to handle it. */
  cranes: number
  /** 0 … 3 decks of superstructure aft. Also standing — the third way of saying "imposing". */
  tiers: number
  /** 0 … 1 brightness of the lit windows. Stars, and nothing else. */
  glow: number
  /** 0 … 1 how streaked the plating is. Age since the last commit. */
  rust: number
  /** 0 … 1 how scuffed she is. Untidiness, which is the one a person can fix today. */
  scuff: number
  /** 0 … 1 traffic at *her* berth: a big ship is worked on by more people. */
  bustle: number
}

/** Where rust is total. Two years, the same scale `rustLevel` bands on. */
export const RUST_CEILING = 730
/** Where untidiness is total. Measured: the worst tree on this fleet carries 135 stashes. */
export const DISORDER_CEILING = 12
/** Where the windows are fully lit. The brightest repository on this fleet, measured. */
export const STAR_CEILING = 1800

export function traitsOf(readings: Readings): Traits {
  const standing = standingOf(readings)
  const reach = reachOf(readings)

  return {
    reach,
    /*
     * Three readings off one number, and deliberately at different thresholds.
     *
     * A ship that meets half her demands gets a mast and nothing else; one that meets all of them
     * gets four, cranes and three decks. The steps are staggered so that the *order* in which a
     * ship gains gear is itself readable — a fleet where everything appeared at once would only
     * ever show two silhouettes.
     */
    masts: Math.round(standing * 4),
    cranes: Math.floor(standing * 3.99),
    tiers: 1 + Math.floor(standing * 2.99),
    /*
     * Stars alone, on a root scale — the one trait that is dark until somebody asks the forge,
     * which is exactly what it means: nobody has looked.
     *
     * **Logarithmic, and two scales were wrong before it.** Stars are the most heavy-tailed number
     * in this whole tool: most repositories here have under twenty, the busiest active one has 112
     * and `funkbuch` has 1743. Linear against 400 left every window under a third lit; a root against
     * 1800 was no better, 112 stars still came out at a quarter. A log spends the visible range
     * where the ships actually are — 20 stars read as 0.41, 112 as 0.63 — and still has somewhere
     * for 1743 to go.
     */
    glow: Math.min(1, Math.log1p(Math.max(0, readings.stars)) / Math.log1p(STAR_CEILING)),
    rust: readings.rustDays === null ? 0 : share(readings.rustDays, RUST_CEILING),
    scuff: share(readings.disorder, DISORDER_CEILING),
    /*
     * Traffic at her own berth, from her size and not from her condition.
     *
     * A big repository has more people going aboard; a broken one does not have *fewer*. Tying
     * bustle to points and not to quests keeps the two readings from cancelling: a large ship
     * with everything violated should look busy and wrong at the same time.
     */
    bustle: reach,
  }
}

/**
 * How busy the whole picture is, from the ships that are on it.
 *
 * "Je aktiver das Dock, desto mehr Bewegung" — and it is read off the fleet rather than handed
 * down as a prop, because the page a reader is on *is* a set of ships: the dormant tab is dormant
 * by definition. One less thing for two components to disagree about.
 *
 * Never zero. A still picture reads as a broken one, and "nothing has happened here for two years"
 * is a thing the harbour already says three other ways.
 */
export const STIR: Record<'active' | 'dormant' | 'archived', number> = {
  active: 1,
  dormant: 0.45,
  archived: 0.18,
}

export function livelinessOf(ships: readonly Ship[]): number {
  if (ships.length === 0) {
    return STIR.dormant
  }
  const sum = ships.reduce(
    (total, ship) => total + STIR[activityOf(ship, { archived: ship.archived })],
    0,
  )
  return sum / ships.length
}
