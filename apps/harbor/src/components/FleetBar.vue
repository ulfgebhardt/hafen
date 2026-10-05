<script setup lang="ts">
  import { fleetLines, fleetPoints, projectPoints } from '@hafen/core'
  import { computed } from 'vue'

  import { bindingQuests, countVerdicts } from './fleet'
  import { readingOf, shareOf } from './measuring'
  import PointValue from './PointValue.vue'
  import { VERDICT_COLOR, VERDICT_LABEL, VERDICT_ORDER } from './theme'

  import type { Progress } from './measuring'
  import type { Ship } from '@hafen/core'

  const {
    ships,
    at,
    source,
    canMeasure = false,
    busy = false,
    forgeAt = '',
    progress = null,
  } = defineProps<{
    ships: readonly Ship[]
    at: string
    /** Where this picture came from — a cache path in the app, a URL in a browser. */
    source: string
    /** Whether this window has a shell to measure with. False in a browser. */
    canMeasure?: boolean
    busy?: boolean
    /** When the forges were last asked. Its own age, beside its own button. */
    forgeAt?: string
    /** How far a running survey has got, or `null` where none is running. */
    progress?: Progress | null
  }>()

  const emit = defineEmits<{ measure: []; add: []; forge: []; stop: [] }>()

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
  /**
   * The personal figure, worked out where it is shown.
   *
   * The band tabs add up to the first line only, and the header is the sum of all four — 23 779
   * against 20 767 with nothing saying why was a figure that looked wrong while being right.
   */
  const bill = computed(() => {
    const number = (value: number): string => value.toLocaleString('de-DE')
    const lines = fleetLines(mine.value).map(
      (line) => `${line.name}: ${number(line.points)} (${line.detail})`,
    )
    return [...lines, `deine Punkte: ${number(mine.value.total)}`].join('\n')
  })
  const bound = computed(() => ships.filter((ship) => bindingQuests(ship).length > 0).length)

  /**
   * The time the measurement was taken, and not "now".
   *
   * Said out loud because the app does not measure — it reads a snapshot. A picture without its
   * timestamp claims to be current, and this one is exactly as old as the last `schnappschuss`.
   */
  const taken = computed(() => new Date(at).toLocaleString('de-DE'))

  // Both readings of it live in `measuring.ts`, where a test can hold them.
  const share = computed(() => shareOf(progress))
  const reading = computed(() => readingOf(progress))
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

    <p :title="bill">
      <PointValue :project="fleet" :personal="mine.total" />
    </p>
    <!--
      The age of the *whole* fleet, and a single reading beside it rather than over it.
      Measuring one repository used to stamp the other ninety-one with a minute they were not read
      in, which is the one lie a timestamp exists to prevent.
    -->
    <p class="ml-auto font-mono text-[10px] text-slate-600" :title="source">
      vollständig gemessen {{ taken }}
    </p>

    <!--
      The one button that starts a measurement, and it is beside the timestamp on purpose: the
      figure it makes stale is right there, so "wie alt ist das" and "nochmal messen" are one
      glance apart. Hidden where there is nothing to run — a button that fails in the click is
      worse than no button.
    -->
    <button
      v-if="canMeasure && !busy"
      class="font-mono text-[10px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
      :title="`Alle ${ships.length} Repositories neu messen`"
      @click="emit('measure')"
    >
      neu messen
    </button>

    <!--
      While it runs: how far, what it is on, and a way out.
      It said "misst …" for six seconds and froze the window while it did — the command ran on the
      main thread. It no longer does, and now the bar can say which repository is being read. The
      count comes from the survey itself rather than from the last snapshot: the first survey of a
      machine, and the one after a clone, are exactly when a guessed denominator is wrong.
    -->
    <span v-else-if="canMeasure" class="flex min-w-64 items-center gap-2">
      <span class="h-1 min-w-24 flex-1 bg-slate-800">
        <span
          class="block h-full bg-sky-500/70 transition-[width] duration-200"
          :class="share === null ? 'w-1/3 animate-pulse' : ''"
          :style="share === null ? undefined : { width: `${String(Math.round(share * 100))}%` }"
        />
      </span>
      <span class="font-mono text-[10px] whitespace-nowrap text-slate-500">
        <template v-if="progress !== null && progress.of > 0"
          >{{ progress.at }}/{{ progress.of }}</template
        >
        <template v-else>zählt …</template>
      </span>
      <span class="max-w-48 truncate font-mono text-[10px] text-slate-600" :title="progress?.path">
        {{ reading }}
      </span>
      <button
        class="font-mono text-[10px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
        title="Messung abbrechen — der Cache behält die letzte vollständige"
        @click="emit('stop')"
      >
        abbrechen
      </button>
    </span>

    <!--
      The forge reading's own age and its own button, beside each other.
      It is a different measurement of a different thing at a different time: the survey reads this
      disk, this one asks somebody else's server. One timestamp for both would be a lie about
      whichever of them is older.
    -->
    <button
      v-if="canMeasure"
      class="font-mono text-[10px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline disabled:text-slate-700 disabled:no-underline"
      :disabled="busy"
      :title="
        forgeAt === ''
          ? 'GitHub und Gitea fragen — lesend, dauert etwa 20 Sekunden'
          : `Zuletzt gefragt ${new Date(forgeAt).toLocaleString('de-DE')}`
      "
      @click="emit('forge')"
    >
      {{ forgeAt === '' ? 'Forge fragen' : 'Forge neu fragen' }}
    </button>

    <!--
      Another place to look, picked rather than typed — the same native dialog the first run asks
      with, and the same answer: a root, searched for repositories. A repository picked by itself is
      a root too, since the search stops at the first `.git` and that is the root's own.
    -->
    <button
      v-if="canMeasure"
      class="font-mono text-[10px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline disabled:text-slate-700 disabled:no-underline"
      :disabled="busy"
      title="Einen Ordner wählen, unter dem nach Git-Repositories gesucht wird"
      @click="emit('add')"
    >
      hinzufügen
    </button>
  </header>
</template>
