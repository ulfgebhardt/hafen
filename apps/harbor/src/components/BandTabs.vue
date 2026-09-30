<script setup lang="ts">
  import { computed } from 'vue'

  import { BANDS, bandPoints, byBand, isBand, PAGE_LABEL, PAGE_MEANING, PAGES } from './band'
  import { tallyContracts } from './contracts'
  import PointValue from './PointValue.vue'
  import { VERDICT_LABEL } from './theme'

  import type { ContractFilter } from './contracts'
  import type { Ship } from '@hafen/core'

  const { ships, contract = null } = defineProps<{
    ships: readonly Ship[]
    /** What was picked on the catalog page, so the basin can say what it is showing. */
    contract?: ContractFilter | null
  }>()

  const emit = defineEmits<{ clear: [] }>()

  const page = defineModel<(typeof PAGES)[number]>('page', { required: true })

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

  /**
   * The catalog tab counts demands, not ships — it is the one page whose unit is not a hull.
   *
   * Off the same tally the page draws, so the number on the tab and the rows behind it cannot
   * disagree. It moves with the search for the same reason every other count does.
   */
  const demands = computed(() => tallyContracts(ships).flatMap((chain) => chain.contracts).length)
</script>

<template>
  <!--
    Every band is offered, including the empty ones: a tab that disappears when it has nothing in
    it is a tab nobody finds again, and "no archived repositories" is an answer worth being able
    to read. The catalog sits last because it is the only page that is not a set of ships.
  -->
  <nav class="flex gap-px border-b border-slate-800 bg-slate-950 px-2">
    <button
      v-for="name in PAGES"
      :key="name"
      class="group px-3 py-1.5 text-left"
      :class="
        page === name
          ? 'border-b-2 border-slate-300 text-slate-100'
          : 'border-b-2 border-transparent text-slate-500 hover:text-slate-300'
      "
      :aria-current="page === name ? 'page' : undefined"
      :title="PAGE_MEANING[name]"
      @click="page = name"
    >
      <span class="font-mono text-xs tracking-wide">{{ PAGE_LABEL[name] }}</span>
      <span class="ml-1.5 font-mono text-[10px] text-slate-600">{{
        isBand(name) ? grouped[name].length : demands
      }}</span>

      <!--
        What the page is worth, under its own name. The header's figure is the whole machine and
        answers a different question — a fleet whose points are nearly all archived is not the same
        fleet as one whose points are all active, and from the tabs alone the two looked identical.

        Not on the catalog tab, and that is the rule rather than an omission: a demand is a state a
        ship should be in, never a performance to book. Giving the contracts a score would let a
        repository buy its way out of a broken one with commit volume.
      -->
      <PointValue
        v-if="isBand(name)"
        class="ml-1.5 scale-90 opacity-70"
        :project="scores[name]?.project ?? 0"
        :personal="scores[name]?.own ?? 0"
      />
    </button>

    <!--
      What the basin is currently narrowed to, beside the tabs whose counts it changed.
      A filter set on another page and invisible on this one is a window that quietly disagrees
      with itself — the same failure the search filter had before its counts moved with it.
    -->
    <span
      v-if="contract !== null"
      class="ml-3 flex items-baseline gap-1.5 self-center font-mono text-[10px]"
    >
      <span class="text-slate-600">Vertrag</span>
      <span class="text-orange-300">{{ contract.id }}</span>
      <span class="text-slate-500">{{
        contract.verdict === null ? 'offen' : VERDICT_LABEL[contract.verdict]
      }}</span>
      <button
        class="text-slate-600 hover:text-slate-300"
        title="Vertragsfilter aufheben"
        @click="emit('clear')"
      >
        ×
      </button>
    </span>

    <p class="ml-auto self-center pr-3 font-mono text-[10px] text-slate-600">
      {{ PAGE_MEANING[page] }}
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
