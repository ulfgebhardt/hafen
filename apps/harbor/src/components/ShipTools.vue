<script setup lang="ts">
  /**
   * The tools, and the branches git would let go of.
   *
   * The one place in the window that *does* something, and it is drawn as two kinds because they
   * are two kinds: four buttons hand over — they open lazygit, an editor, a terminal, an agent in
   * this directory and a human decides inside — and two write, narrowly. `git remote prune origin`
   * removes remote-tracking refs the remote no longer has, and `git branch -d` takes one branch
   * whose commits are somewhere else.
   *
   * The branch list is a **measurement** first. Every name here carries the command to type, the
   * same as a task does; the button beside it is a convenience on top of that and not a substitute
   * for it. Never a sweep: forty branches deleted by one click is forty decisions nobody made.
   */

  import { staleBranches, strayTenders } from '@hafen/core'
  import { computed } from 'vue'

  import { TOOL_LABEL, TOOL_MEANING, TOOLS } from './tools'

  import type { ToolName } from './tools'
  import type { Ship } from '@hafen/core'

  const {
    ship,
    available = [],
    busy = false,
  } = defineProps<{
    ship: Ship
    /** What this machine can actually run. Anything absent is not drawn rather than disabled. */
    available?: readonly ToolName[]
    busy?: boolean
  }>()

  const emit = defineEmits<{ tool: [ToolName]; prune: [string] }>()

  const offered = computed(() => TOOLS.filter((name) => available.includes(name)))
  // No guard here: `adopt` fills what an older snapshot is missing, once, where it comes in.
  const stale = computed(() => staleBranches(ship.branches, ship.defaultBranch))

  /**
   * The repositories this one carries, and what is wrong with them.
   *
   * Listed whole and not only the strays: a Beiboot is a fact about the ship worth seeing, and a
   * list that appeared only when something was broken would teach nobody that they exist. The two
   * states that need acting on are marked.
   */
  const tenders = computed(() => ship.submodules)
  const stray = computed(() => strayTenders(tenders.value))

  const TENDER_MEANING: Record<string, string> = {
    aboard: 'liegt auf dem Stand, den dieses Repo vermerkt',
    adrift: 'liegt woanders als vermerkt — ein Bump, der es nicht in den Commit geschafft hat',
    missing: 'nie ausgecheckt — das Verzeichnis ist leer',
  }
</script>

<template>
  <section
    v-if="offered.length > 0 || stale.length > 0 || tenders.length > 0"
    class="border-b border-slate-800 px-4 py-3"
  >
    <p class="text-[10px] tracking-wide text-slate-600 uppercase">Werkzeug</p>

    <p v-if="offered.length > 0" class="mt-1 flex flex-wrap gap-2">
      <button
        v-for="name in offered"
        :key="name"
        class="border border-slate-700 px-2 py-0.5 font-mono text-[11px] text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:border-slate-800 disabled:text-slate-700"
        :disabled="busy"
        :title="TOOL_MEANING[name]"
        @click="emit('tool', name)"
      >
        {{ TOOL_LABEL[name] }}
      </button>
    </p>

    <template v-if="stale.length > 0">
      <p class="mt-3 text-[10px] tracking-wide text-slate-600 uppercase">
        Branches <span class="text-slate-700">— {{ stale.length }} könnten weg</span>
      </p>
      <!--
        What "enthalten" was measured against. A verdict without the thing it was compared to is
        one a reader has to take on faith — and this one used to compare against `HEAD`, which on a
        feature branch is the wrong question entirely.
      -->
      <p v-if="ship.defaultBranch !== null" class="text-[11px] text-slate-600">
        verglichen mit <span class="font-mono">{{ ship.defaultBranch }}</span>
      </p>
      <p v-else class="text-[11px] text-amber-600">
        Kein Default-Branch feststellbar — gelistet ist nur, was der Remote nicht mehr hat.
      </p>
      <!--
        Why each one is offered, per branch: "gone" and "merged" are different reasons and a reader
        deciding whether to delete wants the one that applies to this name.

        Name and button on one line, the reason and the command under them — and that is a fix.
        All four stood in one row, with the command refusing to shrink, so in a 384-pixel panel a
        branch name was squeezed to a single column of letters. A long name is the normal case
        here: `werft/0250-reissboden-leuchtturm-verbund` is what these are called.
      -->
      <ul class="mt-1 space-y-1.5">
        <li v-for="branch in stale" :key="branch.name">
          <span class="flex items-baseline gap-2">
            <span class="min-w-0 flex-1 font-mono text-xs break-all text-slate-300">{{
              branch.name
            }}</span>
            <button
              class="shrink-0 font-mono text-[10px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline disabled:text-slate-700 disabled:no-underline"
              :disabled="busy"
              :title="`Nur ${branch.name} — git verweigert, wenn Commits nur dort liegen`"
              @click="emit('prune', branch.name)"
            >
              ausführen
            </button>
          </span>
          <span class="block text-[11px] text-slate-600">{{
            branch.gone
              ? 'der Remote hat diesen Branch nicht mehr'
              : `bereits in ${ship.defaultBranch ?? 'dem Default-Branch'} enthalten`
          }}</span>
          <!--
            The command this one button runs, written out on its own row.
            One line for the whole set used to stand under the list, and beside per-row buttons it
            read as what a button does — so the button looked like it would take all of them. What
            you see is now what this button runs, and nothing else.
          -->
          <code class="block font-mono text-[10px] break-all text-slate-600 select-all"
            >git branch -d {{ branch.name }}</code
          >
        </li>
      </ul>
    </template>

    <template v-if="tenders.length > 0">
      <p class="mt-3 text-[10px] tracking-wide text-slate-600 uppercase">
        Beiboote
        <span class="text-slate-700">— {{ tenders.length }} mitgeführt</span>
        <span v-if="stray.length > 0" class="text-amber-600"
          >, {{ stray.length }} nicht an Bord</span
        >
      </p>
      <ul class="mt-1 space-y-1">
        <li v-for="boat in tenders" :key="boat.path" class="flex items-baseline gap-2">
          <span
            class="mt-px w-3 shrink-0 font-mono text-xs"
            :class="boat.state === 'aboard' ? 'text-slate-600' : 'text-amber-500'"
            >{{ boat.state === 'aboard' ? '·' : boat.state === 'adrift' ? '~' : '!' }}</span
          >
          <span class="min-w-0 flex-1">
            <span class="block font-mono text-xs break-all text-slate-300">{{ boat.path }}</span>
            <span class="text-[11px] text-slate-600">{{ TENDER_MEANING[boat.state] }}</span>
          </span>
          <span class="shrink-0 font-mono text-[10px] text-slate-600">{{ boat.at }}</span>
        </li>
      </ul>
      <code
        v-if="stray.length > 0"
        class="mt-1.5 block font-mono text-[11px] break-all text-slate-600 select-all"
        >git submodule update --init {{ stray.map((boat) => boat.path).join(' ') }}</code
      >
    </template>
  </section>
</template>
