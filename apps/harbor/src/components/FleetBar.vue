<script setup lang="ts">
  import { fleetLines, fleetPoints, projectPoints } from '@hafen/core'
  import { computed, ref } from 'vue'

  import { bindingQuests, countVerdicts } from './fleet'
  import { readingOf, shareOf } from './measuring'
  import PointValue from './PointValue.vue'
  import { VERDICT_COLOR, VERDICT_LABEL, VERDICT_ORDER } from './theme'

  import type { Progress } from './measuring'
  import type { RootRow } from './roots'
  import type { Ship } from '@hafen/core'

  const {
    ships,
    at,
    source,
    canMeasure = false,
    busy = false,
    forgeAt = '',
    progress = null,
    roots = [],
    fixed = false,
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
    /** Where the survey looks, each with what was found under it. */
    roots?: readonly RootRow[]
    /** Whether they come from `$HAFEN_ROOT`, which leads — and then the list is not editable. */
    fixed?: boolean
  }>()

  const emit = defineEmits<{ measure: []; add: []; drop: [string]; forge: []; stop: [] }>()

  /**
   * The roots, closed until asked for.
   *
   * What is already searched comes before the dialog that adds another, so a root is not added
   * twice and a dead one is seen where it can be dropped. Closed after each choice: both start a
   * survey, and the list it shows would be stale until that is done.
   */
  const rooting = ref(false)
  const add = (): void => {
    rooting.value = false
    emit('add')
  }
  const drop = (path: string): void => {
    rooting.value = false
    emit('drop', path)
  }

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
    <h1 class="font-mono text-sm tracking-widest text-ink-strong uppercase">Hafen</h1>
    <p class="font-mono text-xs text-ink-muted">{{ ships.length }} Schiffe</p>

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
        <span class="text-ink">{{ counts.get(verdict) ?? 0 }}</span>
        <span class="text-ink-faint">{{ VERDICT_LABEL[verdict] }}</span>
      </li>
    </ul>

    <p class="font-mono text-xs text-ink-muted">{{ bound }} gebunden</p>

    <p :title="bill">
      <PointValue :project="fleet" :personal="mine.total" />
    </p>
    <!--
      The age of the *whole* fleet, and a single reading beside it rather than over it.
      Measuring one repository used to stamp the other ninety-one with a minute they were not read
      in, which is the one lie a timestamp exists to prevent.
    -->
    <p class="ml-auto font-mono text-[11px] text-ink-faint" :title="source">
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
      class="font-mono text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
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
      <span class="font-mono text-[11px] whitespace-nowrap text-ink-muted">
        <template v-if="progress !== null && progress.of > 0"
          >{{ progress.at }}/{{ progress.of }}</template
        >
        <template v-else>zählt …</template>
      </span>
      <span class="max-w-48 truncate font-mono text-[11px] text-ink-faint" :title="progress?.path">
        {{ reading }}
      </span>
      <button
        class="font-mono text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
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
      class="font-mono text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:text-ink-off disabled:no-underline"
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
      Where the survey looks, and the way to change it. A dead root is the one that matters most:
      it fails every survey on purpose, and this list is the remedy for that error.
    -->
    <span v-if="canMeasure" class="relative" @keyup.escape="rooting = false">
      <button
        class="font-mono text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        :aria-expanded="rooting"
        title="Wo der Hafen nach Git-Repositories sucht"
        @click="rooting = !rooting"
      >
        Wurzeln ({{ roots.length }}) {{ rooting ? '▴' : '▾' }}
      </button>
      <div
        v-if="rooting"
        class="absolute top-full right-0 z-10 mt-1 w-96 max-w-[90vw] border border-slate-700 bg-slate-950 p-2 font-mono text-[11px] shadow-lg"
      >
        <ul>
          <li v-for="root in roots" :key="root.path" class="flex items-baseline gap-2 py-0.5">
            <span class="min-w-0 flex-1 truncate text-ink" :title="root.path">
              {{ root.path }}
            </span>
            <span v-if="root.ships === null" class="whitespace-nowrap text-red-400">
              nicht gefunden
            </span>
            <span v-else class="whitespace-nowrap text-ink-muted">{{ root.ships }} Schiffe</span>
            <button
              v-if="!fixed"
              class="text-ink-faint hover:text-ink disabled:text-ink-off"
              :disabled="busy"
              :aria-label="`${root.path} entfernen`"
              :title="`${root.path} nicht mehr durchsuchen — die Repositories bleiben, wo sie sind`"
              @click="drop(root.path)"
            >
              ×
            </button>
          </li>
        </ul>
        <!--
          Said rather than silently ignored: with the variable set, an entry added here would land
          in the register and do nothing until it is unset.
        -->
        <p v-if="fixed" class="mt-1 text-ink-faint">
          $HAFEN_ROOT ist gesetzt und geht vor — das Register wird erst ohne sie gelesen.
        </p>
        <button
          v-else
          class="mt-1 text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:text-ink-off disabled:no-underline"
          :disabled="busy"
          title="Einen Ordner wählen, unter dem nach Git-Repositories gesucht wird"
          @click="add"
        >
          + hinzufügen
        </button>
      </div>
    </span>
  </header>
</template>
