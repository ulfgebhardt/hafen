<script setup lang="ts">
  /**
   * What the forge says about this repository, and a way to go and look.
   *
   * Its own reading with its own age: the survey is six seconds of disk, this is seventeen of
   * network, so the two are never the same age and the panel says both. Folding them into one
   * number would give the older figure the younger timestamp, which is the one lie a timestamp
   * exists to prevent.
   *
   * Every figure is a link to the page it came from. Nothing here is a number to take on faith —
   * the same rule the quest evidence follows, one click further away.
   */

  import { forgeLinks } from '@hafen/core'
  import { computed } from 'vue'

  import { isForge } from './chosen'
  import { SCENE } from './theme'

  import type { Chosen } from './chosen'
  import type { ForgeStats } from '@hafen/core'

  const {
    stats,
    at = '',
    chosen = null,
  } = defineProps<{
    stats: ForgeStats
    at?: string
    /** What was pointed at on the ship — so the row that matches a chosen heap can say so. */
    chosen?: Chosen | null
  }>()

  const emit = defineEmits<{ open: [string] }>()

  const links = computed(() => forgeLinks(stats.slug))

  /**
   * Issues and pull requests apart, and that is the reason for the GraphQL query.
   *
   * GitHub's REST `open_issues_count` counts both in one number: Leuchtturm would report 495
   * where it has 442 issues and 53 pull requests. A figure that is sometimes the sum of two things
   * is worse than no figure.
   */
  const figures = computed(() => [
    { name: 'Sterne', value: stats.stars, href: links.value['stars'] },
    { name: 'Beobachter', value: stats.watchers, href: links.value['watchers'] },
    { name: 'Forks', value: stats.forks, href: links.value['forks'] },
  ])

  const asked = computed(() => (at === '' ? null : new Date(at).toLocaleString('de-DE')))

  /**
   * How many marks one row may carry. The number beside it is always the true one.
   *
   * The same rule the hull follows (`MAX_PER_KIND` in `marks.ts`): a repository with 442 open
   * issues would otherwise be a wall of boxes that says "viel" and nothing else. Twelve is what
   * fits on the panel's width at this size.
   */
  const MOST = 12

  /**
   * What is open, drawn rather than only counted.
   *
   * Issues and pull requests are the two figures here that are *work in flight* — the others
   * describe attention. A row of marks reads as an amount before the eye reaches the number, and
   * the two kinds keep the shapes the harbour already uses: a filled box for a request that
   * carries code, an open one for an issue that carries a question.
   */
  const open = computed(() => [
    {
      name: 'Issues',
      kind: 'issue' as const,
      count: stats.issues,
      drawn: Math.min(stats.issues, MOST),
      cut: stats.issues > MOST,
      href: links.value['issues'],
      filled: false,
      /*
       * The same colour the drawing uses, from the same constant.
       *
       * It was `border-amber-500` here and `SCENE.issue` out there — two spellings of one reading,
       * and the only way a reader can connect a crate on the apron with a row in this panel is
       * that they look alike. Tailwind cannot read a constant, so the colour is set as a style.
       */
      color: SCENE.issue,
    },
    {
      name: 'PRs',
      kind: 'pull' as const,
      count: stats.pulls,
      drawn: Math.min(stats.pulls, MOST),
      cut: stats.pulls > MOST,
      href: links.value['pulls'],
      filled: true,
      color: SCENE.pull,
    },
  ])
</script>

<template>
  <section class="border-b border-slate-800 px-4 py-3">
    <p class="flex items-baseline gap-2 text-[10px] tracking-wide text-slate-600 uppercase">
      <span>Forge</span>
      <span class="normal-case">{{ stats.slug.host }}</span>
      <!-- Its own age, always: this reading and the survey are never the same minute old. -->
      <span v-if="asked !== null" class="ml-auto normal-case">gefragt {{ asked }}</span>
    </p>

    <p class="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
      <button
        v-for="figure in figures"
        :key="figure.name"
        class="group flex items-baseline gap-1.5"
        :title="`${figure.name} auf ${stats.slug.host} ansehen`"
        @click="emit('open', figure.href ?? links['repo'] ?? '')"
      >
        <span class="text-slate-300 group-hover:text-orange-300">{{
          figure.value.toLocaleString('de-DE')
        }}</span>
        <span class="text-slate-600 group-hover:text-slate-400">{{ figure.name }}</span>
      </button>
    </p>

    <!--
      The two that are work in flight, as an amount and not only as a number.
      Capped at twelve marks with a `+` where it was cut — the count beside it stays the true one,
      which is the same promise the crates on a hull make.
    -->
    <ul class="mt-1.5 space-y-1">
      <li v-for="row in open" :key="row.name">
        <button
          class="group flex w-full items-center gap-2"
          :class="isForge(chosen, row.kind) ? 'ring-1 ring-orange-400/70' : ''"
          :title="`${row.count} offene ${row.name} auf ${stats.slug.host} ansehen`"
          @click="emit('open', row.href ?? links['repo'] ?? '')"
        >
          <span
            class="w-12 shrink-0 text-left font-mono text-[10px] text-slate-600 group-hover:text-slate-400"
            >{{ row.name }}</span
          >
          <span
            v-for="mark in row.drawn"
            :key="mark"
            class="inline-block h-2.5 w-1.5 border"
            :style="{
              borderColor: row.color,
              backgroundColor: row.filled ? row.color : 'transparent',
            }"
          />
          <span v-if="row.cut" class="font-mono text-[10px] text-slate-500">+</span>
          <span v-if="row.count === 0" class="font-mono text-[10px] text-slate-700">keine</span>
          <span class="ml-auto pl-2 font-mono text-xs text-slate-300 group-hover:text-orange-300">{{
            row.count.toLocaleString('de-DE')
          }}</span>
        </button>
      </li>
    </ul>

    <p class="mt-1 flex items-baseline gap-2 text-[11px]">
      <span v-if="stats.language !== null" class="text-slate-500">{{ stats.language }}</span>
      <button
        class="font-mono text-[10px] text-slate-600 underline-offset-2 hover:text-slate-300 hover:underline"
        @click="emit('open', links['repo'] ?? '')"
      >
        {{ stats.slug.owner }}/{{ stats.slug.repo }}
      </button>
    </p>
  </section>
</template>
