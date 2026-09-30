<script setup lang="ts">
  import { fleetPoints, projectPoints } from '@hafen/core'
  import { computed } from 'vue'

  import { bindingQuests, countVerdicts } from './fleet'
  import PointValue from './PointValue.vue'
  import { VERDICT_COLOR, VERDICT_LABEL, VERDICT_ORDER } from './theme'

  import type { Ship } from '@hafen/core'

  const {
    ships,
    at,
    source,
    canMeasure = false,
    busy = false,
  } = defineProps<{
    ships: readonly Ship[]
    at: string
    /** Where this picture came from — a cache path in the app, a URL in a browser. */
    source: string
    /** Whether this window has a shell to measure with. False in a browser. */
    canMeasure?: boolean
    busy?: boolean
  }>()

  const emit = defineEmits<{ measure: [] }>()

  const counts = computed(() => countVerdicts(ships))

  /**
   * Two scores, side by side and never added.
   *
   * The project total describes the repositories; the personal one describes what this person
   * did with them. Adding them would let whoever stands nearest the biggest shared project claim
   * its history.
   */
  const mine = computed(() => fleetPoints(ships))
  const fleet = computed(() => projectPoints(ships))
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

    <p
      :title="`${mine.active} Projekte aktiv · ${mine.clean} von ${mine.fleet} Bäumen sauber · ${mine.met} von ${mine.binding} Quests erfüllt`"
    >
      <PointValue :project="fleet" :personal="mine.total" />
    </p>
    <p class="ml-auto font-mono text-[10px] text-slate-600" :title="source">gemessen {{ taken }}</p>

    <!--
      The one button that starts a measurement, and it is beside the timestamp on purpose: the
      figure it makes stale is right there, so "wie alt ist das" and "nochmal messen" are one
      glance apart. Hidden where there is nothing to run — a button that fails in the click is
      worse than no button.
    -->
    <button
      v-if="canMeasure"
      class="font-mono text-[10px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline disabled:text-slate-700 disabled:no-underline"
      :disabled="busy"
      :title="`Alle ${ships.length} Repositories neu messen`"
      @click="emit('measure')"
    >
      {{ busy ? 'misst …' : 'neu messen' }}
    </button>
  </header>
</template>
