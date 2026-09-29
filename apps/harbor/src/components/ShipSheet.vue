<script setup lang="ts">
  import { contractChecks, hasChecks, mirrorsOf, originOf, rustLevel } from '@hafen/core'
  import { computed } from 'vue'

  import { bindingQuests, ageLabel, orderedQuests } from './fleet'
  import QuestRow from './QuestRow.vue'
  import { RUST_LABEL, STAGE_LABEL, STAGE_MEANING } from './theme'

  import type { Ship } from '@hafen/core'

  const { ship } = defineProps<{ ship: Ship }>()

  const binding = computed(() => orderedQuests(bindingQuests(ship)))
  const notApplicable = computed(() =>
    ship.quests.filter((quest) => quest.verdict === 'notApplicable'),
  )
  const origin = computed(() => originOf(ship.remotes))
  const mirrors = computed(() => mirrorsOf(ship.remotes))
  const checks = computed(() => contractChecks(ship.contract))
</script>

<template>
  <!-- A datasheet, not a dashboard: every row is a measurement with its source. -->
  <article class="flex h-full flex-col overflow-y-auto bg-slate-900/60 text-sm">
    <header class="border-b border-slate-800 px-4 py-3">
      <p class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
        Schiffsdatenblatt
      </p>
      <h2 class="mt-1 font-mono text-base break-words text-slate-100">
        {{ ship.org }}/{{ ship.name }}
      </h2>
      <p class="mt-1 text-xs text-slate-500">{{ ship.path }}</p>
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

    <section class="px-4 py-3">
      <p class="text-[10px] tracking-wide text-slate-600 uppercase">
        Quests <span class="text-slate-700">— {{ binding.length }} bindend</span>
      </p>

      <div v-if="binding.length === 0" class="mt-2 text-slate-500">
        Keine Forderung der Flotte gilt für dieses Schiff.
      </div>
      <div v-else class="mt-1">
        <QuestRow
          v-for="quest in binding"
          :key="quest.id"
          :quest="quest"
          :own="ship.ownQuests.includes(quest.id)"
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
