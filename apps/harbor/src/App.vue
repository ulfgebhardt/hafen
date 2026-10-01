<script setup lang="ts">
  import { computed, onErrorCaptured, onMounted, ref, watch } from 'vue'

  import {
    bandOf,
    byBand,
    CONTRACTS,
    draws,
    firstBand,
    FLEET,
    isBand,
    viewOf,
  } from './components/band'
  import BandTabs from './components/BandTabs.vue'
  import ContractList from './components/ContractList.vue'
  import { filterByContract } from './components/contracts'
  import FleetBar from './components/FleetBar.vue'
  import HarborScene from './components/HarborScene.vue'
  import { filterShips } from './components/search'
  import ShipSheet from './components/ShipSheet.vue'
  import {
    availableTools,
    deleteBranch,
    inTauri,
    loadSnapshot,
    loadForge,
    openForge,
    refetchForge,
    remeasure,
    setRegister,
    SnapshotError,
    startTool,
    statsFor,
  } from './snapshot'

  import type { Page, View } from './components/band'
  import type { Chosen } from './components/chosen'
  import type { ContractFilter } from './components/contracts'
  import type { ToolName } from './components/tools'
  import type { Forge, RegisterAction, Snapshot } from './snapshot'
  import type { Ship } from '@hafen/core'

  const snapshot = ref<Snapshot | null>(null)
  const source = ref<string>('')
  const failed = ref<SnapshotError | null>(null)
  /**
   * What the sheet shows: what was clicked, or failing that what the pointer is over.
   *
   * A pinned ship wins over a hovered one and keeps winning until something else is clicked or a
   * click lands on open water. Reading a datasheet used to be impossible — every hull crossed on
   * the way to it replaced the text.
   */
  const picked = ref<Ship | null>(null)
  const hovered = ref<Ship | null>(null)
  /**
   * What was pointed at on the chosen ship — a demand, or a kind of mark.
   *
   * One choice for both directions: the drawing marks it and the sheet scrolls to it, whichever of
   * the two it was set from. Two states would disagree the first time somebody used both.
   */
  const demand = ref<Chosen | null>(null)
  const sheet = computed(() => picked.value ?? hovered.value)

  /**
   * Which page is open, and what is on it.
   *
   * Ninety hulls on one sheet answered "what is the fleet like" and nothing else. The question in
   * front of a person is about the handful they are working on, so the active ones get the page —
   * and the opening band is the first one with anything in it, because an empty page that has to
   * be clicked away is the kind of thing a tool does once.
   */
  const page = ref<Page>('active')
  const query = ref('')

  /**
   * Switching between the two questions the harbour answers.
   *
   * The ship being read comes along: she is on both pages, so the one place a reader could lose
   * her is exactly here. The band page is therefore hers and not the first non-empty one, and the
   * drawing centres on her once it is built — see `centre` on the scene.
   */
  const view = ref<View>('dock')
  const showView = (next: View): void => {
    view.value = next
    if (next === 'fleet') {
      page.value = FLEET
      return
    }
    const held = picked.value
    page.value = held === null ? firstBand(fleet.value) : bandOf(held)
  }

  /*
   * A page chosen anywhere else pulls the switch with it — except the catalog, which is in both.
   * Without this, opening the first band after a snapshot is read would leave the buttons saying
   * "Flotte" over the band tabs.
   */
  watch(page, (next) => {
    if (next !== CONTRACTS) {
      view.value = viewOf(next)
    }
  })

  /**
   * Which demand the basin is narrowed to, picked on the catalog page.
   *
   * A second filter of the same kind as the search and applied in the same place, so the tab
   * counts, the points beside them and the header all keep describing what is on screen. Picking
   * a row therefore *leaves* the catalog: the answer to "who still owes this" is a harbour, and
   * showing it on the page that asked would have been two answers in one column.
   */
  const contract = ref<ContractFilter | null>(null)

  const chooseContract = (filter: ContractFilter): void => {
    contract.value = filter
    page.value = firstBand(filterByContract(fleet.value, filter))
    /*
     * And the demand travels with the pick.
     *
     * Somebody who clicked `typecheck` is reading about `typecheck`; every datasheet they open
     * next should already be at that line rather than at the top of thirteen. It is the same
     * `Chosen` the drawing and the sheet already share, so this sets one state and not a third.
     */
    demand.value = { kind: 'quest', id: filter.id }
  }

  /**
   * The fleet the whole window is about, once the filter has had it.
   *
   * Filtered *before* the bands and not after, so the tab counts, the points beside them and the
   * figures in the header all describe what is actually on screen. They described the whole fleet
   * at first, on the argument that a tab answers a question about the fleet — and that was wrong
   * in use: a filter that leaves three ships and a tab that still says 41 is a window disagreeing
   * with itself, and the reader has no way to tell which half to believe.
   */
  const fleet = computed(() =>
    snapshot.value === null ? [] : filterShips(snapshot.value.ships, query.value),
  )
  /**
   * The catalog is tallied before the contract filter and the basin after it.
   *
   * Deliberately different inputs. A row that counted only the ships its own pick left would
   * collapse to "32 verletzt, 32 im Geltungsbereich" the moment somebody clicked it — the page
   * would answer a question nobody asked and lose the one it exists for.
   */
  const narrowed = computed(() => filterByContract(fleet.value, contract.value))

  /**
   * Which of the two harbours is drawn, and it follows the page rather than a switch.
   *
   * Lanes pack tighter — measured, the same 64 berths in 418 × 323 against 558 × 618 — and a fan
   * cannot be packed that way, because a walkway at an angle needs the gaps a wedge has and a
   * rectangle does not. So the band pages, which are about *what is on this page*, get the tight
   * one; the fleet page, which is about *who owns what*, gets the one that can branch.
   */
  const layout = computed<'lanes' | 'fan'>(() => (page.value === FLEET ? 'fan' : 'lanes'))

  /**
   * The forge reading keyed by ship, for the drawing.
   *
   * Built here and not in the scene, because `statsFor` already knows how a remote maps onto a
   * slug and a second implementation of that would be a second opinion. Empty until somebody
   * presses the button, which is what an unlit fleet means.
   */
  const forgeByPath = computed(
    () =>
      new Map(
        fleet.value.flatMap((ship) => {
          const stats = statsFor(forge.value, ship)
          return stats === null ? [] : [[ship.path, stats] as const]
        }),
      ),
  )
  /**
   * What the drawing gets.
   *
   * The fleet page skips the band split on purpose — that is the whole of its job. It still
   * honours the search and the contract pick, because those are things a reader asked for; the
   * bands are not, they are how the other pages are arranged.
   */
  const shown = computed(() =>
    page.value === FLEET
      ? narrowed.value
      : isBand(page.value)
        ? byBand(narrowed.value)[page.value]
        : [],
  )

  /**
   * Whether this window can measure and write at all.
   *
   * False in a browser, where there is no shell — and then the buttons are absent rather than
   * disabled: a button that explains in the click why it cannot work is worse than no button.
   */
  const canAct = inTauri()
  const busy = ref(false)
  /** What this machine can run, asked once — a button that fails in the click is worse than none. */
  const tools = ref<readonly ToolName[]>([])
  /**
   * What the forges said, in its own state with its own age.
   *
   * Never merged into the snapshot: the survey is six seconds of disk and this is seventeen of
   * network, so folding one into the other would give the older figure the younger timestamp.
   */
  const forge = ref<Forge>({ at: '', stats: [], unread: [] })
  /** What the last action said when it failed. Shown in the bar, never swallowed. */
  const trouble = ref<string | null>(null)

  /**
   * Measure again — the whole fleet, or the one repository named.
   *
   * The picture is replaced whole when it comes back rather than patched as it goes: a harbour
   * half of which is from a minute ago is a harbour whose timestamp is a lie about half of it.
   */
  const measure = async (only?: string): Promise<void> => {
    if (snapshot.value === null || busy.value) {
      return
    }
    busy.value = true
    trouble.value = null
    try {
      snapshot.value = await remeasure(snapshot.value, only)
    } catch (error) {
      trouble.value = error instanceof Error ? error.message : String(error)
    } finally {
      busy.value = false
    }
  }

  /**
   * Put a repository away, or fetch it back.
   *
   * `archived` is not flipped here: the register decides it and the ship carries it, so the answer
   * comes back from a fresh measurement of that one repository. Two opinions about a file that was
   * just written is exactly the kept status field the whole tool is built to avoid.
   */
  const act = async (action: RegisterAction, path: string): Promise<void> => {
    if (snapshot.value === null || busy.value) {
      return
    }
    busy.value = true
    trouble.value = null
    try {
      snapshot.value = await setRegister(snapshot.value, action, path)
    } catch (error) {
      trouble.value = error instanceof Error ? error.message : String(error)
    } finally {
      busy.value = false
    }
  }

  const archive = async (path: string, away: boolean): Promise<void> => {
    await act(away ? 'archivieren' : 'reaktivieren', path)
  }

  /**
   * Take a directory on, or stop holding it.
   *
   * The register's other half. Adopting one is the only action in the window that names a path
   * nobody clicked on — there is nothing to click, because the whole point is a directory the
   * survey does not find.
   */
  const enlist = async (path: string, hold: boolean): Promise<void> => {
    await act(hold ? 'aufnehmen' : 'entfernen', path)
  }

  /**
   * Open a tool where the ship lies.
   *
   * Nothing is re-measured afterwards for the four that hand over: they outlive the click, and a
   * measurement taken a second after lazygit opened would say what it said before. `prune` does
   * change something, so it ends with a fresh reading of that one repository.
   */
  const useTool = async (name: ToolName, path: string): Promise<void> => {
    if (busy.value) {
      return
    }
    busy.value = true
    trouble.value = null
    try {
      await startTool(name, path)
      if (name === 'prune' && snapshot.value !== null) {
        snapshot.value = await remeasure(snapshot.value, path)
      }
    } catch (error) {
      trouble.value = error instanceof Error ? error.message : String(error)
    } finally {
      busy.value = false
    }
  }

  /**
   * Ask the forges again.
   *
   * Its own button beside its own timestamp, for the same reason it is its own command: it goes to
   * the network, it takes about seventeen seconds over this fleet, and nothing about the harbour
   * being drawn should wait on it.
   */
  const askForges = async (): Promise<void> => {
    if (busy.value) {
      return
    }
    busy.value = true
    trouble.value = null
    try {
      forge.value = await refetchForge()
      const unread = forge.value.unread.length
      if (unread > 0) {
        trouble.value = `${String(unread)} Repositories konnten nicht gefragt werden — zuerst: ${
          forge.value.unread[0]?.reason ?? ''
        }`
      }
    } catch (error) {
      trouble.value = error instanceof Error ? error.message : String(error)
    } finally {
      busy.value = false
    }
  }

  /** Open a forge page. The host is checked on the Rust side against a closed list. */
  const visit = async (url: string): Promise<void> => {
    try {
      await openForge(url)
    } catch (error) {
      trouble.value = error instanceof Error ? error.message : String(error)
    }
  }

  /** Delete one branch, then read that repository again so the list it came from is current. */
  const prune = async (path: string, branch: string): Promise<void> => {
    if (snapshot.value === null || busy.value) {
      return
    }
    busy.value = true
    trouble.value = null
    try {
      await deleteBranch(path, branch)
      snapshot.value = await remeasure(snapshot.value, path)
    } catch (error) {
      trouble.value = error instanceof Error ? error.message : String(error)
    } finally {
      busy.value = false
    }
  }

  /**
   * A panel that could not draw says so.
   *
   * Measured the hard way: a snapshot written before `branches` existed made the datasheet throw,
   * and what a reader saw was an empty column — no message, no clue, and nothing to type into a
   * search. Every field added to `Ship` can do that to every snapshot already on disk. Caught here
   * and not swallowed: the harbour keeps drawing, and the reason stands in the bar with the remedy
   * beside it.
   */
  // eslint-disable-next-line promise/prefer-await-to-callbacks -- Vue's error hook is a callback
  onErrorCaptured((error) => {
    trouble.value = `Datenblatt nicht zeichenbar: ${error.message}\nMoeglicherweise ist der Schnappschuss aelter als dieses Fenster — einmal neu messen.`
    picked.value = null
    hovered.value = null
    return false
  })

  onMounted(async () => {
    try {
      const loaded = await loadSnapshot()
      snapshot.value = loaded.snapshot
      source.value = loaded.source
      page.value = firstBand(loaded.snapshot.ships)
    } catch (error) {
      /**
       * Named, never blank. An empty harbor and a snapshot that could not be read are different
       * sentences, and a window that shows nothing for both lies about the one a human could
       * have fixed — so the message carries where it looked and what to type.
       */
      failed.value =
        error instanceof SnapshotError
          ? error
          : new SnapshotError(String(error), '(unbekannt)', 'hafen schnappschuss')
    }

    // After the picture and never before it: which tools exist is a detail of one panel, and a
    // harbour that would not draw because a tool list was slow would have the priorities backwards.
    tools.value = await availableTools()
    // After the picture too: a reading that was never taken is an empty panel, not an error.
    forge.value = await loadForge()
  })
</script>

<template>
  <div class="flex h-screen w-screen flex-col bg-slate-950 text-slate-300">
    <template v-if="snapshot !== null">
      <FleetBar
        :ships="narrowed"
        :at="snapshot.at"
        :source="source"
        :can-measure="canAct"
        :busy="busy"
        :forge-at="forge.at"
        @measure="measure()"
        @enlist="enlist($event, true)"
        @forge="askForges"
      />
      <BandTabs
        v-model:page="page"
        v-model:view="view"
        v-model:query="query"
        :ships="narrowed"
        :contract="contract"
        @clear="contract = null"
        @view="showView"
      />

      <!--
        Said out loud, because an empty basin and a filter that matched nothing look identical —
        and only one of the two has a remedy the reader can act on.
      -->
      <p
        v-if="draws(page) && shown.length === 0 && (query.trim() !== '' || contract !== null)"
        class="border-b border-slate-800 px-4 py-1 font-mono text-xs text-slate-500"
      >
        <!--
          The contract filter says its own sentence and never borrows the search's. A pick that
          left the basin empty is a *finding* — nobody on this page owes that demand — and reading
          "kein Schiff passt zu ''" for it would be the window describing the wrong filter.
        -->
        <template v-if="contract !== null && narrowed.length === 0"
          >Kein Schiff schuldet {{ contract.id
          }}{{ query.trim() === '' ? '' : ` und passt zu „${query}“` }}.</template
        >
        <template v-else-if="contract !== null"
          >Auf dieser Seite schuldet keines {{ contract.id }} —
          {{ narrowed.length }} anderswo.</template
        >
        <template v-else-if="fleet.length === 0">Kein Schiff passt zu „{{ query }}“.</template>
        <template v-else
          >Auf dieser Seite passt keines zu „{{ query }}“ — {{ fleet.length }} anderswo.</template
        >
      </p>

      <!--
        Said and not swallowed: an action that quietly did nothing is the worst of the three. It
        can be put away, though — a message that only the next successful action clears is one that
        sits over the picture for as long as somebody is reading about why it failed.
      -->
      <div
        v-if="trouble !== null"
        class="flex items-start gap-2 border-b border-red-900 py-1 pr-2 pl-4 font-mono text-xs text-red-400"
      >
        <p class="min-w-0 flex-1 whitespace-pre-line">{{ trouble }}</p>
        <!--
          Beside the first line and not centred in the block: a two-line message put the × halfway
          down and an arm's length from the text, which reads as belonging to nothing. `leading-*`
          rather than a margin, so it sits on the baseline of the line it closes whatever the
          message turns out to be.
        -->
        <button
          class="shrink-0 px-1 leading-5 text-red-600/70 hover:text-red-300"
          title="Meldung wegklicken"
          @click="trouble = null"
        >
          ×
        </button>
      </div>

      <div class="flex min-h-0 flex-1">
        <main class="min-w-0 flex-1">
          <!--
            The catalog is tallied off `fleet` and not `narrowed`, so its rows keep counting the
            whole fleet the search left. Picking one narrows the *basin*, which is the next thing
            the reader sees.
          -->
          <ContractList
            v-if="page === CONTRACTS"
            :ships="fleet"
            :picked="contract"
            @pick="chooseContract"
          />
          <!-- Keyed on the page: a new page is a new drawing, not the old one panned. -->
          <HarborScene
            v-else-if="draws(page)"
            :key="`${page}:${query}:${contract?.id ?? ''}:${contract?.verdict ?? ''}`"
            v-model:picked="picked"
            v-model:hovered="hovered"
            v-model:quest="demand"
            :forge="forgeByPath"
            :layout="layout"
            :ships="shown"
            :centre="picked"
          />
        </main>

        <aside class="w-96 shrink-0 border-l border-slate-800">
          <ShipSheet
            v-if="sheet !== null"
            :ship="sheet"
            :pinned="picked !== null"
            :can-act="canAct"
            :busy="busy"
            :quest="picked === null ? null : demand"
            :tools="tools"
            :stats="statsFor(forge, sheet)"
            :forge-at="forge.at"
            @measure="measure($event)"
            @archive="archive(sheet.path, $event)"
            @enlist="enlist(sheet.path, $event)"
            @pick="demand = $event"
            @tool="useTool($event, sheet.path)"
            @prune="prune(sheet.path, $event)"
            @open="visit($event)"
          />
          <p v-else class="px-4 py-6 text-sm text-slate-600">
            Ein Schiff anfahren, um sein Datenblatt zu lesen — anklicken hält es fest.
          </p>
        </aside>
      </div>
    </template>

    <section v-else-if="failed !== null" class="p-6 font-mono text-sm">
      <p class="text-red-400">Kein Schnappschuss: {{ failed.message }}</p>
      <p class="mt-2 text-slate-500">Gesucht in {{ failed.source }}</p>
      <p class="mt-4 text-slate-400">Erzeugen mit:</p>
      <p class="mt-1 text-slate-300">{{ failed.remedy }}</p>
    </section>

    <p v-else class="p-6 text-sm text-slate-600">wird gelesen …</p>
  </div>
</template>
