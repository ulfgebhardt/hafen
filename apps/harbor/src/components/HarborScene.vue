<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

  import { mountScene } from './scene'

  import type { Layout } from './band'
  import type { Chosen } from './chosen'
  import type { Scene } from './scene'
  import type { Hold } from './viewport'
  import type { ForgeStats, Ship } from '@hafen/core'

  const {
    ships,
    forge = new Map(),
    layout = 'lanes',
    centre = null,
    hold = null,
    found = [],
  } = defineProps<{
    ships: readonly Ship[]
    /**
     * A ship to put in the middle of the window once the harbour is drawn.
     *
     * For the moment a reader changes pages: this component is keyed on the page, so a switch
     * builds a new drawing, and the ship they were reading about would be somewhere in it.
     */
    centre?: Ship | null
    /**
     * Where that ship stood on the page before, in pixels.
     *
     * Handed in because this component is keyed on the page: the drawing she was in is gone by
     * the time this one is built, so the place she occupied has to survive outside both.
     */
    hold?: Hold | null
    /**
     * The ships a search found — marked in the drawing, never filtered out of it.
     *
     * A search that rebuilt the harbour out of three ships answered "what matched" and threw away
     * the question a drawing exists for: *where* they are.
     */
    found?: readonly Ship[]
    /** Which harbour to draw: docks packed in lanes, or one ring per project. */
    layout?: Layout
    /**
     * What the forges said, by ship path.
     *
     * Handed in beside the snapshot and never merged into it: the two readings have different
     * ages, and folding one into the other would give the older figure the younger timestamp.
     * The drawing uses it for the size and for the lit windows — a ship whose stars were never
     * asked for is dark, which is exactly what that means.
     */
    forge?: ReadonlyMap<string, ForgeStats>
  }>()

  /**
   * Two models, because hovering and clicking are different acts.
   *
   * `hovered` is looking; `picked` is deciding, and it stays until something else is decided.
   * One model for both made the datasheet unreadable: every hull the pointer crossed on the way
   * to it replaced what was being read.
   */
  const hovered = defineModel<Ship | null>('hovered', { required: true })
  const picked = defineModel<Ship | null>('picked', { required: true })
  /**
   * The demand whose box was clicked, where a box was.
   *
   * Beside `picked` and not inside it: a click on a container is a question about that demand, and
   * one on bare deck is a question about the ship. Folding the two would make "this ship" and
   * "this ship, this demand" the same answer.
   */
  const demand = defineModel<Chosen | null>('quest', { required: false, default: null })

  const canvas = ref<HTMLCanvasElement | null>(null)
  let scene: Scene | null = null

  onMounted(async () => {
    if (canvas.value === null) {
      return
    }
    scene = await mountScene(canvas.value)
    scene.onHover((ship) => {
      hovered.value = ship
    })
    scene.onSelect((ship, chosen) => {
      picked.value = ship
      demand.value = chosen
    })
    scene.draw(ships, forge, layout)
    scene.highlight(picked.value, demand.value)
    scene.focus(centre, hold)
    scene.mark(found)
  })

  // Redrawn rather than diffed: a snapshot is replaced whole, and a basin of a hundred hulls
  // rebuilds in a frame. Diffing would be a second model of what is already on screen.
  watch(
    () => [ships, forge, layout] as const,
    ([next, stats, kind]) => {
      /*
       * Where she stands *now*, asked before the redraw throws it away. `hold` is what the page
       * switch that mounted this drawing carried, and after a measurement on the same page it
       * put her back where she had been minutes and several zooms ago.
       */
      const here = scene?.where(centre) ?? hold
      scene?.draw(next, stats, kind)
      scene?.highlight(picked.value, demand.value)
      scene?.focus(centre, here)
    },
  )

  // The chosen ship is marked in the scene, not only in the sheet: a panel that says "this one"
  // while the drawing says nothing leaves the reader to find it again by hand.
  // One watcher for both: the drawing marks a ship *and* one of her boxes, and the two are set in
  // the same breath — a watcher each would light the hull one tick before the box.
  watch([picked, demand], ([ship, quest]) => {
    scene?.highlight(ship, quest)
  })

  // Typing is not a redraw: the same harbour, with the matches ringed and the view moved to hold
  // them. Watched on its own so a search costs nothing but a ring and a pan.
  watch(
    () => found,
    (ships) => {
      scene?.mark(ships)
    },
  )

  /** Where a ship stands right now — asked by the page before it swaps the drawing out. */
  defineExpose({
    where: (ship: Ship | null): Hold | null => scene?.where(ship) ?? null,
  })

  onBeforeUnmount(() => {
    scene?.destroy()
    scene = null
  })
</script>

<template>
  <div class="relative h-full w-full overflow-hidden">
    <canvas ref="canvas" class="block h-full w-full" />
  </div>
</template>
