<script setup lang="ts">
  /**
   * Die eine Zeile, die der Updater je zu sagen hat.
   *
   * Sie steht nur da, wenn es etwas zu holen gibt — kein Update ist keine Nachricht, und ein
   * fehlgeschlagener Blick ins Netz erst recht nicht. Das ist der Unterschied zwischen einem
   * Hinweis und einem Melder: ein Band, das auch „alles in Ordnung" sagt, liest nach einer Woche
   * niemand mehr, und dann auch nicht die eine Zeile, auf die es ankam.
   *
   * Beide Fassungen stehen drin. „Version 1.3.0 verfügbar" allein lässt offen, ob das ein Sprung
   * oder ein Patch ist — und ob man schon aktuell ist.
   */

  defineProps<{
    version: string
    current: string
    /** Läuft gerade der Download; der Knopf sagt es und lässt sich nicht zweimal drücken. */
    busy?: boolean
    /** Woran es scheiterte, falls es das tat. */
    trouble?: string | null
  }>()

  const emit = defineEmits<{ install: []; dismiss: [] }>()
</script>

<template>
  <div
    class="flex items-baseline gap-3 border-b border-sky-900 bg-sky-950/40 py-1 pr-2 pl-4 font-mono text-xs"
  >
    <p class="min-w-0 flex-1 text-sky-300">
      <template v-if="trouble !== null && trouble !== undefined">
        Update fehlgeschlagen: {{ trouble }}
      </template>
      <template v-else-if="busy"> Version {{ version }} wird geladen … </template>
      <template v-else>
        Version <span class="text-sky-200">{{ version }}</span> ist da — hier läuft {{ current }}.
      </template>
    </p>

    <button
      v-if="!busy"
      class="shrink-0 text-sky-400 underline-offset-2 hover:text-sky-200 hover:underline"
      @click="emit('install')"
    >
      {{ trouble === null || trouble === undefined ? 'laden und einspielen' : 'nochmal' }}
    </button>
    <!--
      Wegklickbar, weil ein Hinweis, den man nicht loswird, ein Melder ist. Beim nächsten Start
      steht er wieder da — das Update geht ja nicht weg.
    -->
    <button
      class="shrink-0 px-1 text-sky-700 hover:text-sky-300"
      title="Hinweis wegklicken"
      @click="emit('dismiss')"
    >
      ×
    </button>
  </div>
</template>
