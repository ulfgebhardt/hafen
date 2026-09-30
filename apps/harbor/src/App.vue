<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'

  import { byBand, firstBand } from './components/band'
  import BandTabs from './components/BandTabs.vue'
  import FleetBar from './components/FleetBar.vue'
  import HarborScene from './components/HarborScene.vue'
  import ShipSheet from './components/ShipSheet.vue'
  import { loadSnapshot, SnapshotError } from './snapshot'

  import type { Band } from './components/band'
  import type { Snapshot } from './snapshot'
  import type { Ship } from '@hafen/core'

  const snapshot = ref<Snapshot | null>(null)
  const source = ref<string>('')
  const failed = ref<SnapshotError | null>(null)
  /**
   * What the sheet shows: what was clicked, or failing that what the pointer is over.
   *
   * A pinned ship wins over a hovered one and keeps winning until something else is clicked or a
   * click lands on open water. Reading a datasheet used to be impossible — every hull crossed on
   * the way to it replaced the text.
   */
  const picked = ref<Ship | null>(null)
  const hovered = ref<Ship | null>(null)
  const sheet = computed(() => picked.value ?? hovered.value)

  /**
   * Which page is open, and what is on it.
   *
   * Ninety hulls on one sheet answered "what is the fleet like" and nothing else. The question in
   * front of a person is about the handful they are working on, so the active ones get the page —
   * and the opening band is the first one with anything in it, because an empty page that has to
   * be clicked away is the kind of thing a tool does once.
   */
  const band = ref<Band>('active')
  const shown = computed(() =>
    snapshot.value === null ? [] : byBand(snapshot.value.ships)[band.value],
  )

  onMounted(async () => {
    try {
      const loaded = await loadSnapshot()
      snapshot.value = loaded.snapshot
      source.value = loaded.source
      band.value = firstBand(loaded.snapshot.ships)
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
      <BandTabs v-model:band="band" :ships="snapshot.ships" />

      <div class="flex min-h-0 flex-1">
        <main class="min-w-0 flex-1">
          <!-- Keyed on the band: a new page is a new drawing, not the old one panned. -->
          <HarborScene
            :key="band"
            v-model:picked="picked"
            v-model:hovered="hovered"
            :ships="shown"
          />
        </main>

        <aside class="w-96 shrink-0 border-l border-slate-800">
          <ShipSheet v-if="sheet !== null" :ship="sheet" :pinned="picked !== null" />
          <p v-else class="px-4 py-6 text-sm text-slate-600">
            Ein Schiff anfahren, um sein Datenblatt zu lesen — anklicken hält es fest.
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
