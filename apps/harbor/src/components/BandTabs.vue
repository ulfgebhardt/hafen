<script setup lang="ts">
  import { computed } from 'vue'

  import { BAND_LABEL, BAND_MEANING, BANDS, byBand } from './band'

  import type { Band } from './band'
  import type { Ship } from '@hafen/core'

  const { ships } = defineProps<{ ships: readonly Ship[] }>()
  const band = defineModel<Band>('band', { required: true })

  const grouped = computed(() => byBand(ships))
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
    </button>

    <p class="ml-auto self-center pr-1 font-mono text-[10px] text-slate-600">
      {{ BAND_MEANING[band] }}
    </p>
  </nav>
</template>
