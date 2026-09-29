<script setup lang="ts">
  import { computed, ref } from 'vue'

  import { VERDICT_COLOR, VERDICT_LABEL, VERDICT_MEANING } from './theme'

  import type { QuestResult } from '@hafen/core'

  const { quest, own = false } = defineProps<{
    quest: QuestResult
    /** The ship demands this of itself rather than the fleet demanding it. */
    own?: boolean
  }>()

  /**
   * The evidence is collapsed by default and never absent.
   *
   * A verdict has to be arguable rather than believed — that is the whole reason every probe
   * carries what it read. But a panel that shows all of it at once is a panel nobody reads, so
   * the proof is one click away and the click is on the verdict itself.
   */
  const open = ref(false)

  const mark = computed(
    () =>
      ({ met: '+', violated: '!', waiting: '~', unmeasured: '?', notApplicable: '·' })[
        quest.verdict
      ],
  )
</script>

<template>
  <div class="border-t border-slate-800/70 py-2 first:border-t-0">
    <button
      class="flex w-full items-start gap-2 text-left hover:bg-slate-800/30"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span
        class="mt-px w-3 shrink-0 font-mono text-sm leading-5"
        :style="{ color: VERDICT_COLOR[quest.verdict] }"
        >{{ mark }}</span
      >
      <span class="min-w-0 flex-1">
        <span class="flex flex-wrap items-baseline gap-x-2">
          <span class="font-mono text-xs text-slate-200">{{ quest.id }}</span>
          <span
            class="text-[10px] uppercase tracking-wide"
            :style="{ color: VERDICT_COLOR[quest.verdict] }"
            >{{ VERDICT_LABEL[quest.verdict] }}</span
          >
          <span v-if="own" class="text-[10px] text-slate-500">eigene Forderung</span>
        </span>
        <span class="mt-0.5 block text-xs leading-snug text-slate-400">{{ quest.reason }}</span>
      </span>
      <span class="mt-0.5 shrink-0 font-mono text-[10px] text-slate-600">{{
        open ? '−' : '+'
      }}</span>
    </button>

    <div v-if="open" class="mt-2 ml-5 space-y-2">
      <p class="text-xs leading-snug text-slate-500 italic">
        {{ VERDICT_MEANING[quest.verdict] }}
      </p>
      <p v-if="quest.why !== ''" class="text-xs leading-snug text-slate-400">
        <span class="text-slate-600">Warum: </span>{{ quest.why }}
      </p>
      <p v-if="quest.waitingOn.length > 0" class="font-mono text-xs text-slate-500">
        wartet auf {{ quest.waitingOn.join(', ') }}
      </p>

      <!--
        Evidence: what was asked, where it was looked up, what stood there.

        Stacked and not a table. Four columns in a 384 px panel gave the question a column two
        words wide and broke it down the page one word per line — a proof nobody reads is the
        same as no proof. Each check is one block: the question, then source and finding under
        it, which is also the order the sentence is spoken in.
      -->
      <ul v-if="quest.checks.length > 0" class="space-y-1.5">
        <li v-for="(check, index) in quest.checks" :key="index" class="flex gap-1.5 text-[11px]">
          <span
            class="mt-px w-2 shrink-0 font-mono"
            :style="{
              color:
                check.ok === null
                  ? VERDICT_COLOR.unmeasured
                  : check.ok
                    ? VERDICT_COLOR.met
                    : VERDICT_COLOR.violated,
            }"
            >{{ check.ok === null ? '?' : check.ok ? '+' : '!' }}</span
          >
          <span class="min-w-0 flex-1">
            <span class="block leading-snug text-slate-400">{{ check.evidence.question }}</span>
            <span class="mt-0.5 block font-mono leading-snug break-words text-slate-600">
              {{ check.evidence.where }} → {{ check.evidence.found }}
            </span>
          </span>
        </li>
      </ul>
      <p v-else class="text-xs text-slate-600">Die Quest nennt keine Prüfung.</p>
    </div>
  </div>
</template>
