<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

  import { mountScene } from './scene'

  import type { Scene } from './scene'
  import type { Ship } from '@hafen/core'

  const { ships } = defineProps<{ ships: readonly Ship[] }>()
  const picked = defineModel<Ship | null>('picked', { required: true })

  const canvas = ref<HTMLCanvasElement | null>(null)
  let scene: Scene | null = null

  onMounted(async () => {
    if (canvas.value === null) {
      return
    }
    scene = await mountScene(canvas.value)
    scene.onPick((ship) => {
      picked.value = ship
    })
    scene.draw(ships)
  })

  // Redrawn rather than diffed: a snapshot is replaced whole, and a scene of ninety-one hulls
  // rebuilds in a frame. Diffing would be a second model of what is already on screen.
  watch(
    () => ships,
    (next) => {
      scene?.draw(next)
    },
  )

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
