<script setup lang="ts">
  import {
    contractChecks,
    hasChecks,
    localTasks,
    lineageOf,
    mirrorsOf,
    originOf,
    pointLines,
    rustLevel,
    shipPoints,
    taskForQuest,
  } from '@hafen/core'
  import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'

  import { isQuest } from './chosen'
  import { bindingQuests, ageLabel, orderedQuests } from './fleet'
  import ForgeFacts from './ForgeFacts.vue'
  import { tell } from './kinship'
  import PointValue from './PointValue.vue'
  import QuestRow from './QuestRow.vue'
  import ShipMarks from './ShipMarks.vue'
  import ShipPlan from './ShipPlan.vue'
  import ShipTools from './ShipTools.vue'
  import TaskList from './TaskList.vue'
  import { RUST_LABEL, STAGE_LABEL, STAGE_MEANING } from './theme'

  import type { Chosen } from './chosen'
  import type { ToolName } from './tools'
  import type { ForgeStats, Ship } from '@hafen/core'

  const {
    ship,
    pinned = false,
    canAct = false,
    busy = false,
    quest: chosenQuest = null,
    tools = [],
    stats = null,
    forgeAt = '',
    at = '',
  } = defineProps<{
    ship: Ship
    /** Whether this sheet is held by a click rather than following the pointer. */
    pinned?: boolean
    /** Whether this window has a shell. False in a browser, where the buttons would only fail. */
    canAct?: boolean
    busy?: boolean
    /** What was pointed at on this ship — a demand, or a kind of mark. */
    quest?: Chosen | null
    /** What this machine can actually run. Anything absent is not drawn rather than disabled. */
    tools?: readonly ToolName[]
    /** What the forge said, from its own reading — absent where it was never asked. */
    stats?: ForgeStats | null
    /** When that reading was taken. Its own age, never the survey's. */
    forgeAt?: string
    /** When the whole fleet was last surveyed — this ship's age unless she has her own. */
    at?: string
  }>()

  /**
   * The two things a person decides about a repository, and the only two.
   *
   * Everything else on this sheet is measured; these are not, which is why they are the only
   * buttons on it. Archiving is what the register holds, and the register holds nothing else about
   * a ship — so there is no third one to add later without something changing shape first.
   */
  const emit = defineEmits<{
    measure: [string]
    archive: [boolean]
    enlist: [boolean]
    /** Which demand the reader pointed at, here or in the harbour — the same choice either way. */
    pick: [Chosen | null]
    tool: [ToolName]
    prune: [string]
    open: [string]
  }>()

  const binding = computed(() => orderedQuests(bindingQuests(ship)))
  const notApplicable = computed(() =>
    ship.quests.filter((quest) => quest.verdict === 'notApplicable'),
  )
  const origin = computed(() => originOf(ship.remotes))
  /*
   * Every remote besides origin, each with what it *is* beside it.
   *
   * The list used to be called `mirrors` and every entry carried the word "(Spiegel)". Measured on
   * this fleet that was wrong for 17 of 21: six are foreign histories merged in, and eleven are a
   * different repository of the same line — four of those confirmed forks of
   * `Leuchtturm-Verbund/Leuchtturm-Deploy-Rebranding`. Calling an upstream a mirror said
   * the opposite of the truth: a mirror holds the same work and may be ignored, an origin is where
   * a change belongs.
   */
  const others = computed(() =>
    mirrorsOf(ship.remotes).map((remote) => ({
      ...remote,
      told: tell(lineageOf(ship.lineage, remote.name), stats, remote.url),
    })),
  )
  const checks = computed(() => contractChecks(ship.contract))
  const points = computed(() => shipPoints(ship))

  /**
   * When this ship was last read: her own time where she has one, the survey's otherwise.
   *
   * `measuredAt` is set where one repository was measured on its own, which makes her younger
   * than the picture around her. A full survey leaves it unset, and then the snapshot's time is
   * hers as much as everybody's.
   */
  const readAt = computed(() => {
    const when = ship.measuredAt ?? at
    return when === '' ? null : new Date(when).toLocaleString('de-DE')
  })

  /**
   * The score as a bill: what was counted, how many, at what rate.
   *
   * Four sums with the weights living in `points.ts` meant that "why does this repository score
   * 26 831" was a question only the source could answer. The counts are measurements and the
   * rates are decisions — two different kinds of entry, and a reader is allowed to argue with the
   * second.
   */
  const bill = computed(() => pointLines(ship))

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

  /**
   * How much room the sticky header takes, as a CSS variable the rows scroll clear of.
   *
   * Measured from the element and not written down: the header changes height when it shrinks,
   * again when the action buttons are absent, and again for a two-line repository name. A row that
   * scrolled to the top landed *underneath* it — chosen, and invisible. `scroll-margin-top` is
   * what `scrollIntoView` respects, and it is the only mechanism that works whichever of the three
   * components did the scrolling.
   *
   * A `ResizeObserver` rather than a measurement on scroll: the height changes because the header
   * changed, not because the panel moved, and reading a layout property in a scroll handler is how
   * a panel starts stuttering.
   */
  const head = useTemplateRef<HTMLElement>('head')
  const measured = ref(0)

  onMounted(() => {
    if (head.value === null) {
      return
    }
    const watcher = new ResizeObserver(([entry]) => {
      measured.value = entry?.target.getBoundingClientRect().height ?? 0
    })
    watcher.observe(head.value)
    onBeforeUnmount(() => {
      watcher.disconnect()
    })
  })

  /**
   * A little more than the header is tall.
   *
   * Two reasons it has to be more, and both showed up as a row clipped along its top edge. The
   * header *shrinks* as the scroll happens, so at the moment the browser computes where to stop it
   * is still measuring the tall one — and the marked row is drawn with a ring a pixel outside its
   * own box, which a margin of exactly the header's height cuts through.
   */
  const CLEARANCE = 10
  const headroom = computed(() => measured.value + CLEARANCE)

  const sheet = useTemplateRef<HTMLElement>('sheet')

  const onScroll = (event: Event): void => {
    scrolled.value = (event.target as HTMLElement).scrollTop > 12
  }

  /**
   * A click on the small plan, on nothing in particular, takes the sheet back to the top.
   *
   * The plan shrinks to a thumbnail once the reader is down among the rows, and at that size it is
   * too small to read — but it is the thing on screen that says "the ship". Clicking it to get the
   * full drawing back is what somebody tries; before, it cleared the choice instead, which is the
   * opposite of what a click on a picture of the ship should do.
   *
   * Only on a background click: a box hands up its own choice and never reaches here, so the two
   * gestures do not compete.
   */
  const backToTop = (pick: Chosen | null): void => {
    if (pick === null && scrolled.value) {
      sheet.value?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    emit('pick', pick)
  }
</script>

<template>
  <!-- A datasheet, not a dashboard: every row is a measurement with its source. -->
  <article
    ref="sheet"
    class="flex h-full flex-col overflow-y-auto scroll-smooth bg-slate-900/60 text-sm [&_[data-row]]:scroll-mt-[var(--headroom)]"
    :style="{ '--headroom': `${String(Math.round(headroom))}px` }"
    @scroll="onScroll"
  >
    <!--
      Sticky: the name is what tells a reader which repository the rest of the sheet is about,
      and it scrolled away exactly when the list below got long enough to need it.
    -->
    <header
      ref="head"
      class="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 px-4 transition-[padding] duration-150"
      :class="scrolled ? 'py-1.5' : 'py-3'"
    >
      <p
        v-if="!scrolled"
        class="flex items-baseline gap-2 font-mono text-[11px] tracking-widest uppercase"
      >
        <span class="text-ink-muted">Schiffsdatenblatt</span>
        <!-- Said out loud: a panel that silently stops following the pointer looks broken. -->
        <span v-if="pinned" class="text-ink-muted normal-case">festgehalten</span>
        <span v-else class="text-ink-faint normal-case">anklicken hält fest</span>
      </p>
      <h2
        class="font-mono break-words text-ink-strong"
        :class="scrolled ? 'text-sm' : 'mt-1 text-base'"
      >
        {{ ship.org }}/{{ ship.name }}
      </h2>
      <!-- The path is the first thing to go: it is long, and it does not change while reading. -->
      <p v-if="!scrolled" class="mt-1 text-xs text-ink-muted">{{ ship.path }}</p>

      <!--
        One plan, and it lives here.
        It was two — a big one in a section below and a small one that appeared in the header once
        that had scrolled away — and for a moment both were on screen, which looked like a bug
        because it was one. What is marked has to stay visible while the reader is down among the
        rows that explain it, so the plan belongs where the name is: in the part that stays put.
      -->
      <ShipPlan
        class="transition-[max-height] duration-150"
        :class="scrolled ? 'mt-1 max-h-12 cursor-zoom-in' : 'mt-2 max-h-36'"
        :ship="ship"
        :chosen="chosenQuest"
        :stats="stats"
        :title="scrolled ? 'Ganz nach oben — Plan in voller Größe' : undefined"
        @pick="backToTop"
      />

      <!--
        Two buttons, and both act on this one repository rather than on the fleet: measuring all
        ninety to learn what one of them just did is the reason refreshing felt like something to
        avoid. Neither touches the repository — one reads it, the other writes a line in the
        register.
      -->
      <p
        v-if="canAct"
        class="flex gap-3 font-mono text-[11px]"
        :class="scrolled ? 'mt-0.5' : 'mt-2'"
      >
        <button
          class="text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:text-ink-off disabled:no-underline"
          :disabled="busy"
          title="Nur dieses Repository neu messen"
          @click="emit('measure', ship.path)"
        >
          {{ busy ? 'misst …' : 'neu messen' }}
        </button>
        <!--
          When *this* ship was read, beside the button that reads her again.
          One time and not two: either she was measured on her own since the last survey, or the
          survey is her answer. The header carries the fleet's age and this carries hers — the two
          are different questions and only this one is about the sheet somebody is reading.
        -->
        <span v-if="readAt !== null" class="text-ink-faint">gemessen {{ readAt }}</span>
        <button
          class="text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:text-ink-off disabled:no-underline"
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
          class="text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:text-ink-off disabled:no-underline"
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
        <p class="text-[11px] tracking-wide text-ink-faint uppercase">Lage</p>
        <p class="text-ink">{{ STAGE_LABEL[ship.stage] }}</p>
        <p class="text-[11px] text-ink-faint">{{ STAGE_MEANING[ship.stage] }}</p>
      </div>
      <div>
        <p class="text-[11px] tracking-wide text-ink-faint uppercase">Liegezeit</p>
        <p class="text-ink">{{ ageLabel(ship.rustDays) }}</p>
        <p class="text-[11px] text-ink-faint">{{ RUST_LABEL[rustLevel(ship.rustDays)] }}</p>
      </div>
      <div>
        <p class="text-[11px] tracking-wide text-ink-faint uppercase">Branch</p>
        <p class="font-mono text-xs text-ink">
          {{ ship.branch ?? '—' }}<span v-if="ship.dirty" class="text-amber-500"> *</span>
        </p>
        <p v-if="ship.ahead !== null || ship.behind !== null" class="text-[11px] text-ink-faint">
          {{ ship.ahead ?? 0 }} voraus, {{ ship.behind ?? 0 }} zurück
        </p>
        <!-- No upstream is an answer, and not the same as being level with one. -->
        <p v-else class="text-[11px] text-ink-faint">kein Upstream</p>
      </div>
      <div>
        <p class="text-[11px] tracking-wide text-ink-faint uppercase">Worktrees</p>
        <p class="text-ink">{{ ship.docks.length }}</p>
      </div>
    </section>

    <!-- Counts beside the score, so the weighting can be argued with rather than believed. -->
    <section class="border-b border-slate-800 px-4 py-3">
      <p class="text-[11px] tracking-wide text-ink-faint uppercase">Geleistet</p>
      <p><PointValue :project="points.project" :personal="points.own" /></p>
      <p class="text-[11px] text-ink-faint">
        {{ ship.ledger.total.commits }} Commits · {{ ship.ledger.total.pulls }} PRs ·
        {{ ship.ledger.total.authors }} {{ ship.ledger.total.authors === 1 ? 'Autor' : 'Autoren' }}
      </p>
      <p v-if="ship.ledger.total.unscored > 0" class="text-[11px] text-ink-faint">
        {{ ship.ledger.total.unscored }} ohne Convention
      </p>

      <!--
        Where the project score came from.
        The whole figure looked like a commit counter, and mostly was: with a hundred thousand
        commits against two hundred checks, no weight a check could honestly carry would show up
        in one number. Saying what went in is what fixes that — not inflating the smaller terms
        until they look important. A term worth nothing is left out rather than written as zero.
      -->
      <!--
        The bill, in two columns of figures: what the repository counted, and what of it is yours.
        "Autoren 2.200" used to stand alone under "110 Autoren" and read as a second, wrong author
        count; then the footer said "davon deine" under a sum three of whose terms nobody can hold
        a share of, which suggested the rest was merely outstanding. A dash says "nobody's" where
        a nought would say "none of yours yet".
      -->
      <p class="mt-1.5 text-[11px] tracking-wide text-ink-faint uppercase">Punkteabrechnung</p>
      <table class="mt-0.5 w-full font-mono text-[11px]">
        <thead>
          <tr class="text-[11px] text-ink-faint">
            <th class="text-left font-normal" colspan="3">das Repo</th>
            <th class="text-right font-normal">Punkte</th>
            <th class="pl-2 text-right font-normal text-emerald-300/80">deine</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in bill" :key="line.name">
            <td class="text-ink-faint">{{ line.name }}</td>
            <td class="text-right text-ink-muted">{{ line.count.toLocaleString('de-DE') }}</td>
            <td class="text-right text-ink-faint">× {{ line.rate }}</td>
            <td class="text-right text-ink-muted">{{ line.points.toLocaleString('de-DE') }}</td>
            <td
              class="pl-2 text-right"
              :class="line.own === null ? 'text-ink-faint' : 'text-emerald-300/80'"
              :title="
                line.own === null
                  ? `${line.name} gehört dem Repository — daran hat niemand einen Anteil`
                  : `${line.own.count.toLocaleString('de-DE')} davon von dir`
              "
            >
              {{ line.own === null ? '—' : line.own.points.toLocaleString('de-DE') }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t border-slate-800">
            <td class="text-ink-faint" colspan="3">Projektpunkte</td>
            <td class="text-right text-sky-300">
              {{ points.project.toLocaleString('de-DE') }}
            </td>
            <td class="pl-2 text-right text-emerald-300">
              {{ points.own.toLocaleString('de-DE') }}
            </td>
          </tr>
        </tfoot>
      </table>
      <!--
        And the half of the reader's score that no ship can show.
        Breadth, tidiness and met demands are properties of *keeping a fleet*: they are counted
        once over all of it and belong to no single repository. Without this sentence the column
        above reads as the whole of what a person is worth, and it is not even its own total.
      -->
      <p class="mt-1 text-[11px] text-ink-faint">
        Deine Punkte sind nur Commits und PRs. Autoren, Prüfungen und CI gehören dem Repository —
        daran hat niemand einen Anteil. Breite, Ordnung und erfüllte Forderungen zählen über die
        ganze Flotte und stehen in keinem einzelnen Schiff.
      </p>
    </section>

    <!--
      What the forge says, right under what the repository did.
      It stood under the test contract, five sections down, where the one reading that is about
      *other people* — who watches this, what they have opened — was the last thing anybody saw.
      Two readings of the same work belong next to each other; their ages are said separately.
    -->
    <ForgeFacts
      v-if="stats !== null"
      :stats="stats"
      :at="forgeAt"
      :chosen="chosenQuest"
      @open="emit('open', $event)"
    />

    <section class="border-b border-slate-800 px-4 py-3">
      <p class="text-[11px] tracking-wide text-ink-faint uppercase">Remotes</p>
      <p v-if="origin === null" class="text-ink-muted">kein origin</p>
      <template v-else>
        <p class="font-mono text-xs break-all text-ink">{{ origin.name }} · {{ origin.url }}</p>
        <p class="text-[11px] text-ink-faint">Forge: {{ origin.forge }}</p>
      </template>
      <!--
        Each further remote with what it is, and the measurement under it.
        A word alone would be a kept status field again: the counts are what makes it checkable,
        and `ungewiss` with its reason is a better answer than a confident wrong one.
      -->
      <div v-for="other in others" :key="other.name" class="mt-1">
        <p class="font-mono text-xs break-all text-ink-muted">
          {{ other.name }} · {{ other.url }}
          <span
            v-if="other.told !== null"
            :class="other.told.fromForge ? 'text-sky-500' : 'text-ink-faint'"
          >
            {{ other.told.mark }} {{ other.told.word }}
          </span>
        </p>
        <p v-if="other.told !== null" class="text-[11px] text-ink-faint">
          {{ other.told.because }}
        </p>
      </div>
    </section>

    <section class="border-b border-slate-800 px-4 py-3">
      <p class="text-[11px] tracking-wide text-ink-faint uppercase">Test-Vertrag</p>
      <p class="text-[11px] text-ink-faint">
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
            class="font-mono text-xs text-ink-muted"
          >
            {{ check.dir }} · {{ check.script }}
          </li>
        </ul>
      </template>
      <p v-if="ship.contract.inCi.length > 0" class="mt-1 text-[11px] text-ink-faint">
        in CI: {{ ship.contract.inCi.join(', ') }}
      </p>
    </section>

    <ShipMarks :ship="ship" :chosen="chosenQuest" @pick="emit('pick', $event)" />

    <ShipTools
      :ship="ship"
      :available="tools"
      :busy="busy"
      @tool="emit('tool', $event)"
      @prune="emit('prune', $event)"
    />

    <TaskList :tasks="doing" />

    <section class="px-4 py-3">
      <p class="text-[11px] tracking-wide text-ink-faint uppercase">
        Quests <span class="text-ink-faint">— {{ binding.length }} bindend</span>
      </p>

      <div v-if="binding.length === 0" class="mt-2 text-ink-muted">
        Keine Forderung der Flotte gilt für dieses Schiff.
      </div>
      <div v-else class="mt-1">
        <QuestRow
          v-for="demand in binding"
          :key="demand.id"
          :quest="demand"
          :own="ship.ownQuests.includes(demand.id)"
          :task="taskForQuest(ship, demand.id)"
          :chosen="isQuest(chosenQuest, demand.id)"
          @choose="emit('pick', $event === null ? null : { kind: 'quest', id: $event })"
        />
      </div>

      <!-- Counted, not listed: the right answer, and noise at length. -->
      <p v-if="notApplicable.length > 0" class="mt-3 text-[11px] text-ink-faint">
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
