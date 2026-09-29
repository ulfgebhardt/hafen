<script setup lang="ts">
  import { onMounted, ref } from 'vue'

  import FleetBar from './components/FleetBar.vue'
  import HarborScene from './components/HarborScene.vue'
  import ShipSheet from './components/ShipSheet.vue'

  import type { Ship } from '@hafen/core'

  /** What `hafen schnappschuss` writes. The app reads it and measures nothing itself. */
  interface Snapshot {
    at: string
    root: string
    ships: readonly Ship[]
  }

  const snapshot = ref<Snapshot | null>(null)
  const failed = ref<string | null>(null)
  const picked = ref<Ship | null>(null)

  onMounted(async () => {
    try {
      const response = await fetch('snapshot.json')
      if (!response.ok) {
        throw new Error(`${String(response.status)} ${response.statusText}`)
      }
      snapshot.value = (await response.json()) as Snapshot
    } catch (error) {
      // Named rather than left blank: an empty harbor and a failed read are different sentences,
      // and a window that shows nothing for both is a window that lies about one of them.
      failed.value = String(error)
    }
  })
</script>

<template>
  <div class="flex h-screen w-screen flex-col bg-slate-950 text-slate-300">
    <template v-if="snapshot !== null">
      <FleetBar :ships="snapshot.ships" :at="snapshot.at" />

      <div class="flex min-h-0 flex-1">
        <main class="min-w-0 flex-1">
          <HarborScene v-model:picked="picked" :ships="snapshot.ships" />
        </main>

        <aside class="w-96 shrink-0 border-l border-slate-800">
          <ShipSheet v-if="picked !== null" :ship="picked" />
          <p v-else class="px-4 py-6 text-sm text-slate-600">
            Ein Schiff anfahren, um sein Datenblatt zu lesen.
          </p>
        </aside>
      </div>
    </template>

    <p v-else-if="failed !== null" class="p-6 font-mono text-sm text-red-400">
      snapshot.json nicht lesbar: {{ failed }}<br />
      <span class="text-slate-500">Erzeugen mit: pnpm --filter @hafen/harbor snapshot</span>
    </p>
    <p v-else class="p-6 text-sm text-slate-600">wird gelesen …</p>
  </div>
</template>
