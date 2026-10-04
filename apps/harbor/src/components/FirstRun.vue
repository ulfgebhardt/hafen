<script setup lang="ts">
  /**
   * The one question the harbour cannot measure: where the projects are.
   *
   * Everything else here is read off the machine. This is not on it — the CLI took `$HAFEN_ROOT`
   * or two directories of one person's own convention, which is useless to anybody else, and a
   * guess list of `~/Projects`, `~/src`, `~/code` would trade a measurement for a better-looking
   * assumption. Asking once *is* the measurement, and the answer goes where decisions go: the
   * register.
   *
   * Shown instead of an empty harbour, because the two look alike and only one has a remedy. A
   * drawing of nothing beside a bar that says "0 Schiffe" is a tool that appears broken while
   * being correct.
   */

  defineProps<{
    /** Where the window would write the answer, so the reader can see it before saying yes. */
    store: string
    busy?: boolean
    /** Why the last answer did not take — said here, because the bar that says it elsewhere is not drawn yet. */
    trouble?: string | null
  }>()

  const emit = defineEmits<{ choose: [] }>()
</script>

<template>
  <section class="flex h-full items-center justify-center p-8">
    <div class="max-w-xl">
      <h2 class="font-mono text-sm tracking-wide text-slate-300">Der Hafen ist noch leer</h2>
      <p class="mt-3 text-sm leading-relaxed text-slate-400">
        Es ist nicht festgehalten, wo deine Projekte liegen — und raten wäre das eine, was der Hafen
        nicht tut. Er misst, was da ist; wo er suchen soll, kann nur ein Mensch sagen.
      </p>
      <p class="mt-3 text-sm leading-relaxed text-slate-400">
        Wähle das Verzeichnis, unter dem deine Git-Repositories liegen. Gesucht wird bis vier Ebenen
        tief, und bei jedem Repository hört die Suche auf — was darin liegt, gehört ihm.
      </p>

      <button
        class="mt-5 border border-slate-700 px-4 py-2 font-mono text-xs text-slate-200 hover:border-slate-500 hover:text-white disabled:text-slate-600"
        :disabled="busy"
        @click="emit('choose')"
      >
        {{ busy ? 'misst …' : 'Verzeichnis wählen' }}
      </button>
      <p v-if="trouble" class="mt-3 font-mono text-xs whitespace-pre-line text-red-400">
        {{ trouble }}
      </p>

      <!--
        Said out loud rather than hidden: the answer is a file somebody can read, edit and delete,
        and knowing where it goes before answering is the difference between a setting and a
        black box.
      -->
      <p class="mt-6 font-mono text-[11px] leading-relaxed text-slate-600">
        Die Antwort kommt als Zeile nach
        <span class="text-slate-500">{{ store }}/register.md</span>. Dort steht nur, was keine
        Messung ist — und sie bleibt auf dieser Maschine.
      </p>
      <p class="mt-2 font-mono text-[11px] text-slate-600">
        Oder <span class="text-slate-500">$HAFEN_ROOT</span> setzen, komma-getrennt; das geht vor.
      </p>
    </div>
  </section>
</template>
