/**
 * The harbour, drawn from above with Pixi.
 *
 * Imperative, and deliberately the only imperative file here: WebGL batches draw calls, which is
 * why a basin of a hundred hulls with their cargo costs about what one costs in a DOM renderer.
 * The measurement that decided this is Werft's, where the DOM renderer alone took 8.4 % CPU idle.
 *
 * Everything this file *decides* was decided elsewhere. The grid comes from `plan.ts`, the shape
 * of a ship from `vessel.ts`, her condition from `condition.ts`, colour and form per verdict from
 * `theme.ts`. This file owns no rule; it turns numbers into strokes — which is why
 * `vitest.config.ts` excludes it by name rather than quietly counting it.
 *
 * Seen from above there is no depth, so there is no drawing order to get wrong: the pier, the
 * ships and the captions occupy different bands of every row and nothing can be drawn through
 * anything else.
 *
 * Two containers per berth, and the split is load-bearing. The **body** is the ship and moves with
 * her: she lies off her pier when the tree is untidy, and her cargo, her flag and her damage go
 * with her. The **quayside** is the planking and does not move, because what is waiting there is
 * waiting whatever the ship does. Drawing the crates inside the body would have them drift out
 * over the water every time somebody left a file uncommitted.
 *
 * What moves, moves by transform only — a Pixi `Graphics` rebuilds its geometry when it is
 * redrawn, so a lift that travels is a container whose `x` changes and never a shape drawn again
 * each frame. That is the difference between a harbour that idles at nothing and one that idles at
 * a fifth of a core.
 */

import { rustLevel, shipPoints } from '@hafen/core'
import { Application, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js'

import { PIER } from './chosen'
import { conditionOf } from './condition'
import { cutOf, flagTint, fleetlets } from './flags'
import { ageLabel, drift, fit } from './fleet'
import { harbourOf as laneHarbour } from './lanes'
import { harbourOf as fanHarbour, MARGIN, QUAY, walksOf, waysAt } from './moorings'
import { BERTH, project, UNIT } from './plan'
import { HULL_COLOR, MARK_COLOR, SCENE, SEGMENT, VERDICT_COLOR } from './theme'
import { livelinessOf, readingsOf, traitsOf } from './traits'
import {
  boxAt,
  bridgeOf,
  cargoOf,
  hasPlume,
  hullOf,
  gangwayBox,
  gangwayOf,
  hullMarks,
  landedOf,
  mooringOf,
  offsetOf,
  pierMarks,
  questAt,
  yawOf,
} from './vessel'
import {
  clampPan,
  clampZoom,
  fitScale,
  isPannable,
  wholeScale,
  zoomAt,
  ZOOM_STEP,
} from './viewport'

import type { Chosen } from './chosen'
import type { Harbour } from './moorings'
import type { Side, Spot } from './plan'
import type { Traits } from './traits'
import type { Container as Container_, Hull, MarkBox } from './vessel'
import type { Extent, Pan } from './viewport'
import type { ForgeStats, Ship } from '@hafen/core'
import type { FederatedPointerEvent } from 'pixi.js'

/**
 * How wide a walkway is drawn, in pixels — and it is one number on purpose.
 *
 * The whole point of the change: a plank is a plank whether it carries the fleet or one ship.
 */
const PLANK = 3.4

const LABEL = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  fill: '#9db4c9',
  letterSpacing: 0.2,
})

/** The organisation's name over its dock. Its own style, because a `TextStyle` is a class. */
const DOCK_LABEL = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10,
  fill: '#7d93a8',
  letterSpacing: 0.6,
})

const LABEL_DIM = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 9,
  fill: '#6b8096',
  letterSpacing: 0.2,
})

/** The score beside a name. Warm, so it reads as a figure of merit and not as a demand. */
const LABEL_SCORE = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 9,
  fill: '#c08a5a',
  letterSpacing: 0.2,
})

/** Grouped the way the rest of the window groups figures. */
const FIGURE = new Intl.NumberFormat('de-DE')

/**
 * How many characters of a caption fit along a berth.
 *
 * Derived from the pitch and the font rather than picked: a berth is `BERTH.pitch` units wide at
 * `UNIT` pixels each, and a monospace glyph is about 0.62 of its size across. Picked numbers are
 * what ran `Ocelot-Social ◆ 23.213` into the berth beside it.
 */
const CAPTION_CHARS = Math.floor((BERTH.pitch * UNIT) / (11 * 0.62))
const DETAIL_CHARS = Math.floor((BERTH.pitch * UNIT) / (9 * 0.62))

function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16)
}

/**
 * A deterministic pseudo-random sequence.
 *
 * Seeded and never `Math.random`, for the same reason `drift` is a hash of the path: the harbour
 * is looked at repeatedly, and a breakwater that reshuffled its own stones between two readings
 * would make the whole picture feel untrustworthy even though nothing it *means* had changed.
 */
function sequence(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

/** A closed polygon in plan units. */
function poly(shape: Graphics, points: readonly Spot[]): Graphics {
  const first = project(points[0] ?? { x: 0, y: 0 })
  shape.moveTo(first.x, first.y)
  for (const point of points.slice(1)) {
    const flat = project(point)
    shape.lineTo(flat.x, flat.y)
  }
  return shape.closePath()
}

/** A box given by its centre, in plan units. */
function slab(shape: Graphics, at: Spot, along: number, across: number): Graphics {
  return shape.rect(
    (at.x - along / 2) * UNIT,
    (at.y - across / 2) * UNIT,
    along * UNIT,
    across * UNIT,
  )
}

/**
 * The harbour itself: land along the top, piers running out from it, a breakwater closing the
 * basin.
 *
 * It exists so that what stands for something has somewhere to be, and none of it is a
 * measurement — this is the one part of the drawing that is decoration outright, and saying so is
 * the point. Still generated rather than traced once: a coastline drawn by hand is wrong the
 * moment the fleet changes size, and a harbour that crops its own breakwater looks broken rather
 * than austere.
 */
function ground(harbour: Harbour, extent: Extent): Container {
  const group = new Container()
  const width = extent.width
  const height = extent.height

  // A chart's ruling on the water: what gives the plan a scale at all.
  const grid = new Graphics()
  const step = 10 * UNIT
  for (let x = 0; x <= width; x += step) {
    grid.moveTo(x, 0).lineTo(x, height)
  }
  for (let y = 0; y <= height; y += step) {
    grid.moveTo(0, y).lineTo(width, y)
  }
  grid.stroke({ width: 0.5, color: hex(SCENE.seaLine), alpha: 0.24 })
  group.addChild(grid)

  /*
   * The shore is the edge of the picture, all the way round.
   *
   * It was an L along two sides, which left the basin open to the north and east and made the
   * harbour look cropped rather than enclosed. A frame says the thing that is true: the water ends
   * where the drawing does, and every dock reaches land because land is never far.
   */
  const quay = (MARGIN.x + QUAY) * UNIT
  const inner = {
    x: quay,
    y: (MARGIN.y + QUAY / 2) * UNIT,
    right: width - (QUAY / 2) * UNIT,
    bottom: height - (QUAY / 2) * UNIT,
  }
  const land = new Graphics()
  land.rect(0, 0, width, height).fill(hex(SCENE.land))
  land
    .rect(inner.x, inner.y, inner.right - inner.x, inner.bottom - inner.y)
    .fill(hex(SCENE.seaNear))
  land
    .rect(inner.x, inner.y, inner.right - inner.x, inner.bottom - inner.y)
    .stroke({ width: 1.2, color: hex(SCENE.quayEdge), alpha: 0.55 })
  group.addChild(land)

  /*
   * The riprap along the shore, right round the basin.
   *
   * Irregular on purpose and irregular the same way every time: a row of identical stones reads as
   * a pattern and a random one reads as a different harbour each visit.
   */
  const stones = new Graphics()
  const next = sequence(19)
  for (let x = inner.x; x < inner.right; x += 7) {
    stones.circle(x + next() * 5, inner.bottom - next() * 6, (3 + next() * 2.5) * (UNIT / 5))
    stones.circle(x + next() * 5, inner.y + next() * 6, (3 + next() * 2.5) * (UNIT / 5))
  }
  for (let y = inner.y; y < inner.bottom; y += 7) {
    stones.circle(inner.x + next() * 6, y + next() * 5, (3 + next() * 2.5) * (UNIT / 5))
    stones.circle(inner.right - next() * 6, y + next() * 5, (3 + next() * 2.5) * (UNIT / 5))
  }
  stones.fill({ color: hex(SCENE.crane), alpha: 0.14 })
  group.addChild(stones)

  /*
   * The walkways, drawn from the same tree that guarantees them.
   *
   * Nothing here decides where a plank goes — `moorings.ts` did, and it can prove every ship is
   * joined to the shore by following parents. The renderer draws whatever that tree says, which is
   * the only arrangement in which the drawing and the promise cannot drift apart.
   *
   * Thickness by rank: a trunk carries the whole harbour, a spine carries one group's two rows.
   * Nothing about it is measured, and it is here rather than in the layout for that reason.
   */
  /*
   * **One plank, and only one.**
   *
   * The harbour used to draw two kinds of walkway — a fourteen-unit pier that carried the cargo
   * and a thin tube that carried nothing — and the two read as different objects rather than as
   * the same thing serving different places. The load moved to the aprons, so a plank is a plank:
   * the same width and the same boards under a trunk as under the last twig.
   *
   * What still varies is the *flag* it carries, and only where one applies: a walkway inside a
   * dock is that organisation's, the ones between docks are everybody's.
   */
  const planks = new Graphics()
  for (const walk of walksOf(harbour).filter((one) => one.kind === 'tree')) {
    const from = project(walk.from)
    const to = project(walk.to)
    planks.moveTo(from.x, from.y).lineTo(to.x, to.y)
    planks.stroke({ width: PLANK, color: hex(SCENE.quay), alpha: 1 })
    planks.moveTo(from.x, from.y).lineTo(to.x, to.y)
    planks.stroke({
      width: PLANK,
      color: walk.org === null ? hex(SCENE.quayEdge) : flagTint(walk.org),
      alpha: walk.org === null ? 0.5 : 0.32,
    })
  }
  group.addChild(planks)

  /*
   * The extra ways round: denser inside a group than between two.
   *
   * Dashed and thinner than the tree on purpose. They are a convenience and nothing depends on
   * them — a reader who can see that at a glance is reading the harbour correctly.
   */
  const extra = new Graphics()
  for (const cross of walksOf(harbour).filter((one) => one.kind === 'round')) {
    const from = project(cross.from)
    const to = project(cross.to)
    const steps = 9
    for (let index = 0; index < steps; index += 2) {
      const a = index / steps
      const b = Math.min(1, (index + 1) / steps)
      extra.moveTo(from.x + (to.x - from.x) * a, from.y + (to.y - from.y) * a)
      extra.lineTo(from.x + (to.x - from.x) * b, from.y + (to.y - from.y) * b)
    }
  }
  extra.stroke({ width: 1.6, color: hex(SCENE.walk), alpha: 0.55 })
  group.addChild(extra)

  return group
}

/** The organisation's name on its own dock, because a flag alone does not spell anything. */
function dockLabels(harbour: Harbour): Container {
  const group = new Container()
  for (const block of harbour.blocks) {
    const text = new Text({
      text: fit(block.org, Math.max(6, Math.floor(block.width / 3.4))),
      style: DOCK_LABEL,
    })
    text.position.set(block.at.x * UNIT, (block.at.y - 6) * UNIT)
    group.addChild(text)

    const mark = new Graphics()
    mark.rect(block.at.x * UNIT - 10, (block.at.y - 5.6) * UNIT, 6, 8)
    mark.fill({ color: flagTint(block.org), alpha: 0.9 })
    group.addChild(mark)
  }
  return group
}

/**
 * One person, at their own origin so they can walk.
 *
 * Three strokes and a dot: from above at this zoom a person is a head and a pair of shoulders,
 * and anything more becomes a smudge that reads as dirt on the plan. The scale is deliberately
 * near the limit of what is visible — a harbour whose figures are legible individually is a
 * harbour drawn at the wrong zoom for ninety ships.
 */
function walker(): Container {
  const group = new Container()
  const body = new Graphics()
  body.circle(0, 0, 0.42 * UNIT).fill({ color: hex(SCENE.crane), alpha: 0.85 })
  body
    .moveTo(-0.5 * UNIT, 0.15 * UNIT)
    .lineTo(0.5 * UNIT, 0.15 * UNIT)
    .stroke({ width: 1, color: hex(SCENE.crane), alpha: 0.6 })
  group.addChild(body)
  return group
}

/**
 * The yard's travel lift, drawn at its own origin so it can run the pier.
 *
 * A lift and not a gantry crane: a gantry's boom reaches right over the ship, and every time one
 * travelled past it drew a grey bar across the cargo — and the cargo is the contract. A lift is
 * compact, stays on the planking, and is the machine a basin of this size would actually have.
 */
function lift(): Container {
  const group = new Container()
  const steel = hex(SCENE.crane)
  const shape = new Graphics()

  shape.rect(-2 * UNIT, -1.7 * UNIT, 4 * UNIT, 0.7 * UNIT)
  shape.rect(-2 * UNIT, 1 * UNIT, 4 * UNIT, 0.7 * UNIT)
  shape.fill({ color: steel, alpha: 0.45 })

  shape.rect(-2 * UNIT, -1.7 * UNIT, 0.7 * UNIT, 3.4 * UNIT)
  shape.rect(1.3 * UNIT, -1.7 * UNIT, 0.7 * UNIT, 3.4 * UNIT)
  shape.fill({ color: steel, alpha: 0.3 })

  group.addChild(shape)
  return group
}

/** A launch crossing the fairway: the harbour's traffic, and the one thing going anywhere. */
function launch(): Container {
  const group = new Container()
  const shape = new Graphics()
  poly(shape, [
    { x: 0, y: -0.55 },
    { x: 2.1, y: -0.35 },
    { x: 2.7, y: 0 },
    { x: 2.1, y: 0.35 },
    { x: 0, y: 0.55 },
  ]).fill({ color: hex(SCENE.crane), alpha: 0.5 })
  shape
    .moveTo(-2.2 * UNIT, 0)
    .lineTo(0, 0)
    .stroke({ width: 1, color: hex(SCENE.seaLine), alpha: 0.7 })
  group.addChild(shape)
  return group
}

export interface Scene {
  draw: (
    ships: readonly Ship[],
    forge?: ReadonlyMap<string, ForgeStats>,
    layout?: 'lanes' | 'fan',
  ) => void
  /** The ship under the pointer, or `null` on the way out. */
  onHover: (handler: (ship: Ship | null) => void) => void
  /**
   * The ship somebody clicked, or `null` for a click on open water.
   *
   * With the demand whose box was under the pointer, where one was. A click on a container is a
   * question about *that* demand, and answering it with "this ship" throws away the only part of
   * the click that was specific.
   */
  onSelect: (handler: (ship: Ship | null, chosen: Chosen | null) => void) => void
  /**
   * Which ship to draw as chosen, and which of her boxes.
   *
   * Both, because they mark different things: the hull says "this repository" and the box says
   * "this demand". A reader who clicked a container and got only the hull lit up has been answered
   * about something they did not ask.
   */
  highlight: (ship: Ship | null, chosen?: Chosen | null) => void
  destroy: () => void
}

/** One drawn berth, and the pieces the scene keeps a handle on. */
interface Placed {
  ship: Ship
  /** The halo under the hull. */
  chosen: Graphics
  /** The ring around one box aboard — in the body, because the cargo moves with her. */
  aboard: Graphics
  /** The ring around one box on the planking, which does not move. */
  ashore: Graphics
  body: Container
  hull: Hull
  /** How far off her pier she lies — the gangway is drawn from it, so the ring needs it too. */
  offset: number
  restY: number
  restRotation: number
  /** How much she moves at her own berth — her size, never her condition. */
  stir: number
  phase: number
}

/**
 * What is owed, standing on the planking beside her.
 *
 * Open demands first, then the repository's own untidiness — two different questions, but both of
 * them answer "what is there to do here", and that is what the pier is. Everything that is
 * *finished* is aboard, and the rail between the two is the whole reading.
 */
function pierLoad(ship: Ship, hull: Hull): Graphics {
  const load = new Graphics()

  const owed = landedOf(ship, hull)
  for (const box of owed) {
    const color = hex(VERDICT_COLOR[box.quest.verdict])
    const form = SEGMENT[box.quest.verdict]
    slab(load, box.spot, box.along, box.across).fill({
      color,
      alpha: Math.max(form.opacity, 0.22),
    })
    slab(load, box.spot, box.along, box.across).stroke({ width: 0.8, color, alpha: 0.9 })

    // The reading that survives greyscale: a violated box is ruled through, one nothing could
    // measure is an outline with nothing in it.
    if (form.hatch) {
      const at = project(box.spot)
      const arm = (box.along / 2 - 0.2) * UNIT
      load
        .moveTo(at.x - arm, at.y)
        .lineTo(at.x + arm, at.y)
        .stroke({ width: 1, color, alpha: 0.95 })
    }
  }

  /*
   * The repository's own untidiness, all of it in the one reserved row.
   *
   * Placed by `pierMarks` and only stroked here: where a crate sits now has a second reader — the
   * hit test — and two placements of one crate would be two answers to "what did I just click on".
   */
  for (const box of pierMarks(ship, hull)) {
    const color = hex(MARK_COLOR[box.kind])
    const crate = slab(load, box.spot, box.along, box.across)
    if (box.kind === 'untracked') {
      crate.stroke({ width: 1, color, alpha: 0.8 })
    } else {
      crate.fill({ color, alpha: 0.8 })
    }
  }

  // The `+` that says a count was cut, once per kind, after its last drawn crate.
  for (const kind of new Set(
    pierMarks(ship, hull)
      .filter((box) => box.capped)
      .map((box) => box.kind),
  )) {
    const last = pierMarks(ship, hull)
      .filter((box) => box.kind === kind)
      .at(-1)
    if (last === undefined) {
      continue
    }
    const tick = project({ x: last.spot.x + last.along / 2 + 0.6, y: last.spot.y })
    load
      .moveTo(tick.x - 0.4 * UNIT, tick.y)
      .lineTo(tick.x + 0.4 * UNIT, tick.y)
      .moveTo(tick.x, tick.y - 0.4 * UNIT)
      .lineTo(tick.x, tick.y + 0.4 * UNIT)
      .stroke({ width: 1, color: hex(MARK_COLOR[kind]), alpha: 0.85 })
  }

  return load
}

/**
 * What the ship herself carries besides her cargo: damage, a flag, a drag astern, boats alongside.
 *
 * These stay in the body because they belong to the vessel and not to the berth — a conflict does
 * not wait on the planking, it is aboard and it has stopped her.
 */
function shipState(ship: Ship, hull: Hull): Graphics {
  const state = new Graphics()

  /*
   * Placed by `hullMarks` and only stroked here — the same split the planking follows.
   *
   * Every one of them is a rectangle to `hullMarks`, including the ones drawn as a cross or a
   * triangle: the *shape* is this file's business, the area a click may land in is not. A hit area
   * traced from a drawing would be a second opinion about where the drawing is.
   */
  for (const box of hullMarks(ship, hull)) {
    const color = hex(MARK_COLOR[box.kind])
    const at = project(box.spot)

    if (box.kind === 'damage') {
      const arm = 1.1 * UNIT
      state
        .moveTo(at.x - arm, at.y - arm)
        .lineTo(at.x + arm, at.y + arm)
        .moveTo(at.x + arm, at.y - arm)
        .lineTo(at.x - arm, at.y + arm)
        .stroke({ width: 2, color, alpha: 0.95 })
      continue
    }

    if (box.kind === 'pennant') {
      // Off the jackstaff at the stem — from above a flag is a triangle flying to leeward.
      state
        .moveTo(at.x - 1.2 * UNIT, at.y)
        .lineTo(at.x + 1.2 * UNIT, at.y - 0.9 * UNIT)
        .lineTo(at.x + 1.2 * UNIT, at.y + 0.9 * UNIT)
        .closePath()
        .fill({ color, alpha: 0.85 })
      continue
    }

    if (box.kind === 'drag') {
      // Astern of the transom: what is upstream and not here yet.
      for (const offset of [-0.7, 0, 0.7]) {
        state
          .moveTo(at.x + offset * UNIT, at.y - 1.1 * UNIT)
          .lineTo(at.x + offset * UNIT, at.y + 1.1 * UNIT)
      }
      state.stroke({ width: 1.4, color, alpha: 0.6 })
      continue
    }

    if (box.kind === 'boat') {
      // Worktrees lie alongside, on the seaward side: other trees of the same repository.
      slab(state, box.spot, box.along, box.across).fill({ color, alpha: 0.6 })
      continue
    }

    /*
     * Beiboote: repositories this one carries.
     *
     * Forward of the worktrees and an outline rather than filled, because they are a different
     * thing and not more of the same — a worktree is this repository twice, a submodule is
     * somebody else's brought along.
     */
    poly(state, [
      { x: box.spot.x - box.along / 2, y: box.spot.y - box.across / 2 },
      { x: box.spot.x + box.along / 2 - 0.4, y: box.spot.y - box.across / 2 },
      { x: box.spot.x + box.along / 2, y: box.spot.y },
      { x: box.spot.x + box.along / 2 - 0.4, y: box.spot.y + box.across / 2 },
      { x: box.spot.x - box.along / 2, y: box.spot.y + box.across / 2 },
    ]).stroke({ width: 1, color, alpha: 0.85 })
  }
  return state
}

/**
 * A ship's project score, for how long her hull is drawn.
 *
 * `shipPoints` and not a sum of its own: the number written under a ship and the number that made
 * her that long have to be one number, or the drawing contradicts its own caption. It is also what
 * `bySize` orders the harbour by, so the rows step down from the left for a visible reason.
 */
function scoreOf(ship: Ship): number {
  return shipPoints(ship).project
}

/**
 * What is met, as containers on the deck.
 *
 * A grid is countable at a glance and comparable across a whole basin without counting anything,
 * which is what a stack of boxes seen from a corner could not do. An empty hold gets bare hatch
 * lines, and what tells "nothing demanded" from "nothing achieved" is the pier beside her.
 */
function deckCargo(ship: Ship, hull: Hull): Graphics {
  const cargo = new Graphics()
  const boxes = cargoOf(ship, hull)

  if (boxes.length === 0) {
    for (let t = 0.3; t < 0.78; t += 0.11) {
      const from = project({ x: hull.length * t, y: -hull.beam * 0.34 })
      const to = project({ x: hull.length * t, y: hull.beam * 0.34 })
      cargo.moveTo(from.x, from.y).lineTo(to.x, to.y)
    }
    cargo.stroke({ width: 1, color: hex(SCENE.crane), alpha: 0.28 })
    return cargo
  }

  const color = hex(VERDICT_COLOR.met)
  for (const crate of boxes) {
    slab(cargo, crate.spot, crate.along, crate.across).fill({ color, alpha: SEGMENT.met.opacity })
    slab(cargo, crate.spot, crate.along, crate.across).stroke({ width: 0.8, color, alpha: 0.95 })
  }
  return cargo
}

/** The accommodation block aft, her funnel, and the one earned flourish. */
function bridge(ship: Ship, hull: Hull): Graphics {
  const house = new Graphics()
  const steel = hex(SCENE.crane)
  const block = bridgeOf(ship, hull)

  slab(house, block.spot, block.along, block.across).fill({ color: steel, alpha: 0.34 })
  slab(house, block.spot, block.along, block.across).stroke({
    width: 0.8,
    color: steel,
    alpha: 0.75,
  })

  const funnel = project({ x: block.spot.x, y: 0 })
  house.circle(funnel.x, funnel.y, 0.62 * UNIT).fill({ color: hex(SCENE.skyTop), alpha: 0.8 })
  house.circle(funnel.x, funnel.y, 0.62 * UNIT).stroke({ width: 0.8, color: steel, alpha: 0.8 })

  if (hasPlume(ship)) {
    for (const [index, radius] of [1, 0.75, 0.5].entries()) {
      house.circle(
        funnel.x - (index + 1) * 1.5 * UNIT,
        funnel.y - (index + 1) * UNIT,
        radius * UNIT,
      )
    }
    house.stroke({ width: 0.8, color: steel, alpha: 0.45 })
  }
  return house
}

/**
 * The rig: masts, cranes, decks — and the flag.
 *
 * All three counts come off one reading, `standing`, which is how much of what is demanded of this
 * ship she has answered. That is the user's own word made drawable: "je mehr Verträge abgeschlossen,
 * desto imposanter". They appear at staggered thresholds so the *order* in which a ship gains gear
 * is itself readable — a fleet where everything arrived at once would only ever show two
 * silhouettes.
 *
 * The flag is the other axis entirely and says nothing about condition: it is her organisation, so
 * that a reader can see across a basin which boats belong together without reading a name. Colour
 * and **cut** both, because 24 hue rungs do not keep 25 organisations apart on their own, and
 * because a colour alone is no reading for eight percent of men.
 */
function rig(ship: Ship, hull: Hull, traits: Traits): Graphics {
  const gear = new Graphics()
  const steel = hex(SCENE.crane)

  /*
   * Masts on the clear deck, and **never over the cargo**.
   *
   * The first placement put them straight across it, which breaks the tool's own rule: the cargo
   * grid is the contract, and a grey stroke through a container is a grey stroke through a met
   * demand. The deck is free aft of `DECK.from` and forward of `DECK.to`, so a main mast goes just
   * forward of the bridge and the rest step forward of the cargo — which is also where a ship of
   * this shape actually carries them.
   *
   * A mast is a stick and a yard: two strokes, and at this zoom that is all a mast can be without
   * becoming a smudge.
   */
  const STEPS = [0.2, 0.86, 0.9, 0.94]
  for (let index = 0; index < traits.masts; index += 1) {
    const step = STEPS[index] ?? 0.2
    const at = project({ x: hull.length * step, y: 0 })
    // The bow tapers, so a mast forward wears a shorter yard — and looks like a bow mast.
    const arm = hull.beam * (step > 0.8 ? 0.22 : 0.46) * UNIT
    gear.moveTo(at.x, at.y - arm).lineTo(at.x, at.y + arm)
    gear.moveTo(at.x - 0.6 * UNIT, at.y).lineTo(at.x + 0.6 * UNIT, at.y)
  }
  if (traits.masts > 0) {
    gear.stroke({ width: 1, color: steel, alpha: 0.7 })
  }

  /*
   * Cranes at the inboard deck edge, booms reaching over the planking and never over the cargo.
   *
   * The same reason the yard's travel lift is a lift and not a gantry: a boom drawn across the
   * deck draws a grey bar through the contract, and the contract is the thing worth reading. The
   * foot sits right on the edge rather than a third of the way in, which is where it was and which
   * put it among the containers.
   */
  for (let index = 0; index < traits.cranes; index += 1) {
    const foot = project({ x: hull.length * (0.32 + index * 0.18), y: -hull.beam * 0.46 })
    gear.circle(foot.x, foot.y, 0.5 * UNIT)
    gear.moveTo(foot.x, foot.y).lineTo(foot.x - 1.6 * UNIT, foot.y - 2.4 * UNIT)
  }
  if (traits.cranes > 0) {
    gear.stroke({ width: 1.1, color: steel, alpha: 0.6 })
  }

  return gear
}

/**
 * The decks of the superstructure, stacked on the bridge block.
 *
 * The third reading of the same number, and the one that makes a ship look *tall* from above
 * without a third axis: concentric outlines, one per tier, the way a plan draws a deckhouse. A
 * ship that answers everything asked of her carries three; one that answers nothing carries the
 * single deck every ship has.
 */
function tiers(ship: Ship, hull: Hull, traits: Traits): Graphics {
  const decks = new Graphics()
  const block = bridgeOf(ship, hull)
  for (let deck = 1; deck < traits.tiers; deck += 1) {
    const shrink = 1 - deck * 0.22
    slab(decks, block.spot, block.along * shrink, block.across * shrink)
  }
  if (traits.tiers > 1) {
    decks.stroke({ width: 0.7, color: hex(SCENE.crane), alpha: 0.55 })
  }
  return decks
}

/**
 * The lit windows: stars, and nothing else.
 *
 * The one feature that is **dark until somebody asks the forge**, which is exactly what it means —
 * nobody has looked. It is deliberately not the hull size doing double duty: a repository can be
 * small and admired, and those are two readings that have to be able to disagree.
 */
function windows(hull: Hull, traits: Traits, decks: number): Graphics {
  const lit = new Graphics()
  if (traits.glow <= 0) {
    return lit
  }

  const rows = Math.max(1, decks)
  for (let deck = 0; deck < rows; deck += 1) {
    for (let index = 0; index < 4; index += 1) {
      const at = project({
        x: hull.length * (0.06 + index * 0.035),
        y: (deck - (rows - 1) / 2) * hull.beam * 0.2,
      })
      lit.rect(at.x, at.y - 0.28 * UNIT, 0.8 * UNIT, 0.56 * UNIT)
    }
  }
  lit.fill({ color: hex(SCENE.lamp), alpha: 0.2 + traits.glow * 0.75 })
  return lit
}

/**
 * The organisation's flag, at the masthead aft.
 *
 * Cut and colour, never colour alone — the same rule the verdict segments follow, and here it
 * carries a second load: 24 hue rungs cannot keep 25 organisations apart, so three pairs on this
 * fleet share a colour and are told apart by the cut.
 */
function flag(hull: Hull, org: string): Graphics {
  const cloth = new Graphics()
  // Right aft, clear of the deckhouse: an ensign staff, which is where a ship carries her flag.
  const staff = project({ x: hull.length * 0.03, y: 0 })
  const height = 2.4 * UNIT
  const fly = 3 * UNIT
  const top = staff.y - height

  cloth.moveTo(staff.x, staff.y).lineTo(staff.x, top)
  cloth.stroke({ width: 0.9, color: hex(SCENE.crane), alpha: 0.7 })

  const cut = cutOf(org)
  const notch = cut === 'swallowtail' ? fly * 0.32 : cut === 'burgee' ? fly * 0.5 : 0
  const hoist = 1.9 * UNIT
  if (cut === 'pennant') {
    cloth
      .moveTo(staff.x, top)
      .lineTo(staff.x + fly, top + hoist / 2)
      .lineTo(staff.x, top + hoist)
  } else {
    cloth
      .moveTo(staff.x, top)
      .lineTo(staff.x + fly, top)
      .lineTo(staff.x + fly - notch, top + hoist / 2)
      .lineTo(staff.x + fly, top + hoist)
      .lineTo(staff.x, top + hoist)
  }
  cloth.closePath().fill({ color: flagTint(org), alpha: 0.9 })
  return cloth
}

/**
 * The ship herself.
 *
 * The plating is coloured by rust level, which is the quietest of the three readings and the one
 * that should stay quiet: nobody should be pushed into working by a drawing. What is loud is where
 * she *lies*, and that is decided by the caller — this draws her at the origin.
 */
function drawVessel(
  ship: Ship,
  into: Container,
  hull: Hull,
  offset: number,
  traits: Traits,
  org: string,
): void {
  const condition = conditionOf(ship)
  const plate = hex(HULL_COLOR[rustLevel(ship.rustDays)])

  const rigging = new Graphics()
  /*
   * The gangway, where anything is waiting on the planking.
   *
   * Thicker than a mooring line and drawn in the same steel: it is the one mark that says "there
   * is work here" without counting anything, because the eye finds a line between two shapes
   * before it finds a crate among crates.
   */
  if (pierMarks(ship, hull).length > 0) {
    const plank = gangwayOf(hull, offset)
    const from = project(plank.from)
    const to = project(plank.to)
    rigging
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ width: 3, color: hex(SCENE.crane), alpha: 0.5 })
  }

  const mooring = rigging
  for (const line of mooringOf(hull, offset)) {
    const from = project(line.from)
    const to = project(line.to)
    mooring.moveTo(from.x, from.y).lineTo(to.x, to.y)
  }
  mooring.stroke({ width: 1, color: hex(SCENE.mooring), alpha: 0.55 })
  into.addChild(rigging)

  const shape = new Graphics()
  poly(shape, hull.outline).fill({ color: plate, alpha: 0.22 })
  poly(shape, hull.outline).stroke({ width: 1.4, color: plate, alpha: 0.9 })

  /*
   * Rust along the plating, and only where the repository is actually old.
   *
   * Strokes rather than a tint: colour is spoken for by the verdicts, and a stroke survives
   * greyscale — which a wash does not.
   */
  if (condition.freshness < 0.5) {
    const marks = Math.max(2, Math.round((1 - condition.freshness) * 6))
    for (let index = 0; index < marks; index += 1) {
      const t = 0.18 + (index / marks) * 0.62
      const at = project({ x: hull.length * t, y: hull.beam / 2 })
      shape.moveTo(at.x, at.y - 0.3 * UNIT).lineTo(at.x + 0.9 * UNIT, at.y)
    }
    shape.stroke({ width: 1.2, color: hex('#b08a68'), alpha: 0.6 })
  }
  /*
   * Scuffing across the plating, one streak per unit of untidiness.
   *
   * The complaint this answers: the marks that stood for work-to-do made a ship *more* interesting
   * to look at, so a neglected repository was the better drawing. They live on the pier now, and
   * what is left on the hull goes the other way — the more there is to tidy, the worse she looks.
   * Short cross-strokes and not a wash, for the same reason the rust marks are strokes: colour is
   * spoken for by the verdicts, and a stroke survives greyscale.
   */
  const scuff = Math.round((1 - condition.hygiene) * 7)
  for (let index = 0; index < scuff; index += 1) {
    const t = 0.12 + (index / Math.max(scuff, 1)) * 0.7
    const at = project({ x: hull.length * t, y: 0 })
    const arm = hull.beam * 0.22 * UNIT
    shape.moveTo(at.x - arm * 0.5, at.y - arm).lineTo(at.x + arm * 0.5, at.y + arm)
  }
  if (scuff > 0) {
    shape.stroke({ width: 1, color: hex(SCENE.skyTop), alpha: 0.5 })
  }
  into.addChild(shape)

  into.addChild(deckCargo(ship, hull))
  into.addChild(rig(ship, hull, traits))
  into.addChild(bridge(ship, hull))
  into.addChild(tiers(ship, hull, traits))
  into.addChild(windows(hull, traits, traits.tiers))
  into.addChild(flag(hull, org))
  into.addChild(shipState(ship, hull))
}

/**
 * Name and the two figures that matter, outboard of the berth.
 *
 * Outboard and not "below": a ship on the far side of her pier is the same drawing mirrored, and a
 * caption under her would end up on the planking. The text itself is never mirrored, which is why
 * it sits in the slot rather than in the container that flips.
 */
function caption(ship: Ship, side: Side): Container {
  const group = new Container()
  const outboard = BERTH.lane - BERTH.laneCentre + 1
  const top = side === 1 ? outboard * UNIT : -(outboard + 5.6) * UNIT

  const name = new Text({ text: fit(ship.name, CAPTION_CHARS), style: LABEL })
  name.position.set(0, top)
  group.addChild(name)

  const binding = ship.quests.filter((quest) => quest.verdict !== 'notApplicable')
  const met = binding.filter((quest) => quest.verdict === 'met').length
  const owed = binding.length === 0 ? 'ohne Forderung' : `${String(met)}/${String(binding.length)}`
  const detail = new Text({
    text: fit(`${ageLabel(ship.rustDays)} · ${owed}`, DETAIL_CHARS),
    style: LABEL_DIM,
  })
  detail.position.set(0, top + 14)
  group.addChild(detail)

  /*
   * The score, on its own line and in the same two marks the rest of the window uses.
   *
   * Its own line because it had been beside the name, and at `Ocelot-Social ◆ 23.213 ● 3.796` that
   * ran into the next berth — a caption is only allowed the width of its own pitch, and nothing
   * here measures text. A line each is what does fit, always, without measuring anything.
   *
   * The personal count only where there is one: a `● 0` on eighty hulls is a column of zeroes that
   * says nothing.
   */
  const points = shipPoints(ship)
  const score = new Text({
    text:
      points.own > 0
        ? `◆ ${FIGURE.format(points.project)}  ● ${FIGURE.format(points.own)}`
        : `◆ ${FIGURE.format(points.project)}`,
    style: LABEL_SCORE,
  })
  score.position.set(0, top + 26)
  group.addChild(score)

  return group
}

/**
 * Mounts the scene into a canvas and keeps it alive.
 *
 * The movement is harbour traffic — a lift running its pier, launches crossing the fairway — and a
 * swell that a moored ship actually has: fractions of a unit. A basin where the hulls heave is one
 * where the eye never settles on a ship, and the ships are the point.
 */
export async function mountScene(canvas: HTMLCanvasElement): Promise<Scene> {
  const app = new Application()
  await app.init({
    canvas,
    antialias: true,
    resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
    autoDensity: true,
    background: SCENE.skyTop,
    resizeTo: canvas.parentElement ?? canvas,
  })

  const world = new Container()
  app.stage.addChild(world)

  let hovered: (ship: Ship | null) => void = () => undefined
  let selected: (ship: Ship | null, chosen: Chosen | null) => void = () => undefined
  let placed: Placed[] = []
  /**
   * Everything that moves, and each one moves along **a segment** rather than along x.
   *
   * It used to be `{from, span}` on the x axis, which was enough while every pier ran east–west.
   * A fan's limbs point anywhere, and a docker who walked east along a limb that runs north-east
   * would be walking on water.
   */
  let traffic: {
    node: Container
    a: { x: number; y: number }
    b: { x: number; y: number }
    speed: number
    offset: number
  }[] = []
  let extent: Extent = { width: 0, height: 0 }
  let pan: Pan = { x: 0, y: 0 }
  let zoom: number | null = null
  /** How busy the page is, from the ships on it. Scales every moving thing in the picture. */
  let lively = 1
  /**
   * What the forge said, if it was asked. Handed in with the ships rather than kept here.
   *
   * It has its own age and its own button, so it is not part of the snapshot and must not look
   * like it is — and a scene that held it between draws would be a second copy of a reading that
   * already has one owner.
   */
  let stats: ReadonlyMap<string, ForgeStats> = new Map()
  const statsOf = (ship: Ship): ForgeStats | null => stats.get(ship.path) ?? null

  const viewOf = (): Extent => ({ width: app.screen.width, height: app.screen.height })

  const settle = (): void => {
    const view = viewOf()
    const scale = zoom ?? fitScale(extent, view)
    world.scale.set(scale)
    const at = clampPan(pan, extent, view, scale)
    world.position.set(at.x, at.y)
    pan = at
    canvas.style.cursor = isPannable(extent, view, scale) ? 'grab' : 'default'
  }

  const draw = (
    ships: readonly Ship[],
    forge: ReadonlyMap<string, ForgeStats> = new Map(),
    layout: 'lanes' | 'fan' = 'lanes',
  ): void => {
    stats = forge
    world.removeChildren()
    placed = []
    traffic = []

    /*
     * The shape the plan is laid out towards is the *window's*, not a constant.
     *
     * A fixed 16:9 is only right on a window that happens to be 16:9; on a taller one the harbour
     * came out flat and small in the height, with room above and below it that nothing used.
     * Remembered so a resize can ask whether the answer changed — see `onResize`.
     */
    /*
     * One of the two harbours, and the caller says which.
     *
     * Both group by organisation and both return the same graph — quays and ways — so everything
     * from here down is written once and knows nothing about which arrangement it is drawing.
     * They differ in what they can do: lanes pack tighter, the fan can branch at an angle.
     */
    const harbour = (layout === 'fan' ? fanHarbour : laneHarbour)(fleetlets(ships))
    const order = harbour.moorings
    extent = { width: harbour.width * UNIT, height: harbour.height * UNIT }
    lively = livelinessOf(ships)

    world.addChild(ground(harbour, extent))
    world.addChild(dockLabels(harbour))

    /*
     * Built once, outside the loop, and reading the handler at the moment the pointer arrives:
     * `onHover` and `onSelect` are registered *after* the first draw, so a closure capturing the
     * value would capture the do-nothing default.
     */
    const onEnter = (ship: Ship) => (): void => {
      hovered(ship)
    }
    /**
     * Which box was hit, asked of the two containers that hold boxes.
     *
     * Two, because the cargo moves with the ship and the planking does not — `getLocalPosition`
     * has to be asked of each in its own frame, and this is the only place that knows the two are
     * different frames at all.
     */
    const onTap =
      (ship: Ship, hull: Hull, offset: number, body: Container, quayside: Container) =>
      (event: FederatedPointerEvent): void => {
        const aboard = event.getLocalPosition(body)
        const ashore = event.getLocalPosition(quayside)
        const onDeck = { x: aboard.x / UNIT, y: aboard.y / UNIT }
        const onPier = { x: ashore.x / UNIT, y: ashore.y / UNIT }

        /*
         * Every drawn thing, in the order it is drawn.
         *
         * Demands first because they are what the deck is *for*; the marks lie in bands of their
         * own and cannot overlap them anyway. Hit-tested against the same lists the renderer
         * strokes, so nothing can be drawn in one place and answered for in another.
         */
        const quest = questAt(cargoOf(ship, hull), onDeck) ?? questAt(landedOf(ship, hull), onPier)
        if (quest !== null) {
          selected(ship, { kind: 'quest', id: quest })
          return
        }

        const mark = boxAt(hullMarks(ship, hull), onDeck) ?? boxAt(pierMarks(ship, hull), onPier)
        if (mark !== null) {
          selected(ship, { kind: 'mark', mark: mark.kind })
          return
        }

        // Last, because it is the widest target and stands for the least specific thing.
        const plank =
          pierMarks(ship, hull).length > 0 && boxAt([gangwayBox(hull, offset)], onDeck) !== null
        selected(ship, plank ? PIER : null)
      }

    const fleet = new Container()
    world.addChild(fleet)

    for (const berth of order) {
      const side: Side = berth.side
      const slot = new Container()
      const flat = project(berth.spot)
      slot.position.set(flat.x, flat.y)

      const traits = traitsOf(readingsOf(berth.ship, statsOf(berth.ship)))
      const hull = hullOf(berth.ship, scoreOf(berth.ship))
      const offset = offsetOf(berth.ship)

      // The planking: it belongs to the berth, so it is mirrored with the side and never moved.
      const quayside = new Container()
      quayside.scale.y = side
      quayside.addChild(pierLoad(berth.ship, hull))
      slot.addChild(quayside)

      const body = new Container()
      const chosen = new Graphics()
      const aboard = new Graphics()
      const ashore = new Graphics()
      quayside.addChild(ashore)
      body.scale.y = side
      body.position.y = side * offset * UNIT
      body.rotation = yawOf(berth.ship) * side
      body.addChild(chosen)
      slot.addChild(body)

      drawVessel(berth.ship, body, hull, offset, traits, berth.org)
      // On top of the cargo: a ring under a box would be hidden by the box it marks.
      body.addChild(aboard)
      slot.addChild(caption(berth.ship, side))

      // The whole berth — planking, ship and caption — answers to one ship. Exactly one pitch
      // wide, so two neighbours can never both claim a click.
      slot.eventMode = 'static'
      slot.cursor = 'pointer'
      slot.hitArea = new Rectangle(
        -2 * UNIT,
        side === 1
          ? -(BERTH.pier + BERTH.laneCentre) * UNIT
          : -(BERTH.lane - BERTH.laneCentre + BERTH.caption) * UNIT,
        BERTH.pitch * UNIT,
        (BERTH.pier + BERTH.lane + BERTH.caption) * UNIT,
      )
      slot.on('pointerover', onEnter(berth.ship))
      slot.on('pointertap', onTap(berth.ship, hull, offset, body, quayside))

      fleet.addChild(slot)
      placed.push({
        ship: berth.ship,
        chosen,
        aboard,
        ashore,
        body,
        hull,
        offset,
        restY: side * offset * UNIT,
        restRotation: body.rotation,
        /*
         * How much this one ship moves at her own berth, and it is her *size* and not her
         * condition. A big repository has more people going aboard; a broken one does not have
         * fewer, and tying the two together would let a large violated ship cancel itself out.
         */
        stir: 0.45 + traits.bustle * 0.9,
        phase: drift(berth.ship.path) * 9,
      })
    }

    /*
     * The traffic: people, and the machine they work.
     *
     * Per **berth** and no longer per pier, because a pier is now one ship's plank. What walks it
     * is measured: `crew` counts the addresses that have committed to that repository, so a
     * repository three people share has three figures on its plank and one nobody but its author
     * has touched has one. Not stars — a star is somebody who watched, and drawing admirers as
     * dockers would say something the measurement cannot know.
     *
     * The lift is one per berth and works the same plank. Its speed is `bustle`, which is size:
     * a big repository is worked harder, and that is a different reading from how many people
     * have ever touched it.
     */
    const moving = new Container()
    world.addChild(moving)
    const spots = new Map(harbour.quays.map((quay) => [quay.id, quay.spot]))
    const quayAt = (id: number): Spot => spots.get(id) ?? { x: 0, y: 0 }

    for (const [index, berth] of order.entries()) {
      const traits = traitsOf(readingsOf(berth.ship, statsOf(berth.ship)))
      const plankY = (berth.spot.y - berth.side * BERTH.laneCentre) * UNIT
      const from = berth.spot.x * UNIT
      const to = (berth.spot.x + BERTH.pitch) * UNIT

      const node = lift()
      node.position.set(from, plankY)
      moving.addChild(node)
      traffic.push({
        node,
        a: { x: from + 2 * UNIT, y: plankY },
        b: { x: to - 2 * UNIT, y: plankY },
        speed: 0.004 + traits.bustle * 0.009,
        offset: (index * 0.37) % 1,
      })

      /*
       * Her authors, on the ways around her — not routed from the shore.
       *
       * This is what the edge list is for. A figure takes one of the ways *touching her plank*:
       * the plank itself, the stub that reaches it, whatever else meets there. So one docker paces
       * alongside her and the next is out on the branch, which is what a berth looks like — rather
       * than three figures walking the same line in step.
       *
       * Deterministic by index, like everything else that is read repeatedly: the same fleet must
       * draw the same harbour twice, and a random walker would make every other figure suspect.
       */
      const nearby = waysAt(harbour, berth.node)
      for (let hand = 0; hand < traits.crew; hand += 1) {
        const way = nearby[hand % Math.max(nearby.length, 1)]
        const ends =
          way === undefined
            ? [
                { x: from + 1.5 * UNIT, y: plankY },
                { x: to - 1.5 * UNIT, y: plankY },
              ]
            : [project(quayAt(way.from)), project(quayAt(way.to))]

        const figure = walker()
        moving.addChild(figure)
        traffic.push({
          node: figure,
          a: ends[0] ?? { x: from, y: plankY },
          b: ends[1] ?? { x: to, y: plankY },
          // Each at their own pace and their own place, so a berth does not march in step.
          speed: 0.02 + ((index + hand) % 5) * 0.004,
          offset: (index * 0.31 + hand * 0.41) % 1,
        })
      }
    }

    /*
     * And a launch on every way round, out in the open water between two docks.
     *
     * The crossings are the one part of the network that is not a walkway — a boat is what uses
     * water, so a boat is what moves along them. It also means a path that exists is a path
     * something is seen taking, which is the difference between a line and a route.
     */
    for (const [index, cross] of walksOf(harbour)
      .filter((one) => one.kind === 'round')
      .entries()) {
      const boat = launch()
      moving.addChild(boat)
      traffic.push({
        node: boat,
        a: project(cross.from),
        b: project(cross.to),
        speed: 0.005 + (index % 3) * 0.0018,
        offset: (index * 0.41) % 1,
      })
    }

    /*
     * And people on the limbs themselves, walking out to the docks and back.
     *
     * One per dock, along its own limb — which is the piece of this drawing that only works now
     * that a mover follows a segment. It is the thing that makes the walkways read as walkways
     * rather than as lines: somebody is using them.
     */
    for (const [index, dock] of harbour.blocks.entries()) {
      const limbs = harbour.quays.filter((one) => one.org === dock.org && one.rank === 'limb')
      const tip = limbs.at(-1)
      const foot = limbs[0]
      if (tip === undefined || foot === undefined) {
        continue
      }
      const figure = walker()
      moving.addChild(figure)
      traffic.push({
        node: figure,
        a: project(foot.spot),
        b: project(tip.spot),
        speed: 0.006 + (index % 4) * 0.0015,
        offset: (index * 0.23) % 1,
      })
    }

    pan = { x: 0, y: 0 }
    zoom = null
    settle()
  }

  app.ticker.add(() => {
    const now = app.ticker.lastTime / 1000

    for (const entry of placed) {
      const swell = Math.sin((now + entry.phase) * ((Math.PI * 2) / 9))
      entry.body.position.y = entry.restY + swell * 0.7
      entry.body.rotation = entry.restRotation + swell * 0.0012
    }

    for (const mover of traffic) {
      /*
       * "Je aktiver das Dock, desto mehr Bewegung." Read off the ships on the page rather than
       * handed down as a prop: the page a reader is on *is* a set of ships, and the dormant tab is
       * dormant by definition. Never zero — a still picture reads as a broken one.
       */
      const t = (mover.offset + now * mover.speed * lively) % 2
      // There and back, so nothing teleports to the far end of its own walk.
      const along = t < 1 ? t : 2 - t
      mover.node.position.set(
        mover.a.x + (mover.b.x - mover.a.x) * along,
        mover.a.y + (mover.b.y - mover.a.y) * along,
      )
      mover.node.scale.x = mover.b.x >= mover.a.x === t < 1 ? 1 : -1
    }
  })

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()

    // Ctrl-wheel zooms, plain wheel scrolls — what every editor and map does, and what a
    // trackpad's pinch already sends.
    if (event.ctrlKey || event.metaKey) {
      const view = viewOf()
      const from = zoom ?? fitScale(extent, view)
      // The floor is "everything fits", measured: a fleet large enough to need less than the
      // standing minimum can still be zoomed out until the whole harbour is on screen.
      const to = clampZoom(
        from * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
        wholeScale(extent, view),
      )
      const rect = canvas.getBoundingClientRect()
      pan = zoomAt(pan, from, to, { x: event.clientX - rect.left, y: event.clientY - rect.top })
      zoom = to
      settle()
      return
    }

    pan = {
      /*
       * Shift-wheel goes sideways — but only where the browser has not already done it.
       *
       * That is the bug this replaces: Chromium on Linux swaps the axes itself for a shift-wheel,
       * so `deltaX` arrived set and `deltaY` arrived zero — and the old line, seeing `shiftKey`,
       * read the zero. Sideways scrolling did nothing at all, on the one modifier meant for it.
       * Asking whether there is a horizontal delta *first* covers both browsers and a trackpad,
       * which sends both at once.
       */
      x: pan.x - (event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0),
      y: pan.y - (event.deltaX === 0 && event.shiftKey ? 0 : event.deltaY),
    }
    settle()
  }
  canvas.addEventListener('wheel', onWheel, { passive: false })

  let dragging: { x: number; y: number } | null = null
  const onDown = (event: PointerEvent): void => {
    dragging = { x: event.clientX - pan.x, y: event.clientY - pan.y }
    canvas.style.cursor = 'grabbing'
  }
  const onMove = (event: PointerEvent): void => {
    if (dragging === null) {
      return
    }
    pan = { x: event.clientX - dragging.x, y: event.clientY - dragging.y }
    settle()
  }
  const onUp = (event: PointerEvent): void => {
    const dragged = dragging !== null
    dragging = null
    settle()
    // A click that reached the canvas hit no hull, so it landed on open water.
    if (!dragged && event.target === canvas) {
      selected(null, null)
    }
  }
  canvas.addEventListener('pointerdown', onDown)
  globalThis.addEventListener('pointermove', onMove)
  globalThis.addEventListener('pointerup', onUp)

  /**
   * A resize only rescales, and that is now the whole of it.
   *
   * The lane layouts before this one were laid out *towards* the window's shape, so a resize could
   * change the answer and had to ask whether it had. A fan has no such parameter: the harbour is
   * the shape the fleet makes, and the window is a viewport onto it. One less thing that can be
   * built for a shape the window used to have.
   */
  const onResize = (): void => {
    settle()
  }
  globalThis.addEventListener('resize', onResize)

  return {
    draw,
    onHover: (handler) => {
      hovered = handler
    },
    onSelect: (handler) => {
      selected = handler
    },
    /**
     * The chosen hull, haloed.
     *
     * Drawn under her and stroked wide, so what shows is a rim around her outline: from above the
     * outline *is* the ship, so following it marks exactly the thing that was clicked, and keeping
     * it underneath means it never tints the cargo. The isometric drawing needed a ring on the
     * ground because an outline around a body seen from a corner is a shape nobody reads at a
     * glance — that reason went with the view.
     */
    highlight: (ship, chosen = null) => {
      const accent = hex(SCENE.accent)
      for (const entry of placed) {
        entry.chosen.clear()
        entry.aboard.clear()
        entry.ashore.clear()
        if (entry.ship.path !== ship?.path) {
          continue
        }

        poly(entry.chosen, entry.hull.outline).fill({ color: accent, alpha: 0.16 })
        poly(entry.chosen, entry.hull.outline).stroke({ width: 6, color: accent, alpha: 0.9 })

        if (chosen === null) {
          continue
        }

        /*
         * Whatever it was, ringed where it stands.
         *
         * Drawn from the same four lists the renderer used, so the ring lands on the thing by
         * construction. A remembered rectangle would be a second opinion about where it is.
         */
        if (chosen.kind === 'mark') {
          const ring = (into: Graphics, boxes: readonly MarkBox[]): void => {
            for (const box of boxes.filter((one) => one.kind === chosen.mark)) {
              slab(into, box.spot, box.along + 0.4, box.across + 0.4).stroke({
                width: 2,
                color: accent,
                alpha: 0.95,
              })
            }
          }
          ring(entry.aboard, hullMarks(entry.ship, entry.hull))
          ring(entry.ashore, pierMarks(entry.ship, entry.hull))
          continue
        }

        /*
         * The planking as a whole: every box waiting on it, ringed at once.
         *
         * The gangway is not a thing on the pier, it is the sign that there are things on it — so
         * it lights all of them rather than whichever happens to be first, which would make
         * clicking the plank and clicking that one crate the same act.
         */
        if (chosen.kind === 'pier') {
          for (const box of [
            ...landedOf(entry.ship, entry.hull),
            ...pierMarks(entry.ship, entry.hull),
          ]) {
            slab(entry.ashore, box.spot, box.along + 0.4, box.across + 0.4).stroke({
              width: 2,
              color: accent,
              alpha: 0.7,
            })
          }
          /*
           * The plank itself, redrawn in the accent.
           *
           * It was the one thing the choice did not mark, and it is the thing that was clicked —
           * the crates lit up and the plank stayed grey, which reads as "that did something else".
           * In the body, because that is where it is drawn: the gangway moves with her.
           */
          const plank = gangwayOf(entry.hull, entry.offset)
          const from = project(plank.from)
          const to = project(plank.to)
          entry.aboard
            .moveTo(from.x, from.y)
            .lineTo(to.x, to.y)
            .stroke({ width: 4, color: accent, alpha: 0.95 })
          continue
        }

        const mark = (into: Graphics, boxes: readonly Container_[]): void => {
          const box = boxes.find((one) => one.quest.id === chosen.id)
          if (box === undefined) {
            return
          }
          slab(into, box.spot, box.along + 0.4, box.across + 0.4).stroke({
            width: 2,
            color: accent,
            alpha: 0.95,
          })
        }
        mark(entry.aboard, cargoOf(entry.ship, entry.hull))
        mark(entry.ashore, landedOf(entry.ship, entry.hull))
      }
    },
    destroy: () => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onDown)
      globalThis.removeEventListener('pointermove', onMove)
      globalThis.removeEventListener('pointerup', onUp)
      globalThis.removeEventListener('resize', onResize)
      app.destroy(true, { children: true })
    },
  }
}
