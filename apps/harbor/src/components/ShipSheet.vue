<script setup lang="ts">
  import {
    contractChecks,
    hasChecks,
    localTasks,
    mirrorsOf,
    originOf,
    rustLevel,
    shipPoints,
    taskForQuest,
  } from '@hafen/core'
  import { computed, ref } from 'vue'

  import { bindingQuests, ageLabel, orderedQuests } from './fleet'
  import PointValue from './PointValue.vue'
  import QuestRow from './QuestRow.vue'
  import TaskList from './TaskList.vue'
  import { RUST_LABEL, STAGE_LABEL, STAGE_MEANING } from './theme'

  import type { Ship } from '@hafen/core'

  const {
    ship,
    pinned = false,
    canAct = false,
    busy = false,
    quest: chosenQuest = null,
  } = defineProps<{
    ship: Ship
    /** Whether this sheet is held by a click rather than following the pointer. */
    pinned?: boolean
    /** Whether this window has a shell. False in a browser, where the buttons would only fail. */
    canAct?: boolean
    busy?: boolean
    /** The quest whose box was clicked in the harbour, if it was a box that was clicked. */
    quest?: string | null
  }>()

  /**
   * The two things a person decides about a repository, and the only two.
   *
   * Everything else on this sheet is measured; these are not, which is why they are the only
   * buttons on it. Archiving is what the register holds, and the register holds nothing else about
   * a ship — so there is no third one to add later without something changing shape first.
   */
  const emit = defineEmits<{ measure: [string]; archive: [boolean]; enlist: [boolean] }>()

  const binding = computed(() => orderedQuests(bindingQuests(ship)))
  const notApplicable = computed(() =>
    ship.quests.filter((quest) => quest.verdict === 'notApplicable'),
  )
  const origin = computed(() => originOf(ship.remotes))
  const mirrors = computed(() => mirrorsOf(ship.remotes))
  const checks = computed(() => contractChecks(ship.contract))
  const points = computed(() => shipPoints(ship))

  /**
   * Only what the repository itself is asking for.
   *
   * The violated quests used to be in here as well *and* in the section below with their evidence
   * — the same sentence twice, the second time with more behind it. They are offered at their own
   * row now, which is where the proof that they are open already stood.
   */
  const doing = computed(() => localTasks(ship))

  /**
   * How far this sheet has been scrolled, for the header that shrinks.
   *
   * Measured from the element rather than kept in step with a class: the header has to stay put —
   * it is what says which repository the rest is about — but at full height it is a quarter of a
   * 384 px panel, and that quarter is spent on a path that does not change while reading.
   */
  const scrolled = ref(false)
  const onScroll = (event: Event): void => {
    scrolled.value = (event.target as HTMLElement).scrollTop > 12
  }
</script>

<template>
  <!-- A datasheet, not a dashboard: every row is a measurement with its source. -->
  <article class="flex h-full flex-col overflow-y-auto bg-slate-900/60 text-sm" @scroll="onScroll">
    <!--
      Sticky: the name is what tells a reader which repository the rest of the sheet is about,
      and it scrolled away exactly when the list below got long enough to need it.
    -->
    <header
      class="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 px-4 transition-[padding] duration-150"
      :class="scrolled ? 'py-1.5' : 'py-3'"
    >
      <p
        v-if="!scrolled"
        class="flex items-baseline gap-2 font-mono text-[10px] tracking-widest uppercase"
      >
        <span class="text-slate-500">Schiffsdatenblatt</span>
        <!-- Said out loud: a panel that silently stops following the pointer looks broken. -->
        <span v-if="pinned" class="text-slate-400 normal-case">festgehalten</span>
        <span v-else class="text-slate-700 normal-case">anklicken hält fest</span>
      </p>
      <h2
        class="font-mono break-words text-slate-100"
        :class="scrolled ? 'text-sm' : 'mt-1 text-base'"
      >
        {{ ship.org }}/{{ ship.name }}
      </h2>
      <!-- The path is the first thing to go: it is long, and it does not change while reading. -->
      <p v-if="!scrolled" class="mt-1 text-xs text-slate-500">{{ ship.path }}</p>

      <!--
        Two buttons, and both act on this one repository rather than on the fleet: measuring all
        ninety to learn what one of them just did is the reason refreshing felt like something to
        avoid. Neither touches the repository — one reads it, the other writes a line in the
        register.
      -->
      <p
        v-if="canAct"
        class="flex gap-3 font-mono text-[10px]"
        :class="scrolled ? 'mt-0.5' : 'mt-2'"
      >
        <button
          class="text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline disabled:text-slate-700 disabled:no-underline"
          :disabled="busy"
          title="Nur dieses Repository neu messen"
          @click="emit('measure', ship.path)"
        >
          {{ busy ? 'misst …' : 'neu messen' }}
        </button>
        <button
          class="text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline disabled:text-slate-700 disabled:no-underline"
          :disabled="busy"
          :title="
            ship.archived
              ? 'Aus dem Register nehmen — erscheint wieder unter Aktiv oder Ruhend'
              : 'Ins Register legen — verschwindet aus Aktiv und Ruhend'
          "
          @click="emit('archive', !ship.archived)"
        >
          {{ ship.archived ? 'reaktivieren' : 'archivieren' }}
        </button>
        <!--
          Only where the register actually holds this directory. On a repository the survey found
          by itself there is nothing to take out, and a button that did nothing on most ships would
          be a button that lies — which is why `enlisted` travels on the ship at all.
        -->
        <button
          v-if="ship.enlisted"
          class="text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline disabled:text-slate-700 disabled:no-underline"
          :disabled="busy"
          title="Aus dem Register nehmen — dieses Verzeichnis wurde von Hand aufgenommen"
          @click="emit('enlist', false)"
        >
          nicht mehr führen
        </button>
      </p>
    </header>

    <section class="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-3">
      <div>
        <p class="text-[10px] tracking-wide text-slate-600 uppercase">Lage</p>
        <p class="text-slate-300">{{ STAGE_LABEL[ship.stage] }}</p>
        <p class="text-[11px] text-slate-600">{{ STAGE_MEANING[ship.stage] }}</p>
      </div>
      <div>
        <p class="text-[10px] tracking-wide text-slate-600 uppercase">Liegezeit</p>
        <p class="text-slate-300">{{ ageLabel(ship.rustDays) }}</p>
        <p class="text-[11px] text-slate-600">{{ RUST_LABEL[rustLevel(ship.rustDays)] }}</p>
      </div>
      <div>
        <p class="text-[10px] tracking-wide text-slate-600 uppercase">Branch</p>
        <p class="font-mono text-xs text-slate-300">
          {{ ship.branch ?? '—' }}<span v-if="ship.dirty" class="text-amber-500"> *</span>
        </p>
        <p v-if="ship.ahead !== null || ship.behind !== null" class="text-[11px] text-slate-600">
          {{ ship.ahead ?? 0 }} voraus, {{ ship.behind ?? 0 }} zurück
        </p>
        <!-- No upstream is an answer, and not the same as being level with one. -->
        <p v-else class="text-[11px] text-slate-600">kein Upstream</p>
      </div>
      <div>
        <p class="text-[10px] tracking-wide text-slate-600 uppercase">Worktrees</p>
        <p class="text-slate-300">{{ ship.docks.length }}</p>
      </div>
    </section>

    <!-- Counts beside the score, so the weighting can be argued with rather than believed. -->
    <section class="border-b border-slate-800 px-4 py-3">
      <p class="text-[10px] tracking-wide text-slate-600 uppercase">Geleistet</p>
      <p><PointValue :project="points.project" :personal="points.own" /></p>
      <p class="text-[11px] text-slate-600">
        {{ ship.ledger.total.commits }} Commits · {{ ship.ledger.total.pulls }} PRs ·
        {{ ship.ledger.total.authors }} {{ ship.ledger.total.authors === 1 ? 'Autor' : 'Autoren' }}
      </p>
      <p v-if="ship.ledger.total.unscored > 0" class="text-[11px] text-slate-600">
        {{ ship.ledger.total.unscored }} ohne Convention
      </p>
    </section>

    <section class="border-b border-slate-800 px-4 py-3">
      <p class="text-[10px] tracking-wide text-slate-600 uppercase">Remotes</p>
      <p v-if="origin === null" class="text-slate-500">kein origin</p>
      <template v-else>
        <p class="font-mono text-xs break-all text-slate-300">
          {{ origin.name }} · {{ origin.url }}
        </p>
        <p class="text-[11px] text-slate-600">Forge: {{ origin.forge }}</p>
      </template>
      <!-- Mirrors are shown and never asked: they hold the same work. -->
      <p
        v-for="mirror in mirrors"
        :key="mirror.name"
        class="font-mono text-xs break-all text-slate-500"
      >
        {{ mirror.name }} · {{ mirror.url }} <span class="text-slate-600">(Spiegel)</span>
      </p>
    </section>

    <section class="border-b border-slate-800 px-4 py-3">
      <p class="text-[10px] tracking-wide text-slate-600 uppercase">Test-Vertrag</p>
      <p class="text-[11px] text-slate-600">
        Art: {{ ship.contract.kind }} · Dev-Einstieg: {{ ship.contract.devEntry }}
      </p>
      <!-- "Nothing to run" stands above everything, because every gap hides behind it. -->
      <p v-if="!hasChecks(ship.contract)" class="mt-1 text-amber-600">keine Prüfung gefunden</p>
      <template v-else>
        <p v-if="ship.contract.gaps.length > 0" class="mt-1 text-amber-600">
          fehlt: {{ ship.contract.gaps.join(', ') }}
        </p>
        <ul class="mt-1 space-y-0.5">
          <li
            v-for="check in checks"
            :key="`${check.dir}/${check.script}`"
            class="font-mono text-xs text-slate-400"
          >
            {{ check.dir }} · {{ check.script }}
          </li>
        </ul>
      </template>
      <p v-if="ship.contract.inCi.length > 0" class="mt-1 text-[11px] text-slate-600">
        in CI: {{ ship.contract.inCi.join(', ') }}
      </p>
    </section>

    <TaskList :tasks="doing" />

    <section class="px-4 py-3">
      <p class="text-[10px] tracking-wide text-slate-600 uppercase">
        Quests <span class="text-slate-700">— {{ binding.length }} bindend</span>
      </p>

      <div v-if="binding.length === 0" class="mt-2 text-slate-500">
        Keine Forderung der Flotte gilt für dieses Schiff.
      </div>
      <div v-else class="mt-1">
        <QuestRow
          v-for="demand in binding"
          :key="demand.id"
          :quest="demand"
          :own="ship.ownQuests.includes(demand.id)"
          :task="taskForQuest(ship, demand.id)"
          :chosen="demand.id === chosenQuest"
        />
      </div>

      <!-- Counted, not listed: the right answer, and noise at length. -->
      <p v-if="notApplicable.length > 0" class="mt-3 text-[11px] text-slate-600">
        {{ notApplicable.length }} weitere gelten hier nicht:
        {{ notApplicable.map((quest) => quest.id).join(', ') }}
      </p>

      <p v-if="ship.overriddenQuests.length > 0" class="mt-2 text-[11px] text-amber-700">
        Eigene Forderung verworfen, der Katalog fordert sie schon:
        {{ ship.overriddenQuests.join(', ') }}
      </p>
      <p v-if="ship.unreadableQuests.length > 0" class="mt-2 text-[11px] text-red-500">
        Nicht lesbar: {{ ship.unreadableQuests.join(', ') }}
      </p>
    </section>
  </article>
</template>
