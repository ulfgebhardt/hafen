<script setup lang="ts">
  import { computed, ref, watch } from 'vue'

  import PointValue from './PointValue.vue'
  import { VERDICT_COLOR, VERDICT_LABEL, VERDICT_MEANING } from './theme'

  import type { QuestResult, Task } from '@hafen/core'

  const {
    quest,
    own = false,
    task = null,
    chosen = false,
  } = defineProps<{
    quest: QuestResult
    /** The ship demands this of itself rather than the fleet demanding it. */
    own?: boolean
    /**
     * What closing this would be worth, where it is something to close.
     *
     * Here rather than in a second list above, which is where it was: the sheet printed every
     * violated quest as a task and then printed the same quests again with their evidence. A thing
     * belongs where its evidence is, so the value and the command came down to the row.
     */
    task?: Task | null
    /** Somebody clicked this quest's box in the harbour. */
    chosen?: boolean
  }>()

  /**
   * The evidence is collapsed by default and never absent.
   *
   * A verdict has to be arguable rather than believed — that is the whole reason every probe
   * carries what it read. But a panel that shows all of it at once is a panel nobody reads, so
   * the proof is one click away and the click is on the verdict itself.
   */
  const open = ref(false)
  const row = ref<HTMLElement | null>(null)

  /**
   * Clicking a box in the harbour opens this row and brings it into view.
   *
   * Opened and not only marked: somebody who clicked a specific container asked about *that*
   * demand, and a highlighted row they then have to click again is a step that answers nothing.
   */
  watch(
    () => chosen,
    (picked) => {
      if (!picked) {
        return
      }
      open.value = true
      row.value?.scrollIntoView({ block: 'nearest' })
    },
    { immediate: true },
  )

  const mark = computed(
    () =>
      ({ met: '+', violated: '!', waiting: '~', unmeasured: '?', notApplicable: '·' })[
        quest.verdict
      ],
  )
</script>

<template>
  <div
    ref="row"
    class="border-t border-slate-800/70 py-2 first:border-t-0"
    :class="chosen ? 'bg-orange-500/10 ring-1 ring-orange-500/40' : ''"
  >
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
          <!-- What closing it is worth, on the row that carries the proof it is open. -->
          <PointValue
            v-if="task !== null"
            class="ml-auto"
            :project="task.project"
            :personal="task.personal"
            signed
          />
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

      <!--
        The command to type, and nothing that types it. The harbour measures and draws; the work
        happens in a terminal, by hand — the same rule the task list follows, and the reason there
        is no button here either.
      -->
      <code
        v-if="task !== null"
        class="block font-mono text-[11px] break-all text-slate-600 select-all"
        >{{ task.command }}</code
      >
    </div>
  </div>
</template>
