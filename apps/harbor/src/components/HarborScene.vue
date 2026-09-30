<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

  import { mountScene } from './scene'

  import type { Scene } from './scene'
  import type { Ship } from '@hafen/core'

  const { ships } = defineProps<{ ships: readonly Ship[] }>()

  /**
   * Two models, because hovering and clicking are different acts.
   *
   * `hovered` is looking; `picked` is deciding, and it stays until something else is decided.
   * One model for both made the datasheet unreadable: every hull the pointer crossed on the way
   * to it replaced what was being read.
   */
  const hovered = defineModel<Ship | null>('hovered', { required: true })
  const picked = defineModel<Ship | null>('picked', { required: true })

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
    scene.onSelect((ship) => {
      picked.value = ship
    })
    scene.draw(ships)
    scene.highlight(picked.value)
  })

  // Redrawn rather than diffed: a snapshot is replaced whole, and a basin of a hundred hulls
  // rebuilds in a frame. Diffing would be a second model of what is already on screen.
  watch(
    () => ships,
    (next) => {
      scene?.draw(next)
      scene?.highlight(picked.value)
    },
  )

  // The chosen ship is marked in the scene, not only in the sheet: a panel that says "this one"
  // while the drawing says nothing leaves the reader to find it again by hand.
  watch(picked, (ship) => {
    scene?.highlight(ship)
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
