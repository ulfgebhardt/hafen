<script setup lang="ts">
  import { computed } from 'vue'

  import { BAND_LABEL, BAND_MEANING, bandPoints, BANDS, byBand } from './band'
  import PointValue from './PointValue.vue'

  import type { Band } from './band'
  import type { Ship } from '@hafen/core'

  const { ships } = defineProps<{ ships: readonly Ship[] }>()
  const band = defineModel<Band>('band', { required: true })

  /**
   * What is typed into the filter.
   *
   * On the band bar rather than in the header, because it is about which ships are listed. The
   * counts beside each tab count what came in, and what comes in is already filtered: a filter
   * that leaves three ships and a tab that still says 41 is a window disagreeing with itself.
   */
  const query = defineModel<string>('query', { default: '' })

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

    <p class="ml-auto self-center pr-3 font-mono text-[10px] text-slate-600">
      {{ BAND_MEANING[band] }}
    </p>

    <!--
      A field and never a dropdown: ninety repositories have no shared axis to pick from, and the
      one thing somebody has in mind is a word out of the name or the path.
    -->
    <span class="flex items-center gap-1 self-center pr-1">
      <input
        v-model="query"
        type="search"
        class="w-48 border-b border-slate-700 bg-transparent py-0.5 font-mono text-[11px] text-slate-300 outline-none focus:border-slate-500 placeholder:text-slate-700"
        placeholder="suchen …"
        aria-label="Schiffe filtern"
        @keyup.escape="query = ''"
      />
      <button
        v-if="query !== ''"
        class="font-mono text-[10px] text-slate-600 hover:text-slate-300"
        title="Filter aufheben"
        @click="query = ''"
      >
        ×
      </button>
    </span>
  </nav>
</template>
