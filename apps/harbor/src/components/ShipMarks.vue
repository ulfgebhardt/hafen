<script setup lang="ts">
  /**
   * What the repository itself is doing, one row per kind.
   *
   * The counterpart every drawn mark needed. Clicking a crate on the planking used to answer
   * "this ship", which the sheet had already said before anybody clicked — because there was
   * nothing in the sheet a crate *could* point at. Now there is, and the two directions meet:
   * click the crate and this row lights up, click this row and the crate does.
   *
   * The **honest** count, not the drawn one: the harbour draws at most four of a kind because
   * two hundred untracked files would bury the ship, and a panel that repeated the cap would
   * make the cap look like the measurement.
   */

  import { computed, ref, useTemplateRef } from 'vue'

  import { isMark, isPier } from './chosen'
  import { MARK_LABEL, MARK_MEANING, marksOf } from './marks'
  import { revealChosen } from './revealing'
  import { MARK_COLOR } from './theme'

  import type { Chosen } from './chosen'
  import type { MarkKind } from './marks'
  import type { Ship } from '@hafen/core'

  const { ship, chosen = null } = defineProps<{ ship: Ship; chosen?: Chosen | null }>()

  const emit = defineEmits<{ pick: [Chosen | null] }>()

  const marks = computed(() => marksOf(ship))
  const rows = ref<Record<string, HTMLElement | null>>({})

  /**
   * A row that was chosen in the harbour brings itself into view.
   *
   * The same move a quest row makes, and for the same reason: somebody who clicked a specific
   * crate asked about *that*, and leaving them to find it in a panel they have to scroll is an
   * answer they have to go looking for.
   */
  const section = useTemplateRef<HTMLElement>('section')

  revealChosen(
    () => chosen,
    // The gangway stands for the whole of this, so it brings the whole section into view.
    (pick) => (isPier(pick) ? section.value : pick.kind === 'mark' ? rows.value[pick.mark] : null),
  )

  /** Vue hands a `ref` function the component instance too; only an element is of use here. */
  const hold =
    (kind: MarkKind) =>
    (element: unknown): void => {
      rows.value[kind] = element instanceof HTMLElement ? element : null
    }
</script>

<template>
  <section
    v-if="marks.length > 0"
    ref="section"
    data-row
    class="border-b border-slate-800 px-4 py-3"
    :class="isPier(chosen) ? 'bg-orange-500/5 ring-1 ring-orange-500/30' : ''"
  >
    <p class="text-[11px] tracking-wide text-ink-faint uppercase">
      Zustand <span class="text-ink-faint">— {{ marks.length }} Arten</span>
    </p>

    <ul class="mt-1 space-y-1">
      <li v-for="mark in marks" :key="mark.kind" :ref="hold(mark.kind)" data-row>
        <button
          class="flex w-full items-start gap-2 px-1 py-0.5 text-left hover:bg-slate-800/30"
          :class="isMark(chosen, mark.kind) ? 'bg-orange-500/10 ring-1 ring-orange-500/40' : ''"
          @click="
            emit('pick', isMark(chosen, mark.kind) ? null : { kind: 'mark', mark: mark.kind })
          "
        >
          <!--
            The same colour the harbour draws it in, so a reader who saw it out there recognises
            it in here without being told which was which.
          -->
          <span
            class="mt-1 h-2 w-3 shrink-0 border"
            :style="{
              borderColor: MARK_COLOR[mark.kind],
              backgroundColor: mark.kind === 'untracked' ? 'transparent' : MARK_COLOR[mark.kind],
            }"
          />
          <span class="min-w-0 flex-1">
            <span class="flex items-baseline gap-2">
              <span class="text-xs text-ink-strong">{{ MARK_LABEL[mark.kind] }}</span>
              <!-- The honest count: the drawing caps at four, the measurement does not. -->
              <span class="font-mono text-[11px] text-ink-muted">{{ mark.count }}</span>
            </span>
            <span class="block text-[11px] leading-snug text-ink-faint">{{
              MARK_MEANING[mark.kind]
            }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>
