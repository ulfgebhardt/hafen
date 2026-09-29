<script setup lang="ts">
  import { computed } from 'vue'

  import { bindingQuests, countVerdicts } from './fleet'
  import { VERDICT_COLOR, VERDICT_LABEL, VERDICT_ORDER } from './theme'

  import type { Ship } from '@hafen/core'

  const { ships, at, source } = defineProps<{
    ships: readonly Ship[]
    at: string
    /** Where this picture came from — a cache path in the app, a URL in a browser. */
    source: string
  }>()

  const counts = computed(() => countVerdicts(ships))
  const bound = computed(() => ships.filter((ship) => bindingQuests(ship).length > 0).length)

  /**
   * The time the measurement was taken, and not "now".
   *
   * Said out loud because the app does not measure — it reads a snapshot. A picture without its
   * timestamp claims to be current, and this one is exactly as old as the last `schnappschuss`.
   */
  const taken = computed(() => new Date(at).toLocaleString('de-DE'))
</script>

<template>
  <header class="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-slate-800 px-4 py-2">
    <h1 class="font-mono text-sm tracking-widest text-slate-200 uppercase">Hafen</h1>
    <p class="font-mono text-xs text-slate-400">{{ ships.length }} Schiffe</p>

    <ul class="flex flex-wrap gap-x-4 gap-y-1">
      <li
        v-for="verdict in VERDICT_ORDER"
        :key="verdict"
        class="flex items-baseline gap-1.5 font-mono text-xs"
      >
        <span
          class="inline-block h-2 w-3 shrink-0 translate-y-px border"
          :style="{
            borderColor: VERDICT_COLOR[verdict],
            backgroundColor: verdict === 'met' ? VERDICT_COLOR[verdict] : 'transparent',
          }"
        />
        <span class="text-slate-300">{{ counts.get(verdict) ?? 0 }}</span>
        <span class="text-slate-600">{{ VERDICT_LABEL[verdict] }}</span>
      </li>
    </ul>

    <p class="font-mono text-xs text-slate-500">{{ bound }} gebunden</p>
    <p class="ml-auto font-mono text-[10px] text-slate-600" :title="source">gemessen {{ taken }}</p>
  </header>
</template>
