<script setup lang="ts">
  /**
   * What the fleet demands, one row per demand.
   *
   * The basin answers "what is this harbour like" and the datasheet answers "what does this ship
   * owe". Neither could answer "is this demand doing any work", and that turned out to be a
   * question with a surprising answer: two of thirteen settle nothing at all on this fleet.
   *
   * A list and not a matrix. Thirteen rows against ninety columns is a horizontal scroll, and a
   * repository name does not fit in a column head — so the second axis is the bar, which is the
   * same shape a hull uses and needs no legend.
   */

  import { computed } from 'vue'

  import { tallyContracts } from './contracts'
  import { SEGMENT, VERDICT_COLOR, VERDICT_LABEL, VERDICT_MEANING, VERDICT_ORDER } from './theme'

  import type { ContractFilter, ContractTally } from './contracts'
  import type { QuestVerdict, Ship } from '@hafen/core'

  const { ships, picked = null } = defineProps<{
    ships: readonly Ship[]
    picked?: ContractFilter | null
  }>()

  const emit = defineEmits<{ pick: [ContractFilter] }>()

  const chains = computed(() => tallyContracts(ships))

  /** Every verdict that actually occurs, worst first — an empty segment is not worth a target. */
  const present = (row: ContractTally): readonly { verdict: QuestVerdict; count: number }[] =>
    VERDICT_ORDER.map((verdict) => ({ verdict, count: row.counts.get(verdict) ?? 0 })).filter(
      (one) => one.count > 0,
    )

  /**
   * The bar is drawn over the ships the demand *reaches*, so `nicht anwendbar` is not in it.
   *
   * It would otherwise be the longest segment on every row — 48 of 92 here — and every demand
   * would look mostly grey for a reason that says nothing about the demand. The number is not
   * lost: it stands in the line underneath with the rest.
   */
  const bar = (row: ContractTally): readonly { verdict: QuestVerdict; share: number }[] =>
    present(row)
      .filter((one) => one.verdict !== 'notApplicable')
      .map((one) => ({
        verdict: one.verdict,
        share: row.binding === 0 ? 0 : one.count / row.binding,
      }))

  /**
   * The form each verdict carries, mirroring the hull's.
   *
   * Eight percent of men do not separate this red from this green, so the fill is never the only
   * difference: `verletzt` is hatched, `nicht messbar` is a dashed outline over nothing. The words
   * stand underneath either way — those are the controls, and this bar is the glance.
   */
  const fillOf = (verdict: QuestVerdict): Record<string, string> => {
    const form = SEGMENT[verdict]
    const colour = VERDICT_COLOR[verdict]
    if (form.hatch) {
      return {
        backgroundImage: `repeating-linear-gradient(45deg, ${colour} 0 2px, transparent 2px 5px)`,
        border: `1px solid ${colour}`,
      }
    }
    if (form.dashed) {
      return { border: `1px dashed ${colour}`, backgroundColor: 'transparent' }
    }
    return { backgroundColor: colour, opacity: String(form.opacity) }
  }

  const isPicked = (id: string, verdict: QuestVerdict | null): boolean =>
    picked !== null && picked.id === id && picked.verdict === verdict
</script>

<template>
  <div class="h-full overflow-y-auto px-4 py-3">
    <!--
      Every chain, including the ones nothing is filed under. Same argument as the empty band tab:
      a heading that vanishes when it is empty is one nobody finds again to ask why it is empty.
    -->
    <section v-for="chain in chains" :key="chain.chain" class="mb-5">
      <p class="flex items-baseline gap-2 border-b border-slate-800 pb-1">
        <span class="font-mono text-xs tracking-widest text-ink uppercase">{{ chain.chain }}</span>
        <span v-if="chain.contracts.length === 0" class="text-[11px] text-ink-faint">
          fordert heute nichts
        </span>
        <template v-else>
          <span class="font-mono text-[11px] text-ink-faint"
            >{{ chain.contracts.length }} Forderungen</span
          >
          <span class="font-mono text-[11px] text-ink-faint"
            >· {{ chain.binding }} Schiffe im Geltungsbereich</span
          >
        </template>
      </p>

      <ul>
        <li
          v-for="row in chain.contracts"
          :key="row.id"
          class="border-b border-slate-900 py-2"
          :class="picked !== null && picked.id === row.id ? 'bg-slate-900/60' : ''"
        >
          <!--
            The row asks what the demand *found wanting* — `verletzt` or `Voraussetzung offen`.
            Not "who breaks it": `geschuetzter-hauptzweig` has no `verletzt` at all, and 38 ships
            waiting on it would have answered with an empty basin. And not "everything not met"
            either, which would sweep `nicht messbar` in with the debts.

            Disabled where it found nothing, so the row cannot offer a basin it has no ships for.
            The verdict words underneath still work: `nicht messbar` is a set worth looking at, it
            is just not a set of debtors.
          -->
          <button
            class="group flex w-full items-baseline gap-2 text-left"
            :title="row.why"
            :disabled="row.outstanding === 0"
            @click="emit('pick', { id: row.id, verdict: null })"
          >
            <span
              class="font-mono text-xs"
              :class="
                isPicked(row.id, null)
                  ? 'text-orange-300'
                  : row.outstanding > 0
                    ? 'text-ink group-hover:text-orange-300'
                    : 'text-ink-muted'
              "
              >{{ row.id }}</span
            >
            <span class="min-w-0 flex-1 truncate text-[11px] text-ink-faint">{{ row.title }}</span>
            <!--
              `verletzt` plus `Voraussetzung offen`, and never `binding - met`.
              That arithmetic reported "44 offen" for a demand that is `nicht messbar` on all 44
              ships it reaches — 44 debts invented out of 44 failed measurements. Where nothing was
              found, the row says so instead of counting.
            -->
            <span class="shrink-0 font-mono text-[11px] text-ink-faint">
              {{ row.outstanding > 0 ? `${row.outstanding} offen` : 'nichts gefunden' }}
            </span>
          </button>

          <!-- The glance. The controls are the words underneath; this carries no click. -->
          <span
            v-if="row.binding > 0"
            class="mt-1 flex h-2 w-full overflow-hidden"
            aria-hidden="true"
          >
            <span
              v-for="part in bar(row)"
              :key="part.verdict"
              :style="{ ...fillOf(part.verdict), width: `${String(part.share * 100)}%` }"
            />
          </span>

          <!--
            The words, and they are the targets. A bar alone would be colour and nothing else, and
            a demand with 44 ships behind one segment is exactly where somebody wants to look.
          -->
          <p class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <button
              v-for="one in present(row)"
              :key="one.verdict"
              class="group flex items-baseline gap-1 font-mono text-[11px]"
              :title="`${VERDICT_MEANING[one.verdict]} — die ${one.count} anzeigen`"
              @click="emit('pick', { id: row.id, verdict: one.verdict })"
            >
              <span
                :class="
                  isPicked(row.id, one.verdict)
                    ? 'text-orange-300'
                    : 'text-ink-muted group-hover:text-orange-300'
                "
                >{{ one.count }}</span
              >
              <span
                :class="
                  isPicked(row.id, one.verdict)
                    ? 'text-orange-400/70'
                    : 'text-ink-faint group-hover:text-ink-muted'
                "
                >{{ VERDICT_LABEL[one.verdict] }}</span
              >
            </button>
          </p>

          <!--
            Said out loud, because it is invisible per ship.
            A demand can be right and unanswerable here — that is what the fifth verdict is for,
            and it is never drawn as a failure. But one that answers nothing anywhere looks exactly
            like a working one until somebody counts, and two of thirteen are in that state.
          -->
          <p v-if="row.silent" class="mt-1 font-mono text-[11px] text-amber-600/80">
            kein Urteil auf dieser Flotte — diese Forderung misst hier nichts
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
