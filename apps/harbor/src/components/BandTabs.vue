<script setup lang="ts">
  import { computed } from 'vue'

  import {
    BANDS,
    bandPoints,
    byBand,
    CONTRACTS,
    draws,
    FLEET,
    isBand,
    PAGE_LABEL,
    PAGE_MEANING,
    pagesOf,
    shipsOn,
    VIEW_LABEL,
    VIEW_MEANING,
    VIEWS,
  } from './band'
  import { tallyContracts } from './contracts'
  import PointValue from './PointValue.vue'
  import { VERDICT_LABEL } from './theme'

  import type { Page, View } from './band'
  import type { ContractFilter } from './contracts'
  import type { Ship } from '@hafen/core'

  const {
    ships,
    contract = null,
    fleetPage = FLEET,
  } = defineProps<{
    ships: readonly Ship[]
    /** What was picked on the catalog page, so the basin can say what it is showing. */
    contract?: ContractFilter | null
    /** Which fleet sheet the fleet switch would open, which only the parent knows. */
    fleetPage?: Page
  }>()

  const emit = defineEmits<{ clear: []; view: [(typeof VIEWS)[number]] }>()

  const page = defineModel<Page>('page', { required: true })

  /**
   * Which question the bar is offering pages for.
   *
   * Held rather than read off the page, so that the parent can decide what a press lands on —
   * and kept in step with the page by a watcher there, for the times a page is chosen elsewhere
   * (a snapshot read, a demand picked in the catalog).
   *
   * Pressing a button only *asks*. Which page that lands on is the parent's to say, because only
   * it knows whether a ship is being read and which band she falls in.
   */
  const view = defineModel<View>('view', { required: true })
  const offered = computed(() => pagesOf(view.value))

  /**
   * What is typed into the filter.
   *
   * On the band bar rather than in the header, because it is about which ships are listed. The
   * counts beside each tab count what came in, and what comes in is already filtered: a filter
   * that leaves three ships and a tab that still says 41 is a window disagreeing with itself.
   */
  const query = defineModel<string>('query', { default: '' })

  const grouped = computed(() => byBand(ships))
  /** What each page that draws ships is worth — off `shipsOn`, so the tab and the drawing agree. */
  const scores = computed(
    () =>
      new Map(pagesOf(view.value).map((name) => [name, bandPoints(shipsOn(name, ships))] as const)),
  )

  /**
   * The catalog tab counts demands, not ships — it is the one page whose unit is not a hull.
   *
   * Off the same tally the page draws, so the number on the tab and the rows behind it cannot
   * disagree. It moves with the search for the same reason every other count does.
   */
  const demands = computed(() => tallyContracts(ships).flatMap((chain) => chain.contracts).length)

  /**
   * Which band the dock switch would land on — the one open, or the first.
   *
   * The parent decides where a press actually goes, so this is the same guess made here: whatever
   * band is being read stays, and from the fleet page the switch opens the first one.
   */
  const band = computed(() => (isBand(page.value) ? page.value : BANDS[0]))

  /**
   * How many ships each switch stands for.
   *
   * It carried no figures at first, on the reasoning that a count on a *view* would be a third
   * number for a thing that is not a page. The catalog had one anyway, which made the omission
   * look like an oversight rather than a rule — and the number a reader wants before pressing is
   * exactly this one: how big is the fleet, how full is the dock I would land in. The counts move
   * with the search, like every other count on this bar.
   */
  const counted = computed<Record<View, number>>(() => ({
    fleet: shipsOn(fleetPage, ships).length,
    dock: grouped.value[band.value].length,
    contracts: demands.value,
  }))
</script>

<template>
  <!--
    Every band is offered, including the empty ones: a tab that disappears when it has nothing in
    it is a tab nobody finds again, and "no archived repositories" is an answer worth being able
    to read. The catalog sits last because it is the only page that is not a set of ships.
  -->
  <nav class="flex gap-px overflow-hidden border-b border-slate-800 bg-slate-950 px-2">
    <!--
      The question before the page: two buttons, one of them always down.
      Eight figures and five tabs on one line was a bar nobody could aim at — the fleet page and
      the band pages answer different things, so the reader picks the question here and the tabs
      beside it are the ones that belong to it. No figures on these two: a count on the switch
      would be a third number for a thing that is not a page.
    -->
    <span class="mr-3 flex shrink-0 items-center gap-px self-center border-r border-slate-800 pr-3">
      <button
        v-for="name in VIEWS"
        :key="name"
        class="flex items-center px-2 py-1"
        :class="view === name ? 'text-slate-100' : 'text-slate-600 hover:text-slate-400'"
        :aria-pressed="view === name"
        :title="`${VIEW_LABEL[name]} ${counted[name]} — ${VIEW_MEANING[name]}`"
        @click="emit('view', name)"
      >
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          aria-hidden="true"
        >
          <!--
            Two plans and not two pictures: the dock is berths along a quay, the fleet is one
            trunk branching to many. Drawn in the same line weight as the harbour itself.
          -->
          <template v-if="name === 'dock'">
            <path d="M2 3h12M2 8h12M2 13h12" />
            <path d="M4 1.5v3M9 6.5v3M6 11.5v3" />
          </template>
          <template v-else-if="name === 'fleet'">
            <path d="M8 15V9" />
            <path d="M8 9 3 4M8 9l5-5M8 9V2" />
            <path d="M2.4 3.4h1.2M12.4 3.4h1.2M7.4 1.4h1.2" />
          </template>
          <!--
            The catalog: a demand and how much of the fleet answers it — a row with a filled part
            and an open one, three times over. Not a hull, because this is the one view whose unit
            is not a ship.
          -->
          <template v-else>
            <path d="M2 3.5h6M2 8h9M2 12.5h4" />
            <path d="M14 3.5h-3M14 8h-1M14 12.5h-8" stroke-dasharray="1.5 1.2" />
          </template>
        </svg>
        <span class="sr-only">{{ VIEW_LABEL[name] }}</span>
        <!--
          What each switch stands for, in its own unit: ships for the two that draw ships, demands
          for the one whose unit is not a hull. Three numbers in the same place that mean three
          different things would be the trap here — the title says which is which.
        -->
        <span class="ml-1 font-mono text-[10px] text-slate-600">{{ counted[name] }}</span>
      </button>
    </span>

    <button
      v-for="name in offered"
      :key="name"
      class="group shrink-0 px-3 py-1.5 text-left whitespace-nowrap"
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
      <!--
        Ships on every page that draws ships, demands on the one that draws demands.
        The fleet tab counted demands at first, because it is not a band and the only other case
        was the catalog — a tab that says 13 beside a harbour of 92 is a window lying about itself.
      -->
      <span class="ml-1.5 font-mono text-[10px] text-slate-600">{{
        name === CONTRACTS ? demands : shipsOn(name, ships).length
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
        v-if="draws(name)"
        class="ml-1.5 scale-90 opacity-70"
        :project="scores.get(name)?.project ?? 0"
        :personal="scores.get(name)?.own ?? 0"
      />
    </button>

    <!--
      What the basin is currently narrowed to, beside the tabs whose counts it changed.
      A filter set on another page and invisible on this one is a window that quietly disagrees
      with itself — the same failure the search filter had before its counts moved with it.
    -->
    <span
      v-if="contract !== null"
      class="ml-3 flex shrink-0 items-baseline gap-1.5 self-center font-mono text-[10px] whitespace-nowrap"
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

    <!--
      What this page means, and it may never push the bar taller.
      It is the one line here whose length is not the window's business: on a narrow window it
      wrapped to seven lines and the whole tab bar grew with it, so the tabs moved every time
      somebody picked a longer page. It shrinks to an ellipsis instead and keeps the sentence in
      its own title — a bar that changes height is a bar nobody can aim at.
    -->
    <p
      class="ml-auto min-w-0 flex-1 self-center truncate pr-3 text-right font-mono text-[10px] text-slate-600"
      :title="PAGE_MEANING[page]"
    >
      {{ PAGE_MEANING[page] }}
    </p>

    <!--
      A field and never a dropdown: ninety repositories have no shared axis to pick from, and the
      one thing somebody has in mind is a word out of the name or the path.
    -->
    <span class="flex shrink-0 items-center gap-1 self-center pr-1">
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
