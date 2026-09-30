<script setup lang="ts">
  import { computed } from 'vue'

  import { BAND_LABEL, BAND_MEANING, bandPoints, BANDS, byBand } from './band'
  import PointValue from './PointValue.vue'

  import type { Band } from './band'
  import type { Ship } from '@hafen/core'

  const { ships } = defineProps<{ ships: readonly Ship[] }>()
  const band = defineModel<Band>('band', { required: true })

  const grouped = computed(() => byBand(ships))
  const scores = computed(() =>
    Object.fromEntries(BANDS.map((name) => [name, bandPoints(grouped.value[name])])),
  )
</script>

<template>
  <!--
    Every band is offered, including the empty ones: a tab that disappears when it has nothing in
    it is a tab nobody finds again, and "no archived repositories" is an answer worth being able
    to read.
  -->
  <nav class="flex gap-px border-b border-slate-800 bg-slate-950 px-2">
    <button
      v-for="name in BANDS"
      :key="name"
      class="group px-3 py-1.5 text-left"
      :class="
        band === name
          ? 'border-b-2 border-slate-300 text-slate-100'
          : 'border-b-2 border-transparent text-slate-500 hover:text-slate-300'
      "
      :aria-current="band === name ? 'page' : undefined"
      :title="BAND_MEANING[name]"
      @click="band = name"
    >
      <span class="font-mono text-xs tracking-wide">{{ BAND_LABEL[name] }}</span>
      <span class="ml-1.5 font-mono text-[10px] text-slate-600">{{ grouped[name].length }}</span>

      <!--
        What the page is worth, under its own name. The header's figure is the whole machine and
        answers a different question — a fleet whose points are nearly all archived is not the same
        fleet as one whose points are all active, and from the tabs alone the two looked identical.
      -->
      <PointValue
        class="ml-1.5 scale-90 opacity-70"
        :project="scores[name]?.project ?? 0"
        :personal="scores[name]?.own ?? 0"
      />
    </button>

    <p class="ml-auto self-center pr-1 font-mono text-[10px] text-slate-600">
      {{ BAND_MEANING[band] }}
    </p>
  </nav>
</template>
