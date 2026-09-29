<script setup lang="ts">
  import { onMounted, ref } from 'vue'

  import FleetBar from './components/FleetBar.vue'
  import HarborScene from './components/HarborScene.vue'
  import ShipSheet from './components/ShipSheet.vue'
  import { loadSnapshot, SnapshotError } from './snapshot'

  import type { Snapshot } from './snapshot'
  import type { Ship } from '@hafen/core'

  const snapshot = ref<Snapshot | null>(null)
  const source = ref<string>('')
  const failed = ref<SnapshotError | null>(null)
  const picked = ref<Ship | null>(null)

  onMounted(async () => {
    try {
      const loaded = await loadSnapshot()
      snapshot.value = loaded.snapshot
      source.value = loaded.source
    } catch (error) {
      /**
       * Named, never blank. An empty harbor and a snapshot that could not be read are different
       * sentences, and a window that shows nothing for both lies about the one a human could
       * have fixed — so the message carries where it looked and what to type.
       */
      failed.value =
        error instanceof SnapshotError
          ? error
          : new SnapshotError(String(error), '(unbekannt)', 'hafen schnappschuss')
    }
  })
</script>

<template>
  <div class="flex h-screen w-screen flex-col bg-slate-950 text-slate-300">
    <template v-if="snapshot !== null">
      <FleetBar :ships="snapshot.ships" :at="snapshot.at" :source="source" />

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

    <section v-else-if="failed !== null" class="p-6 font-mono text-sm">
      <p class="text-red-400">Kein Schnappschuss: {{ failed.message }}</p>
      <p class="mt-2 text-slate-500">Gesucht in {{ failed.source }}</p>
      <p class="mt-4 text-slate-400">Erzeugen mit:</p>
      <p class="mt-1 text-slate-300">{{ failed.remedy }}</p>
    </section>

    <p v-else class="p-6 text-sm text-slate-600">wird gelesen …</p>
  </div>
</template>
