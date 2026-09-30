/**
 * The harbour, drawn with Pixi.
 *
 * Imperative, and deliberately the only imperative file here: WebGL batches draw calls, which is
 * why ninety-one hulls with their frames and captions cost about what one costs in a DOM
 * renderer. The measurement that decided this is Werft's, where the DOM renderer alone took
 * 8.4 % CPU while idle.
 *
 * Everything this file *decides* was decided elsewhere. Order comes from `fleet.ts`, geometry
 * from `hull.ts`, colour and form per verdict from `theme.ts`. This file owns no rule; it turns
 * numbers into strokes. That split is what keeps anything testable at all, because a canvas
 * cannot be asserted about — and it is why `vitest.config.ts` excludes this file by name rather
 * than quietly counting it.
 *
 * The style is a lines plan: thin strokes, a survey grid, frames, waterline marks, captions in a
 * monospace face. Not an illustration — no clouds, no gulls, no spray. Every line stands for
 * something that was measured, which is the promise the rest of the tool makes too.
 */

import { Application, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js'

import { cranes, shoreline, waves } from './coast'
import { conditionOf, isExemplary, keptness } from './condition'
import { ageLabel, berths, bindingQuests, fit, PER_LANE } from './fleet'
import { draught, frames, HULL, MAX_DRAUGHT, outline, segments, storeys } from './hull'
import { drawn, isCapped, isShipshape, marksOf } from './marks'
import { HULL_COLOR, MARK_COLOR, SCENE, SEGMENT, VERDICT_COLOR } from './theme'
import { clampPan, clampZoom, fitScale, isPannable, zoomAt, ZOOM_STEP } from './viewport'

import type { Berth } from './fleet'
import type { Extent, Pan } from './viewport'
import type { Ship } from '@hafen/core'

/**
 * One hull's footprint, including the two caption lines under it.
 *
 * Wider than the hull is long: the first layout sized the cell to the drawing, and the captions
 * of ninety-one repositories ran into each other. The cell is sized by the *text* and the hull
 * sits inside it — which is the right way round, because the text is the part to be read.
 */
const CELL = { width: 176, height: 140 }

/** How many characters of a caption fit a cell at `LABEL`'s size. */
const CAPTION_CHARS = 23

/** How far each lane is inset, so the lanes read as depth rather than as table rows. */
const LANE_STAGGER = 22

/**
 * Where the caption starts, below everything the ship can reach down to.
 *
 * Computed rather than guessed, because it was guessed first and the labels ended up drawn
 * across the hulls: a deeply laden ship sits `draught` × `depth` lower, and the stash crates and
 * boats hang under that again. The deepest a ship goes is `MAX_DRAUGHT`, so the text starts
 * below that and not at a number that happened to work for an empty one.
 *
 * A function and not a module-level constant, which is the second half of the white-window fix
 * in `vite.hmr.ts`: a constant computed once out of another module's export freezes whichever
 * generation of that module was loaded first.
 */
function captionTop(): number {
  return Math.ceil(HULL.depth * (MAX_DRAUGHT - 1) + HULL.depth + 12)
}

const LABEL = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  fill: '#9db4c9',
  letterSpacing: 0.2,
})

const LABEL_DIM = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 9.5,
  fill: '#6b8096',
  letterSpacing: 0.2,
})

function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16)
}

/**
 * The survey grid behind everything: a drawing sheet, not a sky.
 *
 * Drawn into one `Graphics` rather than one per line — a grid is the cheapest thing on screen to
 * make expensive, and nobody looks at it directly.
 */
function sheet(width: number, height: number): Graphics {
  const grid = new Graphics()
  grid.rect(0, 0, width, height).fill(hex(SCENE.skyTop))

  const STEP = 32
  for (let x = 0; x <= width; x += STEP) {
    grid.moveTo(x, 0).lineTo(x, height)
  }
  for (let y = 0; y <= height; y += STEP) {
    grid.moveTo(0, y).lineTo(width, y)
  }
  grid.stroke({ width: 0.5, color: hex(SCENE.seaLine), alpha: 0.35 })

  // Every fifth line heavier, the way a drawing sheet is ruled.
  for (let x = 0; x <= width; x += STEP * 5) {
    grid.moveTo(x, 0).lineTo(x, height)
  }
  for (let y = 0; y <= height; y += STEP * 5) {
    grid.moveTo(0, y).lineTo(width, y)
  }
  grid.stroke({ width: 0.6, color: hex(SCENE.seaLine), alpha: 0.6 })

  return grid
}

/**
 * Water, beach and quay — the one part of this drawing that stands for nothing.
 *
 * Drawn under everything and in three flat layers, because depth here is a reading aid and not a
 * picture: the eye needs to know where the sheet ends, and a harbour without a shoreline is a
 * grid with boats on it.
 */
function coast(width: number, height: number): Container {
  const group = new Container()
  const steel = hex(SCENE.crane)

  const sand = new Graphics()
  const shore = shoreline(width, height)
  sand.moveTo(0, height)
  for (const point of shore) {
    sand.lineTo(point.x, point.y)
  }
  sand
    .lineTo(width, height)
    .closePath()
    .fill({ color: hex(SCENE.land), alpha: 0.85 })
  // The waterline itself, drawn over the fill so the sand reads as being behind it.
  sand.moveTo(shore[0]?.x ?? 0, shore[0]?.y ?? height)
  for (const point of shore.slice(1)) {
    sand.lineTo(point.x, point.y)
  }
  sand.stroke({ width: 0.9, color: steel, alpha: 0.35 })
  group.addChild(sand)

  // Crests: short strokes on the water, not a wave shape — at this scale a drawn wave is a
  // smudge, and a tick mark reads as water because that is how a chart draws it.
  const swell = new Graphics()
  for (const lane of [0.42, 0.62, 0.8]) {
    const y = height * lane
    for (const wave of waves(width, Math.round(lane * 100))) {
      const x = wave.at * width
      swell.moveTo(x, y).lineTo(x + wave.width * 0.4, y - wave.height * 0.5)
    }
  }
  swell.stroke({ width: 0.5, color: steel, alpha: 0.16 })
  group.addChild(swell)

  const quay = new Graphics()
  const quayY = height - 14
  quay.moveTo(0, quayY).lineTo(width, quayY).stroke({ width: 1.1, color: steel, alpha: 0.4 })
  for (const crane of cranes(width)) {
    const top = quayY - crane.height
    quay
      .moveTo(crane.x, quayY)
      .lineTo(crane.x, top)
      .moveTo(crane.x, top)
      .lineTo(crane.x + crane.reach, top + 4)
      .moveTo(crane.x + crane.reach, top + 4)
      .lineTo(crane.x + crane.reach, top + 12)
  }
  quay.stroke({ width: 0.7, color: steel, alpha: 0.3 })
  group.addChild(quay)

  return group
}

/** The waterline of one lane, with its mark. */
function laneLine(width: number, lane: number): Container {
  const group = new Container()

  const line = new Graphics()
  line
    .moveTo(0, 0)
    .lineTo(width, 0)
    .stroke({ width: 0.8, color: hex(SCENE.crane), alpha: 0.28 })
  group.addChild(line)

  const mark = new Text({ text: `WL ${String(lane + 1)}`, style: LABEL_DIM })
  mark.position.set(2, -11)
  group.addChild(mark)

  return group
}

/**
 * The deck divided by the contract: the whole point of the picture.
 *
 * `notApplicable` takes no room, and a ship with nothing binding gets a dashed deck — "never
 * measured" and "measured and empty" must not look alike, which is the same rule the CLI
 * renderer follows and the reason there are five verdicts rather than three.
 *
 * Every verdict carries a *form* as well as a colour: filled, hatched, or a dashed outline. The
 * reading has to survive greyscale and a colour-blind eye, and a canvas gives a screen reader
 * nothing at all — the sheet on the right is where the words are.
 */
function deck(ship: Ship, steel: number): Graphics {
  const marks = new Graphics()
  const blocks = segments(ship)
  const top = -6.5
  const height = 6

  if (blocks.length === 0) {
    const from = HULL.tuck + 3
    const to = HULL.length - HULL.rake * 1.6 - 3
    for (let x = from; x < to; x += 6) {
      marks.moveTo(x, top + height).lineTo(Math.min(x + 3, to), top + height)
    }
    marks.stroke({ width: 0.9, color: steel, alpha: 0.3 })
    return marks
  }

  for (const block of blocks) {
    const color = hex(VERDICT_COLOR[block.verdict])
    const form = SEGMENT[block.verdict]

    marks.rect(block.x, top, block.width - 1, height).fill({ color, alpha: form.opacity })

    if (form.hatch) {
      for (let x = block.x + 1.5; x < block.x + block.width - 2; x += 2.4) {
        marks.moveTo(x, top + height).lineTo(x + height * 0.8, top)
      }
      marks.stroke({ width: 0.6, color, alpha: 0.95 })
    }

    marks
      .rect(block.x, top, block.width - 1, height)
      .stroke({ width: form.dashed ? 0.5 : 0.6, color, alpha: form.dashed ? 0.75 : 0.85 })
  }

  return marks
}

/** Bridge and mast. One storey per five binding demands — a measurement, capped at four. */
function superstructure(ship: Ship, steel: number): Graphics {
  const house = new Graphics()
  const levels = storeys(ship)
  const width = 26
  const left = HULL.length * 0.28
  const storeyHeight = HULL.house * 0.55

  for (let level = 0; level < levels; level += 1) {
    const inset = level * 3
    house.rect(
      left + inset,
      -6.5 - storeyHeight * (level + 1),
      width - inset * 2,
      storeyHeight - 0.6,
    )
  }
  house.stroke({ width: 0.7, color: steel, alpha: 0.6 })

  const mastFoot = -6.5 - storeyHeight * levels
  house
    .moveTo(left + width * 0.5, mastFoot)
    .lineTo(left + width * 0.5, mastFoot - HULL.mast * 0.5)
    .stroke({ width: 0.7, color: steel, alpha: 0.55 })

  return house
}

/**
 * What the repository itself is doing, as cargo, flags and damage.
 *
 * Beside the deck and never on it: the deck is what the *fleet* demands, this is what is going
 * on *here*. Drawing them in one row would merge two questions that have different answers and
 * different remedies.
 *
 * Crates are stacked forward of the bridge, the pennant flies at the mast, a breach is drawn
 * into the hull side, and the stash lies on the quay under the ship — outside the hull, because
 * that is exactly where stashed work is: in no commit and in no tree.
 */
function localState(ship: Ship, steel: number): Container {
  const group = new Container()
  const state = new Graphics()
  group.addChild(state)

  const marks = marksOf(ship)
  const crateSize = 3.2
  let stackX = HULL.length * 0.58

  for (const mark of marks) {
    const count = drawn(mark)
    const color = hex(MARK_COLOR[mark.kind])

    if (mark.kind === 'damage') {
      // A breach in the side: the one mark here that is not cargo, because a conflict is not
      // work in progress — it is work that stopped.
      const at = HULL.length * 0.42
      state
        .moveTo(at - 4, 4)
        .lineTo(at + 4, HULL.depth - 5)
        .moveTo(at + 4, 4)
        .lineTo(at - 4, HULL.depth - 5)
        .stroke({ width: 1.2, color, alpha: 0.95 })
      continue
    }

    if (mark.kind === 'pennant') {
      // At the masthead: cargo aboard that has not been delivered.
      const mastX = HULL.length * 0.28 + 13
      const top = -6.5 - HULL.house * 0.55 * storeys(ship) - HULL.mast * 0.5
      state
        .moveTo(mastX, top)
        .lineTo(mastX + 9, top + 2.2)
        .lineTo(mastX, top + 4.4)
        .closePath()
        .fill({ color, alpha: 0.85 })
      continue
    }

    if (mark.kind === 'drag') {
      // A drag mark astern: the remote is ahead, this tree is being pulled along behind it.
      for (let index = 0; index < count; index += 1) {
        const x = -3 - index * 3.5
        state.moveTo(x, HULL.depth - 3).lineTo(x - 2.5, HULL.depth + 1)
      }
      state.stroke({ width: 0.9, color, alpha: 0.75 })
      continue
    }

    if (mark.kind === 'boat') {
      // Boats alongside, outboard of the hull: another working tree of the same repository.
      for (let index = 0; index < count; index += 1) {
        const x = HULL.length * 0.1 + index * 9
        const y = HULL.depth + 3.5
        state
          .moveTo(x, y)
          .lineTo(x + 7, y)
          .lineTo(x + 5.5, y + 2.4)
          .lineTo(x + 1.5, y + 2.4)
          .closePath()
          .stroke({ width: 0.6, color, alpha: 0.6 })
      }
      continue
    }

    if (mark.kind === 'stash') {
      // On the quay under the ship: work that is in no commit and in no tree.
      for (let index = 0; index < count; index += 1) {
        const x = HULL.length * 0.62 + index * (crateSize + 1.4)
        state.rect(x, HULL.depth + 4, crateSize, crateSize)
      }
      state.stroke({ width: 0.7, color, alpha: 0.8 })
      continue
    }

    // Crates on deck, stacked forward: staged closed, unstaged open, untracked dashed.
    for (let index = 0; index < count; index += 1) {
      const x = stackX + index * (crateSize + 1.2)
      const y = -6.5 - crateSize - 0.5
      if (mark.kind === 'staged') {
        state.rect(x, y, crateSize, crateSize).fill({ color, alpha: 0.85 })
      } else {
        state.rect(x, y, crateSize, crateSize).stroke({
          width: mark.kind === 'untracked' ? 0.5 : 0.8,
          color,
          alpha: mark.kind === 'untracked' ? 0.6 : 0.85,
        })
      }
    }
    stackX += count * (crateSize + 1.2) + 2.4

    if (isCapped(mark)) {
      // The cap is a drawing limit, so the drawing says so rather than claiming the count is
      // four. The real number is in the datasheet.
      const plus = new Text({ text: '+', style: LABEL_DIM })
      plus.position.set(stackX - 2, -6.5 - crateSize - 5)
      group.addChild(plus)
    }
  }

  // Everything measured and nothing open: one quiet tick, so "clean" is visible rather than
  // being the absence of marks — which is what "not measured" looks like.
  if (isShipshape(ship) && ship.hasGit) {
    state
      .moveTo(HULL.length * 0.62, -9)
      .lineTo(HULL.length * 0.62 + 2.2, -7)
      .lineTo(HULL.length * 0.62 + 6, -11.5)
      .stroke({ width: 0.9, color: steel, alpha: 0.45 })
  }

  return group
}

/**
 * Smoke from the funnel: the mark of a ship that is both kept and met.
 *
 * Three puffs of decreasing size, drawn as outlines rather than filled — filled circles at this
 * scale read as bullet points, which is exactly the wrong association.
 */
function plume(steel: number): Graphics {
  const smoke = new Graphics()
  const x = HULL.length * 0.28 + 6
  const base = -6.5 - HULL.house * 0.55

  // The funnel itself.
  smoke.rect(x, base - 5, 4, 5).stroke({ width: 0.7, color: steel, alpha: 0.7 })

  for (const [index, puff] of [2.2, 1.6, 1.1].entries()) {
    smoke.circle(x + 2 + index * 3.4, base - 8 - index * 3.6, puff)
  }
  smoke.stroke({ width: 0.6, color: steel, alpha: 0.45 })
  return smoke
}

/**
 * One ship as a lines plan.
 *
 * Returns the container *and* the hull, because the roll is applied to the hull and its deck
 * only — a caption that rolled with the ship would be a caption nobody can read, and at this
 * size the movement has to stay under the text.
 */
function drawShip(ship: Ship): { root: Container; body: Container } {
  const root = new Container()
  const body = new Container()

  /*
   * How well kept this ship is decides how it is *drawn*, not just what is drawn on it.
   *
   * Before this, every hull was the same hull and only the deck differed — which meant the
   * picture said nothing at a glance about a repository somebody had looked after. The weighting
   * leans on hygiene because that is the half a person can fix in two minutes: commit, push,
   * pop the stash, and the ship visibly rides better. A contract takes a week.
   */
  const kept = keptness(ship)
  const condition = conditionOf(ship)
  const steel = hex(SCENE.crane)

  /**
   * Sinkage owns the resting position; the roll only ever offsets from it.
   *
   * The pivot is set once, here, and never in the ticker: a pivot assigned every frame moved the
   * hull by its own half-length on the first tick, because the offset it implies was applied
   * again each time.
   */
  body.pivot.set(HULL.length * 0.5, HULL.depth * 0.5)
  const sinkage = draught(ship) * HULL.depth
  body.position.set(HULL.length * 0.5, -HULL.depth + sinkage + HULL.depth * 0.5)

  const shape = new Graphics()
  const points = outline()

  shape.moveTo(points[0]?.x ?? 0, points[0]?.y ?? 0)
  for (const point of points.slice(1)) {
    shape.lineTo(point.x, point.y)
  }
  // A kept ship is drawn with a confident line; a neglected one thins out and greys.
  shape.closePath().stroke({ width: 0.7 + kept * 0.8, color: steel, alpha: 0.42 + kept * 0.5 })

  /*
   * Frames: the detail that makes a hull read as built rather than as a wedge.
   *
   * Their *number* follows the contract — a ship held to demands it meets is drawn with more
   * structure in it. Which is decoration standing in for something measured, and the one place
   * in this drawing where that is deliberate rather than sloppy.
   */
  const ribs = 5 + Math.round((condition.contract ?? 0.4) * 4)
  for (const x of frames(ribs)) {
    shape.moveTo(x, 2).lineTo(x, HULL.depth - 1.5)
  }
  shape.stroke({ width: 0.4, color: steel, alpha: 0.12 + kept * 0.2 })

  shape
    .moveTo(HULL.tuck * 0.4, 0)
    .lineTo(HULL.length - 1, 0)
    .stroke({ width: 0.7, color: steel, alpha: 0.25 + kept * 0.4 })

  /*
   * Rust: short strokes along the waterline, and only where the repository is actually old.
   *
   * Drawn on the hull rather than as a colour wash, because colour is already spoken for by the
   * verdicts — and a stroke survives greyscale, which a tint does not.
   */
  if (condition.freshness < 0.5) {
    const patches = Math.round((1 - condition.freshness) * 7)
    for (let index = 0; index < patches; index += 1) {
      const x = HULL.tuck + 6 + (index * (HULL.length - 24)) / patches
      const y = HULL.depth * 0.55 + (index % 2) * 3
      shape.moveTo(x, y).lineTo(x + 3.5, y + 1.5)
    }
    shape.stroke({ width: 1.1, color: hex(HULL_COLOR.rust), alpha: 0.5 })
  }
  body.addChild(shape)

  body.addChild(deck(ship, steel))
  body.addChild(superstructure(ship, steel))
  body.addChild(localState(ship, steel))

  /*
   * The one flourish, and it is earned rather than decorative: a funnel with smoke, for a ship
   * that meets every demand that binds it *and* has a clean tree.
   *
   * Both halves, because either alone is a different sentence — a spotless tree on a repository
   * with no CI is not an exemplary repository, and a perfect contract with four stashes is not
   * either. It is the only thing in the scene that moves on its own, so it is the thing the eye
   * finds first across ninety hulls.
   */
  if (isExemplary(ship)) {
    body.addChild(plume(steel))
  }

  root.addChild(body)
  return { root, body }
}

/**
 * Name, age and count — a datasheet caption, not a tooltip.
 *
 * The repository name alone and not `org/name`: at this width the organisation eats the part
 * that tells two rows apart, and the sheet on the right carries the full path anyway.
 */
function caption(ship: Ship): Container {
  const group = new Container()

  const name = new Text({ text: fit(ship.name, CAPTION_CHARS), style: LABEL })
  const top = captionTop()
  name.position.set(0, top)
  group.addChild(name)

  const binding = bindingQuests(ship)
  const met = binding.filter((quest) => quest.verdict === 'met').length
  const owed = binding.length === 0 ? 'ohne Forderung' : `${String(met)}/${String(binding.length)}`
  const detail = new Text({
    text: fit(`${ageLabel(ship.rustDays)} · ${owed}`, CAPTION_CHARS + 4),
    style: LABEL_DIM,
  })
  detail.position.set(0, top + 13)
  group.addChild(detail)

  return group
}

/** A hull that moves, with the position it returns to. */
interface Roll {
  body: Container
  phase: number
  restY: number
}

/** One berth: hull, caption, and the area that answers the pointer. */
function place(
  berth: Berth,
  hovered: (ship: Ship) => void,
  selected: (ship: Ship) => void,
  rolling: Roll[],
): Container {
  const slot = new Container()
  const { root, body } = drawShip(berth.ship)

  const x = 20 + berth.x * PER_LANE * CELL.width + berth.lane * LANE_STAGGER
  const y = 40 + berth.lane * CELL.height + HULL.depth
  slot.position.set(x, y)

  slot.addChild(root)
  slot.addChild(caption(berth.ship))
  rolling.push({ body, phase: berth.phase, restY: body.position.y })

  /**
   * A real `Rectangle`, not an object with a `contains` method.
   *
   * Pixi calls `hitArea.contains`, so a duck-typed object looks like it ought to work and simply
   * never matched — the first run hovered every hull and filled nothing. It covers the caption
   * too, because as far as a pointer is concerned the caption is part of the ship.
   */
  slot.eventMode = 'static'
  slot.cursor = 'pointer'
  slot.hitArea = new Rectangle(-4, -HULL.depth - 26, HULL.length + 8, HULL.depth + 56)
  slot.on('pointerover', () => {
    hovered(berth.ship)
  })
  slot.on('pointertap', () => {
    selected(berth.ship)
  })

  return slot
}

/**
 * Places the drawing: as large as it can be without falling below legibility, then clamped.
 *
 * `fitScale` may well answer 1 for ninety hulls, which means the plan is bigger than the window
 * and has to be moved across. That is the right trade — the alternative was the whole fleet at
 * 35 %, where the captions stopped being letters.
 */
function placeWorld(
  app: Application,
  world: Container,
  extent: Extent,
  pan: Pan,
  zoom: number | null,
): number {
  const view = { width: app.screen.width, height: app.screen.height }
  // A hand-set zoom wins over the fit, and keeps winning until the drawing is replaced.
  const scale = zoom ?? fitScale(extent, view)
  world.scale.set(scale)

  const at = clampPan(pan, extent, view, scale)
  world.position.set(at.x, at.y)
  return scale
}

export interface Scene {
  /** Ships in, picture out. Replaces whatever was drawn. */
  draw: (ships: readonly Ship[]) => void
  /**
   * The ship under the pointer, or `null` on the way out.
   *
   * Apart from `onSelect`, because the two are different acts: hovering is looking, clicking is
   * deciding. Reading a datasheet was impossible while every crossed hull replaced it.
   */
  onHover: (handler: (ship: Ship | null) => void) => void
  /** The ship somebody clicked, or `null` for a click on open water. */
  onSelect: (handler: (ship: Ship | null) => void) => void
  destroy: () => void
}

/**
 * Mounts the scene into a canvas and keeps it alive.
 *
 * The roll is a function of time and each berth's own phase, so ninety-one hulls do not move in
 * lockstep — and it is small: 0.4° and 1.4 px, once every seven seconds. A harbour that bobs is
 * a toy; this is a drawing that happens to be alive, and the movement exists so the eye reads
 * ninety-one objects rather than one pattern.
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
  let rolling: Roll[] = []
  /** What a person zoomed to by hand, or `null` while the fit decides. */
  let zoom: number | null = null
  let extent: Extent = { width: 0, height: 0 }
  let pan: Pan = { x: 0, y: 0 }

  const settle = (): void => {
    const scale = placeWorld(app, world, extent, pan, zoom)
    pan = { x: world.position.x, y: world.position.y }
    // Only offer a grab where there is somewhere to go.
    canvas.style.cursor = isPannable(
      extent,
      { width: app.screen.width, height: app.screen.height },
      scale,
    )
      ? 'grab'
      : 'default'
  }

  const draw = (ships: readonly Ship[]): void => {
    world.removeChildren()
    rolling = []

    const laid = berths(ships)
    const lanes = Math.max(1, Math.ceil(laid.length / PER_LANE))
    extent = {
      width: PER_LANE * CELL.width + LANE_STAGGER * lanes + 40,
      height: lanes * CELL.height + 60,
    }

    world.addChild(sheet(extent.width, extent.height))
    world.addChild(coast(extent.width, extent.height))

    for (let lane = 0; lane < lanes; lane += 1) {
      const line = laneLine(extent.width - 20, lane)
      line.position.set(10, 40 + lane * CELL.height + HULL.depth)
      world.addChild(line)
    }

    // Built once outside the loop and wrapped rather than passed straight through: the handler
    // is registered by `onPick` *after* the first draw, so the hulls have to reach `picked`
    // through a closure that reads it when the pointer arrives, not when the ship was drawn.
    const onHoverShip = (ship: Ship): void => {
      hovered(ship)
    }
    const onSelectShip = (ship: Ship): void => {
      selected(ship)
    }
    for (const berth of laid) {
      world.addChild(place(berth, onHoverShip, onSelectShip, rolling))
    }

    // A fresh drawing starts at the top left, where the worst ships are, and at its own size.
    pan = { x: 0, y: 0 }
    zoom = null
    settle()
  }

  /**
   * Wheel scrolls, shift-wheel scrolls sideways, dragging moves the sheet.
   *
   * On the canvas element rather than through Pixi's event system, because the hulls are
   * `static` and eat pointer events — a drag that started on a ship would otherwise never
   * reach the scene. `preventDefault` so the page behind does not scroll with it.
   */
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()

    /*
     * Ctrl-wheel zooms, plain wheel scrolls — the convention every editor and map shares, and
     * the one a trackpad's pinch already sends. Zooming on the plain wheel would fight the
     * scrolling this scene needs more often.
     */
    if (event.ctrlKey || event.metaKey) {
      const view = { width: app.screen.width, height: app.screen.height }
      const from = zoom ?? fitScale(extent, view)
      const to = clampZoom(from * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP))
      const box = canvas.getBoundingClientRect()
      pan = zoomAt(pan, from, to, { x: event.clientX - box.left, y: event.clientY - box.top })
      zoom = to
      settle()
      return
    }

    const sideways = event.shiftKey
    pan = {
      x: pan.x - (sideways ? event.deltaY : event.deltaX),
      y: pan.y - (sideways ? 0 : event.deltaY),
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
  const onUp = (): void => {
    dragging = null
    settle()
  }
  canvas.addEventListener('pointerdown', onDown)
  globalThis.addEventListener('pointermove', onMove)
  globalThis.addEventListener('pointerup', onUp)

  // The window is resizable, and a clamped pan is only correct for the size it was clamped at.
  const onResize = (): void => {
    settle()
  }
  globalThis.addEventListener('resize', onResize)

  app.ticker.add(() => {
    const now = app.ticker.lastTime / 1000
    for (const { body, phase, restY } of rolling) {
      const swell = Math.sin((now + phase) * ((Math.PI * 2) / 7))
      body.rotation = swell * 0.007
      body.position.y = restY - swell * 1.4
    }
  })

  // A click that hits no ship is a click on open water, and it clears the pin.
  canvas.addEventListener('pointerup', (event) => {
    if (dragging === null && event.target === canvas) {
      // Pixi stops propagation for a hull, so anything arriving here missed every one of them.
      selected(null)
    }
  })

  return {
    draw,
    onHover: (handler) => {
      hovered = handler
    },
    onSelect: (handler) => {
      selected = handler
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
