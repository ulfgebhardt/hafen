/**
 * The harbour, drawn isometrically with Pixi.
 *
 * Imperative, and deliberately the only imperative file here: WebGL batches draw calls, which is
 * why a basin of a hundred hulls with their cargo costs about what one costs in a DOM renderer.
 * The measurement that decided this is Werft's, where the DOM renderer alone took 8.4 % CPU idle.
 *
 * Everything this file *decides* was decided elsewhere. The grid and the drawing order come from
 * `iso.ts`, the shape of a ship from `vessel.ts`, its condition from `condition.ts`, colour and
 * form per verdict from `theme.ts`. This file owns no rule; it turns numbers into strokes — which
 * is why `vitest.config.ts` excludes it by name rather than quietly counting it.
 *
 * Drawn back to front, because Pixi has no depth buffer: whatever is drawn last is in front.
 */

import { Application, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js'

import { conditionOf, keptness } from './condition'
import { ageLabel, berths as orderBerths, drift, fit } from './fleet'
import { berthsFor, byDepth, isoExtent, isoOrigin, piersFor, project, TILE } from './iso'
import { drawn, isCapped, marksOf } from './marks'
import { MARK_COLOR, SCENE, SEGMENT, VERDICT_COLOR } from './theme'
import { bridgeOf, cargoOf, hasPlume, hullOf, SIZE } from './vessel'
import { clampPan, clampZoom, fitScale, isPannable, zoomAt, ZOOM_STEP } from './viewport'

import type { Spot } from './iso'
import type { Hull } from './vessel'
import type { Extent, Pan } from './viewport'
import type { Ship } from '@hafen/core'

const LABEL = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10,
  fill: '#9db4c9',
  letterSpacing: 0.2,
})

const LABEL_DIM = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 9,
  fill: '#6b8096',
  letterSpacing: 0.2,
})

/** How many characters of a name fit beside a berth. */
const CAPTION_CHARS = 20

function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16)
}

/** A flat quad on the ground, projected. Water, concrete, deck. */
function quad(shape: Graphics, corners: readonly Spot[]): Graphics {
  const first = project(corners[0] ?? { x: 0, y: 0 })
  shape.moveTo(first.x, first.y)
  for (const corner of corners.slice(1)) {
    const flat = project(corner)
    shape.lineTo(flat.x, flat.y)
  }
  return shape.closePath()
}

/**
 * A box: a quad lifted by `height`, with its two visible walls.
 *
 * Two and not three — the third faces away and is never seen, and drawing it costs a seam at
 * these line weights as well as the time.
 */
function box(
  shape: Graphics,
  corners: readonly Spot[],
  height: number,
  face: number,
  faceAlpha: number,
  edge: number,
): void {
  // Built rather than spread: under `exactOptionalPropertyTypes` a spread keeps `z` optional,
  // and an optional height is not a height.
  const lift = (corner: Spot): Spot => ({ x: corner.x, y: corner.y, z: (corner.z ?? 0) + height })
  const top = corners.map(lift)

  for (const pair of [
    [corners[1], corners[2]],
    [corners[2], corners[3]],
  ]) {
    const [a, b] = pair
    if (a === undefined || b === undefined) {
      continue
    }
    quad(shape, [a, b, lift(b), lift(a)]).fill({ color: face, alpha: faceAlpha * 0.62 })
  }

  quad(shape, top).fill({ color: face, alpha: faceAlpha })
  quad(shape, top).stroke({ width: 0.8, color: edge, alpha: 0.7 })
}

/**
 * Water, grid and piers — the part of the drawing that stands for nothing.
 *
 * It exists so that what does stand for something has somewhere to be. Generated from the grid
 * rather than traced once, because a basin drawn by hand is wrong the moment the fleet changes
 * size.
 */
function ground(count: number, extent: Extent): Container {
  const group = new Container()
  const steel = hex(SCENE.crane)

  const water = new Graphics()
  water.rect(0, 0, extent.width, extent.height).fill(hex(SCENE.seaNear))
  group.addChild(water)

  const piers = piersFor(count)
  const far = {
    x: (piers[0]?.length ?? 14) + 1,
    y: (piers.at(-1)?.from.y ?? 0) + 2.5,
  }

  // A chart's ruling on the water: what makes the projection legible at all.
  const grid = new Graphics()
  for (let x = 0; x <= far.x; x += 1) {
    const from = project({ x, y: 0 })
    const to = project({ x, y: far.y })
    grid.moveTo(from.x, from.y).lineTo(to.x, to.y)
  }
  for (let y = 0; y <= far.y; y += 1) {
    const from = project({ x: 0, y })
    const to = project({ x: far.x, y })
    grid.moveTo(from.x, from.y).lineTo(to.x, to.y)
  }
  grid.stroke({ width: 0.5, color: hex(SCENE.seaLine), alpha: 0.32 })
  group.addChild(grid)

  // The concrete itself, one strip per pier, raised just clear of the water.
  const concrete = new Graphics()
  for (const pier of piers) {
    const corners = [
      { x: -0.4, y: pier.from.y, z: 3 },
      { x: pier.length, y: pier.from.y, z: 3 },
      { x: pier.length, y: pier.from.y + 0.9, z: 3 },
      { x: -0.4, y: pier.from.y + 0.9, z: 3 },
    ]
    box(concrete, corners, 3, hex(SCENE.quay), 0.9, steel)
  }
  group.addChild(concrete)

  return group
}

export interface Scene {
  draw: (ships: readonly Ship[]) => void
  /** The ship under the pointer, or `null` on the way out. */
  onHover: (handler: (ship: Ship | null) => void) => void
  /** The ship somebody clicked, or `null` for a click on open water. */
  onSelect: (handler: (ship: Ship | null) => void) => void
  /** Which ship to draw as chosen. */
  highlight: (ship: Ship | null) => void
  destroy: () => void
}

/** One drawn berth, and the pieces the scene keeps a handle on. */
interface Placed {
  ship: Ship
  chosen: Graphics
  body: Container
  restY: number
  phase: number
}

/**
 * What the repository itself is doing: crates on the quay, a pennant, a breach.
 *
 * Beside the contract and never on it — the deck is what the fleet demands, this is what is going
 * on here. One row for both would merge two questions with different answers.
 */
function localState(ship: Ship, hull: Hull, at: Spot): Graphics {
  const state = new Graphics()

  for (const mark of marksOf(ship)) {
    const count = drawn(mark)
    const color = hex(MARK_COLOR[mark.kind])

    if (mark.kind === 'damage') {
      const mid = project({ x: hull.length / 2, y: at.y, z: hull.height / 2 })
      state
        .moveTo(mid.x - 6, mid.y - 6)
        .lineTo(mid.x + 6, mid.y + 6)
        .moveTo(mid.x + 6, mid.y - 6)
        .lineTo(mid.x - 6, mid.y + 6)
        .stroke({ width: 1.6, color, alpha: 0.95 })
      continue
    }

    if (mark.kind === 'pennant') {
      const top = project({ x: 0.3, y: at.y, z: hull.height + 22 })
      state
        .moveTo(top.x, top.y)
        .lineTo(top.x + 9, top.y + 2.5)
        .lineTo(top.x, top.y + 5)
        .closePath()
        .fill({ color, alpha: 0.85 })
      continue
    }

    // Everything else stands on the quay beside the ship: work that is not aboard.
    for (let index = 0; index < count; index += 1) {
      const size = 0.1
      const x = 0.3 + index * 0.28
      const y = at.y - 1.15
      box(
        state,
        [
          { x, y: y - size, z: 3 },
          { x: x + size * 1.8, y: y - size, z: 3 },
          { x: x + size * 1.8, y: y + size, z: 3 },
          { x, y: y + size, z: 3 },
        ],
        3.5,
        color,
        mark.kind === 'untracked' ? 0.14 : 0.5,
        color,
      )
    }

    if (isCapped(mark)) {
      const spot = project({ x: 0.3 + count * 0.28, y: at.y - 1.15, z: 8 })
      state
        .moveTo(spot.x, spot.y)
        .lineTo(spot.x + 4, spot.y)
        .moveTo(spot.x + 2, spot.y - 2)
        .lineTo(spot.x + 2, spot.y + 2)
        .stroke({ width: 0.9, color, alpha: 0.8 })
    }
  }
  return state
}

/** A ship's project score, for how long its hull is drawn. */
function scoreOf(ship: Ship): number {
  const work = ship.ledger.total
  return work.commits + work.pulls * 2
}

/**
 * The contract, as containers on the deck.
 *
 * A stack has a height the eye compares across a whole basin without counting anything, which is
 * what the flat row of blocks could not do. An empty deck gets bare planking: "nothing is
 * demanded here" and "everything demanded here failed" must not look alike.
 */
function deckCargo(ship: Ship, hull: Hull, at: Spot): Graphics {
  const cargo = new Graphics()
  const boxes = cargoOf(ship, hull, at)

  if (boxes.length === 0) {
    for (let t = 0.15; t < 0.9; t += 0.18) {
      const from = project({ x: hull.length * t, y: -SIZE.width / 2, z: hull.height })
      const to = project({ x: hull.length * t, y: SIZE.width / 2, z: hull.height })
      cargo.moveTo(from.x, from.y).lineTo(to.x, to.y)
    }
    cargo.stroke({ width: 0.6, color: hex(SCENE.crane), alpha: 0.3 })
    return cargo
  }

  const size = 0.3
  for (const crate of boxes) {
    const color = hex(VERDICT_COLOR[crate.quest.verdict])
    const form = SEGMENT[crate.quest.verdict]
    const deck = crate.spot.z ?? 0
    const corners = [
      { x: crate.spot.x, y: crate.spot.y - size, z: deck },
      { x: crate.spot.x + size * 1.8, y: crate.spot.y - size, z: deck },
      { x: crate.spot.x + size * 1.8, y: crate.spot.y + size, z: deck },
      { x: crate.spot.x, y: crate.spot.y + size, z: deck },
    ]
    box(cargo, corners, 5, color, Math.max(form.opacity, 0.3), color)
  }
  return cargo
}

/** Bridge and funnel. One storey per five binding demands. */
function bridge(ship: Ship, hull: Hull, at: Spot, steel: number): Graphics {
  const house = new Graphics()
  const { spot, storeys } = bridgeOf(ship, hull, at)
  const size = 0.28

  for (let level = 0; level < storeys; level += 1) {
    const z = hull.height + level * 4
    const inset = level * 0.03
    const corners = [
      { x: spot.x + inset, y: spot.y - size + inset, z },
      { x: spot.x + size * 1.5 - inset, y: spot.y - size + inset, z },
      { x: spot.x + size * 1.5 - inset, y: spot.y + size - inset, z },
      { x: spot.x + inset, y: spot.y + size - inset, z },
    ]
    box(house, corners, 4, steel, 0.18, steel)
  }

  // The one earned flourish: every binding demand met and a clean tree.
  if (hasPlume(ship)) {
    const top = project({ x: spot.x + 0.3, y: spot.y, z: hull.height + storeys * 4 + 4 })
    for (const [index, radius] of [2.2, 1.6, 1.1].entries()) {
      house.circle(top.x + index * 3, top.y - 4 - index * 3.2, radius)
    }
    house.stroke({ width: 0.6, color: steel, alpha: 0.5 })
  }
  return house
}
/** The ship itself: hull, cargo, bridge, and what the tree looks like. */
function drawVessel(ship: Ship, into: Container, points: number): Hull {
  const steel = hex(SCENE.crane)
  const kept = keptness(ship)
  const condition = conditionOf(ship)
  const at = { x: 0, y: 0 }

  const hull = hullOf(ship, at, points)
  const shape = new Graphics()

  box(shape, hull.deck, hull.height, steel, 0.08 + kept * 0.14, steel)

  /*
   * Rust along the waterline, and only where the repository is actually old.
   *
   * A stroke rather than a tint: colour is spoken for by the verdicts, and a stroke survives
   * greyscale — which a wash does not.
   */
  if (condition.freshness < 0.5) {
    const marks = Math.max(2, Math.round((1 - condition.freshness) * 5))
    for (let index = 0; index < marks; index += 1) {
      const t = 0.2 + (index / marks) * 0.6
      const spot = project({ x: hull.length * t, y: SIZE.width / 2, z: 3 })
      shape.moveTo(spot.x, spot.y).lineTo(spot.x + 4, spot.y + 1.5)
    }
    shape.stroke({ width: 1.2, color: hex('#b08a68'), alpha: 0.5 })
  }
  into.addChild(shape)

  into.addChild(deckCargo(ship, hull, at))
  into.addChild(bridge(ship, hull, at, steel))
  into.addChild(localState(ship, hull, at))
  return hull
}

/** Name and the two figures that matter, set below the berth. */
function caption(ship: Ship): Container {
  const group = new Container()
  const anchor = project({ x: 0, y: 1.5 })

  const name = new Text({ text: fit(ship.name, CAPTION_CHARS), style: LABEL })
  name.position.set(anchor.x - 20, anchor.y + 4)
  group.addChild(name)

  const binding = ship.quests.filter((quest) => quest.verdict !== 'notApplicable')
  const met = binding.filter((quest) => quest.verdict === 'met').length
  const owed = binding.length === 0 ? 'ohne Forderung' : `${String(met)}/${String(binding.length)}`
  const detail = new Text({
    text: fit(`${ageLabel(ship.rustDays)} · ${owed}`, CAPTION_CHARS + 6),
    style: LABEL_DIM,
  })
  detail.position.set(anchor.x - 20, anchor.y + 16)
  group.addChild(detail)

  return group
}

/**
 * Mounts the scene into a canvas and keeps it alive.
 *
 * Movement is deliberately quiet — a slow swell and a hull that rolls a fraction of a degree. No
 * figures, no gulls: the flair is meant to come from the form, and a basin that bustles is one
 * where the eye never settles on a ship.
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
  let selected: (ship: Ship | null) => void = () => undefined
  let placed: Placed[] = []
  let extent: Extent = { width: 0, height: 0 }
  let pan: Pan = { x: 0, y: 0 }
  let zoom: number | null = null

  const settle = (): void => {
    const view = { width: app.screen.width, height: app.screen.height }
    const scale = zoom ?? fitScale(extent, view)
    world.scale.set(scale)
    const at = clampPan(pan, extent, view, scale)
    world.position.set(at.x, at.y)
    pan = at
    canvas.style.cursor = isPannable(extent, view, scale) ? 'grab' : 'default'
  }

  const draw = (ships: readonly Ship[]): void => {
    world.removeChildren()
    placed = []

    const order = orderBerths(ships)
    const spots = berthsFor(order.length)
    extent = isoExtent(order.length)
    const origin = isoOrigin(order.length)

    world.addChild(ground(order.length, extent))

    const basin = new Container()
    basin.position.set(origin.x, origin.y)
    world.addChild(basin)

    /*
     * Built once, outside the loop, and reading the handler at the moment the pointer arrives:
     * `onHover` and `onSelect` are registered *after* the first draw, so a closure capturing the
     * value would capture the do-nothing default.
     */
    const onEnter = (ship: Ship) => (): void => {
      hovered(ship)
    }
    const onTap = (ship: Ship) => (): void => {
      selected(ship)
    }

    // Back to front: Pixi has no depth buffer, so drawing order *is* depth.
    const laid = order
      .map((berth, index) => ({ ship: berth.ship, spot: spots[index]?.spot ?? { x: 0, y: 0 } }))
      .sort((a, b) => byDepth(a.spot, b.spot))

    for (const entry of laid) {
      const slot = new Container()
      const flat = project(entry.spot)
      slot.position.set(flat.x, flat.y)

      const chosen = new Graphics()
      const body = new Container()
      slot.addChild(chosen)
      slot.addChild(body)

      drawVessel(entry.ship, body, scoreOf(entry.ship))
      slot.addChild(caption(entry.ship))

      slot.eventMode = 'static'
      slot.cursor = 'pointer'
      slot.hitArea = new Rectangle(-TILE.width * 0.45, -56, TILE.width * 2.2, 100)
      slot.on('pointerover', onEnter(entry.ship))
      slot.on('pointertap', onTap(entry.ship))

      basin.addChild(slot)
      placed.push({
        ship: entry.ship,
        chosen,
        body,
        restY: 0,
        phase: drift(entry.ship.path) * 7,
      })
    }

    pan = { x: 0, y: 0 }
    zoom = null
    settle()
  }

  app.ticker.add(() => {
    const now = app.ticker.lastTime / 1000
    for (const entry of placed) {
      const swell = Math.sin((now + entry.phase) * ((Math.PI * 2) / 7))
      entry.body.position.y = entry.restY - swell * 1.1
    }
  })

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()

    // Ctrl-wheel zooms, plain wheel scrolls — what every editor and map does, and what a
    // trackpad's pinch already sends.
    if (event.ctrlKey || event.metaKey) {
      const view = { width: app.screen.width, height: app.screen.height }
      const from = zoom ?? fitScale(extent, view)
      const to = clampZoom(from * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP))
      const rect = canvas.getBoundingClientRect()
      pan = zoomAt(pan, from, to, { x: event.clientX - rect.left, y: event.clientY - rect.top })
      zoom = to
      settle()
      return
    }

    pan = {
      x: pan.x - (event.shiftKey ? event.deltaY : event.deltaX),
      y: pan.y - (event.shiftKey ? 0 : event.deltaY),
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
      selected(null)
    }
  }
  canvas.addEventListener('pointerdown', onDown)
  globalThis.addEventListener('pointermove', onMove)
  globalThis.addEventListener('pointerup', onUp)

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
     * A ring on the water under the chosen ship.
     *
     * Under it rather than traced around it: an outline following an isometric body is a shape
     * nobody reads at a glance, while a ring on the ground says "this berth" immediately — and it
     * is the one mark that cannot be mistaken for cargo.
     */
    highlight: (ship) => {
      for (const entry of placed) {
        entry.chosen.clear()
        if (entry.ship.path !== ship?.path) {
          continue
        }
        const ring = [
          { x: -0.5, y: -1.2 },
          { x: 4, y: -1.2 },
          { x: 4, y: 1.2 },
          { x: -0.5, y: 1.2 },
        ]
        quad(entry.chosen, ring).fill({ color: hex(SCENE.accent), alpha: 0.1 })
        quad(entry.chosen, ring).stroke({ width: 2, color: hex(SCENE.accent), alpha: 0.9 })
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
