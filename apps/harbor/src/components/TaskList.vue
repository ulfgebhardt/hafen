<script setup lang="ts">
  import PointValue from './PointValue.vue'

  import type { Task, TaskKind } from '@hafen/core'

  /**
   * The tasks, handed in rather than derived here.
   *
   * It used to take the ship and call `tasksFor` itself, and that is what made the sheet say
   * everything twice: this list printed a thin copy of every violated quest, and the quest section
   * underneath printed the same quests with their checks, sources and findings. Who splits them is
   * a decision about the page, so the page makes it.
   */
  const { tasks, title = 'Zu tun' } = defineProps<{
    tasks: readonly Task[]
    title?: string
  }>()

  /**
   * A mark per kind, so the eye can sort before it reads.
   *
   * `blocked` gets the one that looks like a stop, because that is what it is: everything else on
   * the repository waits behind it.
   */
  const MARK: Record<TaskKind, string> = {
    blocked: '⨯',
    tidy: '□',
    deliver: '↑',
    contract: '◇',
  }

  const TONE: Record<TaskKind, string> = {
    blocked: 'text-red-400',
    tidy: 'text-amber-400',
    deliver: 'text-orange-300',
    contract: 'text-sky-300',
  }
</script>

<template>
  <section class="border-b border-slate-800 px-4 py-3">
    <p class="text-[10px] tracking-wide text-slate-600 uppercase">
      {{ title }}
      <span v-if="tasks.length > 0" class="text-slate-700">— {{ tasks.length }}</span>
    </p>

    <!-- The intended end state, not an empty list: a repository in good order asks for nothing. -->
    <p v-if="tasks.length === 0" class="mt-1 text-xs text-slate-500">
      Nichts offen. Der Baum ist sauber, nichts liegt im Stash, nichts wartet auf einen Push.
    </p>

    <ul v-else class="mt-1 space-y-2.5">
      <li v-for="(task, index) in tasks" :key="index" class="flex gap-2">
        <span class="mt-px w-3 shrink-0 font-mono text-sm" :class="TONE[task.kind]">{{
          MARK[task.kind]
        }}</span>

        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-baseline justify-between gap-x-2">
            <span class="text-xs text-slate-200">{{ task.title }}</span>
            <PointValue :project="task.project" :personal="task.personal" signed />
          </span>

          <span class="mt-0.5 block text-[11px] leading-snug text-slate-500">{{ task.why }}</span>

          <!--
            The command to type, and nothing that types it. The harbour measures and draws; the
            work happens in a terminal, by hand — offering a button here would make this a tool
            that acts on repositories, which is the one thing it must not become.
          -->
          <code class="mt-1 block font-mono text-[11px] break-all text-slate-600 select-all">{{
            task.command
          }}</code>
        </span>
      </li>
    </ul>
  </section>
</template>
