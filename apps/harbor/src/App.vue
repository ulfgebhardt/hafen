<script setup lang="ts">
  import { computed, onErrorCaptured, onMounted, ref, watch } from 'vue'

  import {
    bandOf,
    CONTRACTS,
    draws,
    firstBand,
    FLEET,
    FLEET_ARCHIVE,
    fleetPageFor,
    isFleet,
    pageFor,
    shipsOn,
    viewOf,
  } from './components/band'
  import BandTabs from './components/BandTabs.vue'
  import { canSurvey, forgeNote } from './components/bordmittel'
  import { chosenKey } from './components/chosen'
  import ContractList from './components/ContractList.vue'
  import { filterByContract } from './components/contracts'
  import FirstRun from './components/FirstRun.vue'
  import FleetBar from './components/FleetBar.vue'
  import HarborScene from './components/HarborScene.vue'
  import NoGit from './components/NoGit.vue'
  import { NO_ROOTS, rootRows } from './components/roots'
  import { filterShips } from './components/search'
  import ShipSheet from './components/ShipSheet.vue'
  import UpdateBanner from './components/UpdateBanner.vue'
  import {
    availableTools,
    currentPlaces,
    deleteBranch,
    inTauri,
    loadSnapshot,
    measuring,
    NOTHING_RUNNING,
    loadForge,
    openForge,
    refetchForge,
    remeasure,
    setRegister,
    setSearchRoot,
    SnapshotError,
    startTool,
    statsFor,
    stopMeasuring,
  } from './snapshot'
  import { askForRoot, bordmittel, needsRoots, readRoots, registerIn } from './survey'
  import { checkForUpdate, installUpdate, runningVersion } from './update'

  import type { Layout, Page, View } from './components/band'
  import type { Bordmittel } from './components/bordmittel'
  import type { Chosen } from './components/chosen'
  import type { ContractFilter } from './components/contracts'
  import type { Roots } from './components/roots'
  import type { ToolName } from './components/tools'
  import type { Hold } from './components/viewport'
  import type { Progress, Forge, RegisterAction, Snapshot } from './snapshot'
  import type { Places } from './survey'
  import type { Available } from './update'
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

  /**
   * Choosing the same thing twice lets go of it.
   *
   * One place and not two: the drawing and the sheet both hand a choice up here, and a toggle
   * implemented in either of them would be a toggle the other does not do. Compared by
   * `chosenKey`, because a click builds a fresh object every time and `===` on those is never
   * true — the same reason the templates compare by key rather than by identity.
   */
  const choose = (pick: Chosen | null): void => {
    demand.value = pick !== null && chosenKey(pick) === chosenKey(demand.value) ? null : pick
  }

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
   * Whether the search draws a harbour of its own instead of marking the whole one.
   *
   * A switch and not the default. Marking keeps the question a drawing exists for — where the
   * matches lie and what lies around them — and filtering trades it for a harbour that holds only
   * them: easier to read at twenty hits, and its kinship is then the kinship *among the matches*,
   * not the fleet's. Both are honest answers to different questions, so the reader picks one.
   */
  const onlyMatches = ref(false)

  /**
   * Switching between the two questions the harbour answers.
   *
   * The ship being read comes along: she is on both pages, so the one place a reader could lose
   * her is exactly here. The band page is therefore hers and not the first non-empty one, and the
   * drawing centres on her once it is built — see `centre` on the scene.
   */
  const view = ref<View>('dock')
  /** The drawing, so the place a ship holds on screen can be asked before it is swapped out. */
  const harbour = ref<{
    where?: (ship: Ship | null) => Hold | null
  } | null>(null)
  const hold = ref<Hold | null>(null)
  /**
   * Which fleet sheet was open last, so the fleet button comes back to it.
   *
   * Without the archive by default; a reader who opened the full sheet and went to look at a dock
   * should not have to open it again on the way back.
   */
  const lastFleet = ref<typeof FLEET | typeof FLEET_ARCHIVE>(FLEET)

  /**
   * Open a page, keeping where the ship being read stands and how large.
   *
   * Every page change a reader makes goes through here. The tabs set the page directly at first,
   * so a switch between the two fleet sheets drew the new one at "everything fits": the ship was
   * still marked, and a speck. Asked before the page changes, because the drawing she is in is
   * gone a tick later. Optional all the way down: on the catalog page there is no drawing at all,
   * and a page between two drawings has a ref that is not a scene yet.
   */
  const goTo = (next: Page): void => {
    hold.value = harbour.value?.where?.(picked.value) ?? null
    page.value = next
  }

  const showView = (next: View): void => {
    view.value = next
    if (next === 'fleet') {
      goTo(fleetPageFor(picked.value, lastFleet.value))
      return
    }
    if (next === 'contracts') {
      goTo(CONTRACTS)
      return
    }
    const held = picked.value
    goTo(held === null ? firstBand(fleet.value) : bandOf(held))
  }

  /*
   * A page chosen anywhere else pulls the switch with it: opening the first band after a snapshot
   * is read would otherwise leave the buttons saying "Flotte" over the band tabs, and picking a
   * demand in the catalog moves the reader to a band without the switch noticing.
   */
  watch(page, (next) => {
    view.value = viewOf(next)
    if (isFleet(next)) {
      lastFleet.value = next
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
  const fleet = computed(() => snapshot.value?.ships ?? [])

  /**
   * After a measurement, the ship being read is the measured one, and she is where she now is.
   *
   * `picked` held the object from before, so the datasheet went on reading the old figures; and a
   * measurement that moved her to another band left the page on the band she had left, where the
   * drawing no longer carried her. Looked up again by path, and the page follows her — keeping
   * where she stood and how large, the same as a switch between views.
   */
  watch(fleet, (ships) => {
    const before = picked.value
    if (before === null) {
      return
    }
    const now = ships.find((one) => one.path === before.path) ?? null
    picked.value = now
    if (now === null) {
      return
    }
    const next = pageFor(page.value, now)
    if (next !== page.value) {
      hold.value = harbour.value?.where?.(before) ?? null
      page.value = next
    }
  })

  /**
   * Whether this machine has ever been told where its projects are.
   *
   * Asked once, after the snapshot is in, and **not** derived from "the fleet is empty": a fleet
   * can honestly be empty — every repository archived, a root that holds nothing yet — and a
   * window that answered the first-run question to somebody who already answered it would be
   * asking them to say the same thing twice.
   */
  const unasked = ref(false)
  const places = ref<Places | null>(null)
  /**
   * What this machine can do. `null` until it has been asked — which is not the same as nothing.
   *
   * The harbour draws while the answer is on its way: a window that held its picture back for a
   * capability check would have the priorities backwards.
   */
  const aboard = ref<Bordmittel | null>(null)

  /**
   * Where the survey looks, as the disk answers for each root. Read again after every change to
   * the register's roots, never kept beside them.
   */
  const roots = ref<Roots>(NO_ROOTS)
  const rootList = computed(() => rootRows(roots.value, snapshot.value?.ships ?? []))

  /** The places, the register's answer to "where", and what the disk says about each root. */
  const lookAgain = async (): Promise<void> => {
    const where = await currentPlaces()
    places.value = where
    const register = await registerIn(where.store)
    unasked.value = needsRoots(where, register)
    roots.value = await readRoots(where, register)
  }

  /**
   * Take a root on or let it go, and measure the fleet across what is left.
   *
   * Letting go of the last one brings the first-run question back — derived from the register by
   * `lookAgain`, not decided here.
   */
  const changeRoot = async (path: string, searched: boolean): Promise<void> => {
    /*
     * No snapshot is no reason to stop here — it is the normal case. A machine nobody has told
     * where its projects are has never been measured either, and until 04.10.2026 this returned on
     * `snapshot === null` without a word: the first run asked, then dropped the answer.
     */
    if (busy.value) {
      return
    }
    busy.value = true
    trouble.value = null
    try {
      const first = snapshot.value === null
      snapshot.value = await setSearchRoot(snapshot.value, path, searched)
      if (first) {
        // The missing file was the reason to ask, not a failure to show once it is answered.
        failed.value = null
        source.value = places.value?.snapshot ?? ''
        page.value = firstBand(snapshot.value.ships)
      }
    } catch (error) {
      trouble.value = error instanceof Error ? error.message : String(error)
    } finally {
      busy.value = false
    }
    // After the survey and whatever it said: the register was written before it ran, so the list
    // follows the register even where the survey failed.
    try {
      await lookAgain()
    } catch (error) {
      trouble.value ??= error instanceof Error ? error.message : String(error)
    }
  }

  /**
   * Ask for a root and take it on — on the first run, and again from the bar for every further one.
   * One path for both, so a root added later is searched exactly like the first.
   */
  const askWhereTheProjectsAre = async (title?: string): Promise<void> => {
    const chosen = await askForRoot(title)
    if (chosen === null) {
      // They closed it. An answer, not a failure — and nothing is written for a question nobody
      // answered.
      return
    }
    await changeRoot(chosen, true)
  }

  /**
   * What the search found — **marked** in the drawing rather than filtered out of it.
   *
   * Filtering rebuilt the harbour out of whatever matched, which answers "what matched" and loses
   * the question a drawing exists for: where they are, and what lies around them. The fleet stays
   * whole, the matches are framed, and the view moves to hold exactly them. Filtering is still
   * there, as a switch the reader turns (`onlyMatches`) — and then there is nothing left to mark.
   */
  const found = computed(() =>
    query.value.trim() === '' || onlyMatches.value ? [] : filterShips(shown.value, query.value),
  )

  /** How many the search finds in the whole fleet — the useful half of "none on this page". */
  const matchesAnywhere = computed(() =>
    query.value.trim() === '' ? 0 : filterShips(fleet.value, query.value).length,
  )
  /**
   * The catalog is tallied before the contract filter and the basin after it.
   *
   * Deliberately different inputs. A row that counted only the ships its own pick left would
   * collapse to "32 verletzt, 32 im Geltungsbereich" the moment somebody clicked it — the page
   * would answer a question nobody asked and lose the one it exists for.
   */
  const narrowed = computed(() => {
    const owing = filterByContract(fleet.value, contract.value)
    // The search as a filter sits beside the contract pick and for the same reason: before the
    // bands, so the tabs, their points and the header count what is drawn.
    return onlyMatches.value && query.value.trim() !== '' ? filterShips(owing, query.value) : owing
  })

  /**
   * Which arrangement is drawn, and it follows the page rather than a switch.
   *
   * The band pages ask *what is on this page* and get the packed one. The fleet page asks *what
   * belongs with what*, and since `kin.ts` can answer that it gets one ring per project — the fan
   * it used to get spent four times the area and grouped by the directory an organisation happens
   * to be filed under, which is a filing decision rather than a fact about the code.
   */
  const layout = computed<Layout>(() => (isFleet(page.value) ? 'basins' : 'lanes'))

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
  const shown = computed(() => shipsOn(page.value, narrowed.value))

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
   * The one newer version, if there is one — and nothing at all otherwise.
   *
   * Its own state, like the forge readings and for the same reason: the check is a question to the
   * network and the snapshot is a reading of this disk, and folding one into the other would give
   * the older figure the younger timestamp.
   */
  const update = ref<Available | null>(null)
  const updating = ref(false)
  /** What the install said when it failed. Not swallowed — somebody pressed a button. */
  const updateTrouble = ref<string | null>(null)
  /** Clicked away. Comes back next start: the update does not go away either. */
  const dismissed = ref(false)

  const install = async (): Promise<void> => {
    const found = update.value
    if (found === null || updating.value) {
      return
    }
    updating.value = true
    updateTrouble.value = null
    try {
      updateTrouble.value = await installUpdate(found.rid)
    } finally {
      updating.value = false
    }
  }

  /**
   * Measure again — the whole fleet, or the one repository named.
   *
   * The picture is replaced whole when it comes back rather than patched as it goes: a harbour
   * half of which is from a minute ago is a harbour whose timestamp is a lie about half of it.
   */
  /**
   * How far the running measurement has got, and what it is on.
   *
   * Polled while it runs rather than pushed: the shell answers a command this window can already
   * call. Four times a second is finer than the thing being watched — a repository takes longer
   * than that to read — and it stops the moment the survey does.
   */
  const progress = ref<Progress>(NOTHING_RUNNING)
  let watching: ReturnType<typeof setInterval> | null = null

  const watch_ = (): void => {
    watching ??= setInterval(() => {
      progress.value = measuring()
    }, 250)
  }
  const unwatch = (): void => {
    if (watching !== null) {
      clearInterval(watching)
      watching = null
    }
    progress.value = NOTHING_RUNNING
  }

  const measure = async (only?: string): Promise<void> => {
    if (snapshot.value === null || busy.value) {
      return
    }
    busy.value = true
    trouble.value = null
    watch_()
    try {
      snapshot.value = await remeasure(snapshot.value, only)
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error)
      // A measurement somebody stopped is not a failure, and must not be reported as one.
      trouble.value = said === 'abgebrochen' ? null : said
    } finally {
      unwatch()
      busy.value = false
    }
  }

  /** Stop the running survey. Nothing is half-done: the cache still holds the last whole one. */
  const stop = async (): Promise<void> => {
    try {
      stopMeasuring()
    } catch (error) {
      trouble.value = error instanceof Error ? error.message : String(error)
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
   * The register's other half. Only letting go is offered here now: a directory is added as a
   * root, picked in the dialog and searched, and what the register already holds stays honoured.
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

    /*
     * And after those: looking for a newer version is seventeen seconds of somebody else's network
     * at worst, and a harbour that would not draw until GitHub answered would have the priorities
     * backwards. Nothing is reported when the look fails — being offline is not a Hafen problem.
     */
    update.value = await checkForUpdate(await runningVersion())

    /*
     * And the one question the harbour cannot measure, asked once.
     *
     * After the picture, so a machine that *has* been asked never waits on this; and off the
     * register rather than off an empty fleet, because a fleet can honestly be empty.
     */
    if (inTauri()) {
      try {
        aboard.value = await bordmittel()
        await lookAgain()
      } catch {
        /*
         * Swallowed on purpose, and this is the one place in this file where that is right.
         *
         * The question is a convenience; the harbour is the tool. A window that refused to draw
         * because it could not work out whether to ask something would have the priorities exactly
         * backwards — and somebody who has roots set sees their fleet either way.
         */
        unasked.value = false
      }
    }
  })
</script>

<template>
  <div class="flex h-screen w-screen flex-col bg-slate-950 text-slate-300">
    <!--
      Above everything, including the two views that replace the harbour: a newer version can be
      exactly the remedy for the state somebody is looking at.
    -->
    <UpdateBanner
      v-if="update !== null && !dismissed"
      :version="update.version"
      :current="update.current"
      :busy="updating"
      :trouble="updateTrouble"
      @install="install"
      @dismiss="dismissed = true"
    />
    <!--
      Before the harbour, because an empty harbour and an unasked machine look alike and only one
      of them has a remedy.
    -->
    <!--
      Before everything, because without git there is nothing to draw and an empty harbour would
      say the wrong thing about this machine.
    -->
    <NoGit v-if="aboard !== null && !canSurvey(aboard)" :gh="aboard.gh" :curl="aboard.curl" />
    <FirstRun
      v-else-if="unasked"
      :store="places?.store ?? ''"
      :busy="busy"
      :trouble="trouble"
      @choose="askWhereTheProjectsAre()"
    />
    <template v-else-if="snapshot !== null">
      <FleetBar
        :ships="narrowed"
        :at="snapshot.at"
        :source="source"
        :can-measure="canAct"
        :busy="busy"
        :forge-at="forge.at"
        :progress="progress"
        :roots="rootList"
        :fixed="roots.fixed"
        @measure="measure()"
        @stop="stop"
        @add="askWhereTheProjectsAre('Welchen Ordner hinzufügen?')"
        @drop="changeRoot($event, false)"
        @forge="askForges"
      />
      <BandTabs
        v-model:view="view"
        v-model:query="query"
        v-model:only="onlyMatches"
        :page="page"
        :ships="narrowed"
        :contract="contract"
        :fleet-page="fleetPageFor(picked, lastFleet)"
        @update:page="goTo"
        @clear="contract = null"
        @view="showView"
      />

      <!--
        What this machine cannot ask, said once.

        The verdicts are already right — a forge quest nobody can answer is `nicht messbar`, which
        is the fifth verdict doing its job. What was missing is the *cause*: ninety-two readings
        that say "not measurable" do not add up to "gh is not installed", and only one of those is
        something a reader can act on.
      -->
      <p
        v-if="forgeNote(aboard) !== null"
        class="border-b border-slate-800 px-4 py-1 font-mono text-xs text-amber-600/80"
      >
        {{ forgeNote(aboard) }}
      </p>

      <!--
        Said out loud, because an empty basin and a filter that matched nothing look identical —
        and only one of the two has a remedy the reader can act on.
      -->
      <p
        v-if="
          draws(page) &&
          ((query.trim() !== '' && (onlyMatches ? shown.length : found.length) === 0) ||
            (contract !== null && shown.length === 0))
        "
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
        <!--
          Nothing matched here, and whether anything matched elsewhere is the useful half: the
          search marks rather than filters now, so "nothing is ringed" is what a reader sees and
          this says why.
        -->
        <template v-else-if="matchesAnywhere === 0">Kein Schiff passt zu „{{ query }}“.</template>
        <template v-else
          >Auf dieser Seite ist keines zu „{{ query }}“
          {{ onlyMatches ? 'gezeichnet' : 'markiert' }} — {{ matchesAnywhere }} anderswo.</template
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
            ref="harbour"
            :key="`${page}:${contract?.id ?? ''}:${contract?.verdict ?? ''}`"
            v-model:picked="picked"
            v-model:hovered="hovered"
            :quest="demand"
            :forge="forgeByPath"
            :layout="layout"
            :ships="shown"
            :centre="picked"
            :hold="hold"
            :found="found"
            @update:quest="choose"
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
            :at="snapshot.at"
            :tools="tools"
            :stats="statsFor(forge, sheet)"
            :forge-at="forge.at"
            @measure="measure($event)"
            @archive="archive(sheet.path, $event)"
            @enlist="enlist(sheet.path, $event)"
            @pick="choose"
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
