<script setup lang="ts">
  /**
   * One ship, drawn again in her own datasheet.
   *
   * **SVG and not a second Pixi canvas**, which is the whole reason this is cheap: a second WebGL
   * context for a panel a few hundred pixels wide would cost a renderer, a ticker and a second
   * copy of every texture — and the thing it is for is *clicking*, which SVG gives away. Every box
   * here is a real element, so hover, focus, a title and a keyboard all work without a hit test.
   *
   * It decides nothing. The shapes come from `vessel.ts` — the same `outlineOf`, `cargoOf`,
   * `landedOf` and `bridgeOf` the harbour strokes — so the plan beside the reading and the plan in
   * the basin cannot disagree about what this ship looks like.
   */

  import { shipPoints } from '@hafen/core'
  import { computed } from 'vue'

  import { isMark, isQuest } from './chosen'
  import { MARK_LABEL, MARK_MEANING } from './marks'
  import { MARK_COLOR, SCENE, SEGMENT, VERDICT_COLOR, VERDICT_LABEL } from './theme'
  import { bridgeOf, cargoOf, hullMarks, hullOf, landedOf, pierMarks } from './vessel'

  import type { Chosen } from './chosen'
  import type { Ship } from '@hafen/core'

  const { ship, chosen = null } = defineProps<{
    ship: Ship
    /** What is lit on her, wherever it stands. */
    chosen?: Chosen | null
  }>()

  const emit = defineEmits<{ pick: [Chosen | null] }>()

  const hull = computed(() => hullOf(ship, shipPoints(ship).project))
  const cargo = computed(() => cargoOf(ship, hull.value))
  const landed = computed(() => landedOf(ship))
  const bridge = computed(() => bridgeOf(ship, hull.value))

  /**
   * Everything else drawn on her: crates on the planking, a flag, damage, boats alongside.
   *
   * Here too, and from the same two functions the harbour uses. "Every visual element has a
   * counterpart in the detail view" is only true if the detail view draws the same elements —
   * a plan that showed the cargo and left out the stash would answer half the clicks.
   */
  const marks = computed(() => [...pierMarks(ship), ...hullMarks(ship, hull.value)])

  /**
   * The drawing's own box, in the ship's coordinates.
   *
   * Computed from what is actually drawn rather than from the berth's bands: this plan has no
   * neighbours to keep clear of, so the pier band it inherits from `landedOf` is only as deep as
   * the boxes that ended up in it. A fixed frame would leave a third of the panel empty for a ship
   * that owes nothing.
   */
  const frame = computed(() => {
    const half = hull.value.beam / 2
    const drawn = [...landed.value, ...marks.value]
    const top = Math.min(-half, ...drawn.map((box) => box.spot.y - box.across / 2)) - 1
    const bottom = Math.max(half, ...drawn.map((box) => box.spot.y + box.across / 2)) + 1
    const right = Math.max(hull.value.length, ...drawn.map((box) => box.spot.x + box.along / 2))
    return { x: -3.5, y: top, width: right + 5, height: bottom - top }
  })

  const outline = computed(() =>
    hull.value.outline.map((point) => `${String(point.x)},${String(point.y)}`).join(' '),
  )

  /** A filled box reads as done, a hatched one as failing — the same forms the harbour uses. */
  const fillFor = (verdict: keyof typeof VERDICT_COLOR): number =>
    Math.max(SEGMENT[verdict].opacity, 0.22)

  /**
   * The one box that is lit, as a rectangle to ring.
   *
   * A ring of its own rather than a thicker border on the box itself, which is what it was: a
   * stroke is centred on the edge, so thickening it ate a third of a box 1.2 units tall and the
   * corners came out as blunt wedges. Outset by a fixed amount and drawn last, so it sits *around*
   * the thing and the thing keeps its own shape.
   */
  const lit = computed(() => {
    const all = [
      ...cargo.value.map((box) => ({ box, on: isQuest(chosen, box.quest.id) })),
      ...landed.value.map((box) => ({ box, on: isQuest(chosen, box.quest.id) })),
      ...marks.value.map((box) => ({ box, on: isMark(chosen, box.kind) })),
    ]
    return all
      .filter((one) => one.on)
      .map(({ box }) => ({
        x: box.spot.x - box.along / 2 - RING,
        y: box.spot.y - box.across / 2 - RING,
        width: box.along + RING * 2,
        height: box.across + RING * 2,
      }))
  })

  /** How far the ring stands off what it marks, in the ship's own units. */
  const RING = 0.35
</script>

<template>
  <!--
    `pointer-events` on the boxes only: a click on open water clears the choice, the same as in
    the harbour, and the hull itself is not a target because "this ship" is already answered by
    the sheet the drawing sits in.
  -->
  <svg
    class="block w-full [&_*]:[vector-effect:non-scaling-stroke]"
    :viewBox="`${frame.x} ${frame.y} ${frame.width} ${frame.height}`"
    role="img"
    :aria-label="`Plan von ${ship.name}`"
    @click="emit('pick', null)"
  >
    <polygon
      :points="outline"
      :fill="SCENE.crane"
      fill-opacity="0.16"
      :stroke="SCENE.crane"
      stroke-opacity="0.8"
      stroke-width="1"
    />

    <!-- The accommodation block aft, so the drawing reads bow-forward without a label. -->
    <rect
      :x="bridge.spot.x - bridge.along / 2"
      :y="bridge.spot.y - bridge.across / 2"
      :width="bridge.along"
      :height="bridge.across"
      :fill="SCENE.crane"
      fill-opacity="0.34"
      :stroke="SCENE.crane"
      stroke-opacity="0.7"
      stroke-width="0.8"
    />

    <!-- What is met, aboard. -->
    <g v-for="box in cargo" :key="`an-${box.quest.id}`">
      <rect
        class="cursor-pointer"
        :x="box.spot.x - box.along / 2"
        :y="box.spot.y - box.across / 2"
        :width="box.along"
        :height="box.across"
        :fill="VERDICT_COLOR[box.quest.verdict]"
        :fill-opacity="fillFor(box.quest.verdict)"
        :stroke="VERDICT_COLOR[box.quest.verdict]"
        stroke-width="0.8"
        @click.stop="emit('pick', { kind: 'quest', id: box.quest.id })"
      >
        <title>{{ box.quest.id }} — {{ VERDICT_LABEL[box.quest.verdict] }}</title>
      </rect>
    </g>

    <!-- What is owed, on the planking. -->
    <g v-for="box in landed" :key="`ab-${box.quest.id}`">
      <rect
        class="cursor-pointer"
        :x="box.spot.x - box.along / 2"
        :y="box.spot.y - box.across / 2"
        :width="box.along"
        :height="box.across"
        :fill="VERDICT_COLOR[box.quest.verdict]"
        :fill-opacity="fillFor(box.quest.verdict)"
        :stroke="VERDICT_COLOR[box.quest.verdict]"
        stroke-width="0.8"
        @click.stop="emit('pick', { kind: 'quest', id: box.quest.id })"
      >
        <title>{{ box.quest.id }} — {{ VERDICT_LABEL[box.quest.verdict] }}</title>
      </rect>
    </g>

    <!-- The repository's own state: crates, a flag, damage, boats. Targets, like everything else. -->
    <g v-for="(box, index) in marks" :key="`mk-${String(index)}`">
      <rect
        class="cursor-pointer"
        :x="box.spot.x - box.along / 2"
        :y="box.spot.y - box.across / 2"
        :width="box.along"
        :height="box.across"
        :fill="MARK_COLOR[box.kind]"
        :fill-opacity="box.kind === 'untracked' || box.kind === 'tender' ? 0.12 : 0.7"
        :stroke="MARK_COLOR[box.kind]"
        stroke-width="0.8"
        @click.stop="emit('pick', { kind: 'mark', mark: box.kind })"
      >
        <title>{{ MARK_LABEL[box.kind] }} — {{ MARK_MEANING[box.kind] }}</title>
      </rect>
    </g>

    <!--
      The marking, drawn last so nothing overlaps it, and never a target itself: a click has to
      reach the box underneath, or letting go of a choice would be impossible where it was made.
    -->
    <rect
      v-for="(ring, index) in lit"
      :key="`ring-${String(index)}`"
      class="pointer-events-none"
      :x="ring.x"
      :y="ring.y"
      :width="ring.width"
      :height="ring.height"
      fill="none"
      :stroke="SCENE.accent"
      stroke-width="1.5"
      rx="0.25"
    />
  </svg>
</template>
