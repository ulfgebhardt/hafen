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

  import { VERDICT_COLOR, VERDICT_LABEL, SCENE, SEGMENT } from './theme'
  import { bridgeOf, cargoOf, hullOf, landedOf } from './vessel'

  import type { Ship } from '@hafen/core'

  const { ship, chosen = null } = defineProps<{
    ship: Ship
    /** The demand whose box is lit, wherever it stands. */
    chosen?: string | null
  }>()

  const emit = defineEmits<{ pick: [string | null] }>()

  const hull = computed(() => hullOf(ship, shipPoints(ship).project))
  const cargo = computed(() => cargoOf(ship, hull.value))
  const landed = computed(() => landedOf(ship))
  const bridge = computed(() => bridgeOf(ship, hull.value))

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
    const tops = landed.value.map((box) => box.spot.y - box.across / 2)
    const top = Math.min(-half, ...tops) - 1
    return {
      x: -2,
      y: top,
      width: hull.value.length + 4,
      height: half + 1 - top,
    }
  })

  const outline = computed(() =>
    hull.value.outline.map((point) => `${String(point.x)},${String(point.y)}`).join(' '),
  )

  /** A filled box reads as done, a hatched one as failing — the same forms the harbour uses. */
  const fillFor = (verdict: keyof typeof VERDICT_COLOR): number =>
    Math.max(SEGMENT[verdict].opacity, 0.22)
</script>

<template>
  <!--
    `pointer-events` on the boxes only: a click on open water clears the choice, the same as in
    the harbour, and the hull itself is not a target because "this ship" is already answered by
    the sheet the drawing sits in.
  -->
  <svg
    class="block w-full"
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
      stroke-width="0.25"
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
      stroke-width="0.15"
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
        :stroke="box.quest.id === chosen ? SCENE.accent : VERDICT_COLOR[box.quest.verdict]"
        :stroke-width="box.quest.id === chosen ? 0.45 : 0.15"
        @click.stop="emit('pick', box.quest.id)"
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
        :stroke="box.quest.id === chosen ? SCENE.accent : VERDICT_COLOR[box.quest.verdict]"
        :stroke-width="box.quest.id === chosen ? 0.45 : 0.15"
        @click.stop="emit('pick', box.quest.id)"
      >
        <title>{{ box.quest.id }} — {{ VERDICT_LABEL[box.quest.verdict] }}</title>
      </rect>
    </g>
  </svg>
</template>
