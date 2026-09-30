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

  import type { ForgeStats } from '@hafen/core'

  const { stats, at = '' } = defineProps<{ stats: ForgeStats; at?: string }>()

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
    { name: 'Issues', value: stats.issues, href: links.value['issues'] },
    { name: 'PRs', value: stats.pulls, href: links.value['pulls'] },
  ])

  const asked = computed(() => (at === '' ? null : new Date(at).toLocaleString('de-DE')))
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
