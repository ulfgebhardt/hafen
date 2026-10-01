/**
 * Who moves on which way — one route per way, and the way itself says what travels it.
 *
 * The harbour already promises that its ways are routes and not decoration: `moorings.ts` lays
 * them as a tree so every ship can be walked ashore, and `lanes.ts` emits the same graph. What was
 * missing is the other half of that claim — **a way nothing is ever seen taking is a line, not a
 * route**. The scene used to put traffic where it was convenient (a figure per author, a boat per
 * way round, one walker per dock along its limb), so most of the planking stood empty and the
 * reader had no way to tell an empty walkway from a decorative one.
 *
 * So the rule is counted rather than hoped for: `routesOf` gives **every walkway** a figure, and
 * `carriageOf` reads the carriage off `Way['kind']` rather than off where the line happens to run.
 * People walked the ways round before this, which is a figure strolling across the fairway.
 *
 * **The boats are not on the network at all**, and that is the second rule. A launch put on a way
 * — even beside it — reads as driving along a line somebody drew, which is what a walkway is and
 * what a fairway is not. They run on `lanesOf`: long straight lanes down the middle of whatever
 * open water the harbour has, clear of every dock, drawn nowhere and measuring nothing. They are
 * decoration and the only thing here that is, the same as the frames in `hull.ts`.
 *
 * Nothing here draws. `scene.ts` turns a route into a sprite and a pace into pixels per frame; the
 * decisions that can be wrong — what travels where, how fast, and how far off a dock — are here,
 * where a test can hold them.
 */

import { walksOf } from './moorings'

import type { Box, Harbour, Way } from './moorings'
import type { Spot } from './plan'
import type { Ground } from './vessel'

/** What a route is travelled by. Two, because a harbour has boards and it has water. */
export type Carriage = 'foot' | 'water'

/** Two points, which is all a route or a candidate for one needs to be. */
export interface Segment {
  from: Spot
  to: Spot
}

export interface Route {
  from: Spot
  to: Spot
  on: Carriage
  org: string | null
  /** Where along the route this one starts, so neighbours do not march in step. */
  offset: number
}

/**
 * How fast each carriage travels, in **world units per second** — and that unit is the fix.
 *
 * The speed used to be a fraction of the route per second, so the same number meant different
 * things on different ways: a 52-unit plank and a 6-unit stub were covered in the same time, and
 * a long limb therefore looked hurried beside a short stub that crawled. Units per second is one
 * statement about the world, and the scene divides by the length it happens to have.
 */
export const PACE: Record<Carriage, number> = { foot: 3, water: 5 }

/**
 * How far a deco lane keeps off every dock, in world units.
 *
 * Wider than half the gap between two docks (`GAP.x` is 11), so the slots *between* blocks cannot
 * hold a lane at all: a boat down a gap runs alongside the riser standing in it, which is the
 * thing that looked wrong — a launch driving up a walkway. What is left is the open water around
 * and through the harbour, which is where a fairway belongs.
 */
export const CLEARANCE = 8

/** How finely the water is scanned for lanes, in world units. Finer than a berth is deep. */
const SCAN = 6

/**
 * How much of the harbour a lane has to cross to be one, as a share of that axis.
 *
 * Long is the whole point: a boat crossing half the picture is traffic passing through, where one
 * shuttling along a short hop is a ferry on a timetable — and a timetable is a claim this drawing
 * does not have the measurement for.
 */
export const LANE_SHARE = 0.45

export function carriageOf(kind: Way['kind']): Carriage {
  return kind === 'tree' ? 'foot' : 'water'
}

export function spanOf(from: Spot, to: Spot): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

/**
 * Every walkway as a route, with somebody on it.
 *
 * Only the walkways: a way round and a tender are water, and nothing is routed onto water any
 * more — see `lanesOf`. The count is therefore the count of `tree` ways and the claim is still
 * the same one, that a way nothing is ever seen taking is a line and not a route.
 */
export function routesOf(harbour: Harbour): readonly Route[] {
  return walksOf(harbour)
    .filter((walk) => carriageOf(walk.kind) === 'foot')
    .map((walk, index) => ({
      from: walk.from,
      to: walk.to,
      on: 'foot' as const,
      org: walk.org,
      // Irregular and the same every time, like every other repeated reading in this window.
      offset: (index * 0.37) % 1,
    }))
}

/** A dock with room around it, which is what a lane has to stay out of. */
function around(block: { at: Spot; width: number; height: number }): Box {
  return {
    x: block.at.x - CLEARANCE,
    y: block.at.y - CLEARANCE,
    width: block.width + CLEARANCE * 2,
    height: block.height + CLEARANCE * 2,
  }
}

/** A stretch of one axis. */
export interface Span {
  from: number
  to: number
}

/**
 * What is left of `0 … end` once the blocked stretches are taken out.
 *
 * Exact rather than sampled, because a dock with room around it is an axis-aligned box: a line
 * across it is blocked on precisely one interval, and asking every six units for an answer that
 * arithmetic already has is how a lane ends up half inside a dock.
 */
export function freeOn(blocked: readonly Span[], end: number): readonly Span[] {
  const sorted = [...blocked].sort((one, other) => one.from - other.from)
  const free: Span[] = []
  let at = 0
  for (const span of sorted) {
    if (span.from > at) {
      free.push({ from: at, to: span.from })
    }
    at = Math.max(at, span.to)
  }
  if (at < end) {
    free.push({ from: at, to: end })
  }
  return free
}

/** The longest stretch of open water on one scan line, or nothing where there is none. */
export function longestOn(blocked: readonly Span[], end: number): Span | null {
  let best: Span | null = null
  for (const span of freeOn(blocked, end)) {
    if (best === null || span.to - span.from > best.to - best.from) {
      best = span
    }
  }
  return best
}

/**
 * The middle line of each band of consecutive open scan lines.
 *
 * A band and not every line in it: ten parallel lanes six units apart is a hatch pattern, not a
 * fairway, and the boats on them would read as a shoal.
 */
export function middles<T extends { at: number }>(open: readonly T[], step: number): readonly T[] {
  const found: T[] = []
  let band: T[] = []
  const close = (): void => {
    const middle = band[Math.floor(band.length / 2)]
    if (middle !== undefined) {
      found.push(middle)
    }
    band = []
  }
  for (const line of open) {
    const last = band.at(-1)
    if (last !== undefined && line.at - last.at > step * 1.5) {
      close()
    }
    band.push(line)
  }
  close()
  return found
}

/**
 * The lanes the deco boats run, and they are **not** part of the network.
 *
 * One lane down the middle of every band of open water, along the longest clear stretch that band
 * has. Nothing is drawn for them, nothing depends on them, and no measurement is behind them —
 * they are the one thing in this window that is decoration outright, which is why it says so here
 * rather than being discovered later.
 *
 * Measured against the docks and not against the ways, because a dock is where the ships are: a
 * lane that crossed one would sail a launch over somebody's deck. `CLEARANCE` is wider than half
 * the gap between two docks, so the slots *between* blocks cannot hold a lane either — a boat down
 * a gap runs alongside the riser standing in it, which is the thing that looked wrong.
 */
export function lanesOf(harbour: Harbour): readonly Segment[] {
  const walls = harbour.blocks.map((block) => around(block))
  /*
   * And the walkways, where one runs *inside* the corridor a lane would take.
   *
   * Docks alone were not enough: the trunk stands on the west quay, which no dock covers, so the
   * first lane found ran up it at four tenths of a unit — a launch driving along a walkway, which
   * is the whole thing this is here to avoid. A way that merely *crosses* the corridor has an end
   * outside it and is left alone: a lane crossing a jetty is a crossing, not a drive along one.
   */
  const planks = walksOf(harbour).filter((walk) => carriageOf(walk.kind) === 'foot')
  const alongside = (
    line: number,
    of: (spot: Spot) => number,
    on: (spot: Spot) => number,
  ): Span[] =>
    planks
      .filter(
        (plank) =>
          Math.abs(of(plank.from) - line) <= CLEARANCE &&
          Math.abs(of(plank.to) - line) <= CLEARANCE,
      )
      .map((plank) => ({
        from: Math.min(on(plank.from), on(plank.to)) - CLEARANCE,
        to: Math.max(on(plank.from), on(plank.to)) + CLEARANCE,
      }))

  const scan = (
    end: number,
    across: number,
    blockedAt: (line: number) => readonly Span[],
  ): readonly { at: number; span: Span }[] => {
    const open: { at: number; span: Span }[] = []
    for (let line = SCAN; line < end; line += SCAN) {
      const longest = longestOn(blockedAt(line), across)
      if (longest !== null && longest.to - longest.from >= across * LANE_SHARE) {
        open.push({ at: line, span: longest })
      }
    }
    return middles(open, SCAN)
  }

  const across = scan(harbour.height, harbour.width, (y) => [
    ...walls
      .filter((wall) => y >= wall.y && y <= wall.y + wall.height)
      .map((wall) => ({ from: wall.x, to: wall.x + wall.width })),
    ...alongside(
      y,
      (spot) => spot.y,
      (spot) => spot.x,
    ),
  ])
  /*
   * Across only, and never down.
   *
   * A launch is drawn from above as a hull pointing along its course, and at this scale a hull
   * seen end-on is a wedge with nothing to read in it — a boat climbing the picture looked like a
   * rocket rather than like traffic. The harbour runs east-west in both arrangements anyway:
   * every plank, every quay and every ship lies that way, so a lane across the water is the one
   * that reads as a fairway beside them.
   */
  return across.map((lane) => ({
    from: { x: lane.span.from, y: lane.at },
    to: { x: lane.span.to, y: lane.at },
  }))
}

/**
 * How far from her own ship a figure strays before the harbour pulls her back, in world units.
 *
 * Not a wall: it is the distance at which turning for home becomes *certain*, and halfway out it
 * is an even bet. Measured against the lane harbour, which is about 690 by 300 — so a figure
 * ranges over her own dock and the next one, and the quay at the far end is somebody else's.
 */
export const ROAM = 90

/** A place a figure can stand: a quay, or a spot on a deck. */
export type Place = string

export interface Network {
  where: ReadonlyMap<Place, Spot>
  /** Who can be reached from here in one go. Both ways round, always. */
  next: ReadonlyMap<Place, readonly Place[]>
}

/** The walkways as a graph of places, plus whatever walkable ground each berth offers. */
export function networkOf(
  harbour: Harbour,
  /**
   * Per mooring node, the pieces of walkable ground that hang off her plank — in world units.
   *
   * Pieces rather than one: a berth has her deck and the apron her load waits on, and both reach
   * the planking. Each carries its own links, so a ring (a deck) and a field (an apron somebody
   * walks freely) are the same kind of thing here and neither is special-cased.
   */
  aboard: ReadonlyMap<number, readonly Ground[]> = new Map(),
): Network {
  const where = new Map<Place, Spot>()
  const next = new Map<Place, Place[]>()
  const link = (one: Place, other: Place): void => {
    const already = next.get(one)
    if (already === undefined) {
      next.set(one, [other])
      return
    }
    already.push(other)
  }
  const join = (one: Place, other: Place): void => {
    link(one, other)
    link(other, one)
  }

  for (const quay of harbour.quays) {
    where.set(`q${String(quay.id)}`, quay.spot)
  }
  for (const way of harbour.ways) {
    if (carriageOf(way.kind) !== 'foot') {
      continue
    }
    // No guard on the two ends: a way is laid between two quays by construction, and `trimmed`
    // drops the ways of a quay it cuts. A check here would be a branch nothing can enter.
    join(`q${String(way.from)}`, `q${String(way.to)}`)
  }

  /*
   * And the ground at each berth, which is the whole point of the gangway being drawn at all.
   *
   * One spot of each piece touches the planking — its `gate` — so walking aboard, or out among
   * the packages, is one step from the quay and never a jump.
   */
  for (const [node, grounds] of aboard) {
    const plank: Place = `q${String(node)}`
    if (!where.has(plank)) {
      continue
    }
    grounds.forEach((ground, which) => {
      if (ground.spots.length === 0) {
        return
      }
      const name = (index: number): Place => `d${String(node)}.${String(which)}.${String(index)}`
      ground.spots.forEach((spot, index) => {
        where.set(name(index), spot)
      })
      join(plank, name(ground.gate))
      for (const [one, other] of ground.links) {
        join(name(one), name(other))
      }
    })
  }

  return { where, next }
}

/**
 * Where she goes from here, decided at the place she has just reached.
 *
 * The whole behaviour is one number: **the further she is from her own ship, the more likely her
 * next step is towards it.** Walking out, that reads as the chance of turning round; walking back,
 * as the chance of carrying on home — which is why both sentences describe the same arithmetic
 * and only the outcome they name differs.
 *
 * The roll is handed in rather than drawn here, so this stays a function: the same place, the same
 * roll and the same ship give the same answer, and the scene owns the seeded sequence. A harbour
 * that walked differently on every draw would make every other difference in it suspect.
 */
export function stepFrom(network: Network, at: Place, home: Spot, roll: number): Place {
  const options = network.next.get(at) ?? []
  const first = options[0]
  if (first === undefined) {
    return at
  }
  const here = network.where.get(at)
  const gap = (place: Place): number => {
    const spot = network.where.get(place)
    return spot === undefined
      ? Number.POSITIVE_INFINITY
      : Math.hypot(spot.x - home.x, spot.y - home.y)
  }
  const far =
    here === undefined ? 0 : Math.min(1, Math.hypot(here.x - home.x, here.y - home.y) / ROAM)

  let homeward = first
  for (const option of options) {
    if (gap(option) < gap(homeward)) {
      homeward = option
    }
  }
  if (roll < far) {
    return homeward
  }

  // The rest of the roll, spread over everything else — and over `homeward` itself where there is
  // nothing else, because a dead end is a place you leave the way you came.
  const others = options.filter((option) => option !== homeward)
  const rest = others.length === 0 ? [homeward] : others
  // `far` cannot be 1 here: a roll is below 1 and anything below `far` has already gone home.
  const spread = (roll - far) / (1 - far)
  return rest[Math.min(rest.length - 1, Math.floor(spread * rest.length))] ?? homeward
}
