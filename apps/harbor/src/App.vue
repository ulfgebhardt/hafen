<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'

  import { byBand, firstBand } from './components/band'
  import BandTabs from './components/BandTabs.vue'
  import FleetBar from './components/FleetBar.vue'
  import HarborScene from './components/HarborScene.vue'
  import ShipSheet from './components/ShipSheet.vue'
  import {
    availableTools,
    deleteBranch,
    inTauri,
    loadSnapshot,
    remeasure,
    setRegister,
    SnapshotError,
    startTool,
  } from './snapshot'

  import type { Band } from './components/band'
  import type { ToolName } from './components/tools'
  import type { RegisterAction, Snapshot } from './snapshot'
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
  /** The demand whose box was clicked, so the sheet can open that row rather than the whole list. */
  const demand = ref<string | null>(null)
  const sheet = computed(() => picked.value ?? hovered.value)

  /**
   * Which page is open, and what is on it.
   *
   * Ninety hulls on one sheet answered "what is the fleet like" and nothing else. The question in
   * front of a person is about the handful they are working on, so the active ones get the page —
   * and the opening band is the first one with anything in it, because an empty page that has to
   * be clicked away is the kind of thing a tool does once.
   */
  const band = ref<Band>('active')
  const shown = computed(() =>
    snapshot.value === null ? [] : byBand(snapshot.value.ships)[band.value],
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

  onMounted(async () => {
    try {
      const loaded = await loadSnapshot()
      snapshot.value = loaded.snapshot
      source.value = loaded.source
      band.value = firstBand(loaded.snapshot.ships)
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
  })
</script>

<template>
  <div class="flex h-screen w-screen flex-col bg-slate-950 text-slate-300">
    <template v-if="snapshot !== null">
      <FleetBar
        :ships="snapshot.ships"
        :at="snapshot.at"
        :source="source"
        :can-measure="canAct"
        :busy="busy"
        @measure="measure()"
        @enlist="enlist($event, true)"
      />
      <BandTabs v-model:band="band" :ships="snapshot.ships" />

      <!--
        Said and not swallowed: an action that quietly did nothing is the worst of the three. It
        can be put away, though — a message that only the next successful action clears is one that
        sits over the picture for as long as somebody is reading about why it failed.
      -->
      <div
        v-if="trouble !== null"
        class="flex items-start gap-3 border-b border-red-900 px-4 py-1 font-mono text-xs text-red-400"
      >
        <p class="min-w-0 flex-1 whitespace-pre-line">{{ trouble }}</p>
        <button
          class="shrink-0 text-red-600 hover:text-red-300"
          title="Meldung wegklicken"
          @click="trouble = null"
        >
          ×
        </button>
      </div>

      <div class="flex min-h-0 flex-1">
        <main class="min-w-0 flex-1">
          <!-- Keyed on the band: a new page is a new drawing, not the old one panned. -->
          <HarborScene
            :key="band"
            v-model:picked="picked"
            v-model:hovered="hovered"
            v-model:quest="demand"
            :ships="shown"
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
            @measure="measure($event)"
            @archive="archive(sheet.path, $event)"
            @enlist="enlist(sheet.path, $event)"
            @pick="demand = $event"
            @tool="useTool($event, sheet.path)"
            @prune="prune(sheet.path, $event)"
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
