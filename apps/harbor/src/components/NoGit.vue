<script setup lang="ts">
  /**
   * The one tool the harbour cannot do without, said once.
   *
   * Everything here is read with `git`. Without it the survey finds nothing, every reading comes
   * back empty, and the result is **a harbour that looks exactly like a machine with no
   * repositories on it**. Those two are not the same sentence and the reader cannot tell them
   * apart, which is the whole reason this view exists: ninety-two silent failures are not a
   * measurement.
   *
   * Beside it the two that are *not* blocking, because saying what still works is half the
   * answer: `gh` and `curl` only read the forge, and their absence is already a verdict —
   * `nicht messbar`, which is the fifth verdict doing its job.
   */

  defineProps<{ gh: boolean; curl: boolean }>()
</script>

<template>
  <section class="flex h-full items-center justify-center p-8">
    <div class="max-w-xl">
      <h2 class="font-mono text-sm tracking-wide text-red-400">git fehlt</h2>
      <p class="mt-3 text-sm leading-relaxed text-slate-400">
        Der Hafen misst alles mit <span class="font-mono text-slate-300">git</span> — Liegezeit,
        Branches, Zeilen, Herkunft. Ohne das Programm findet er nichts, und eine leere Flotte sähe
        genauso aus wie eine Maschine ohne Projekte. Das sind zwei verschiedene Sätze.
      </p>

      <p class="mt-4 font-mono text-[11px] tracking-wide text-slate-600 uppercase">Abhilfe</p>
      <ul class="mt-1 space-y-1 font-mono text-[11px] text-slate-500">
        <li>macOS <span class="text-slate-400">xcode-select --install</span></li>
        <li>Debian/Ubuntu <span class="text-slate-400">sudo apt install git</span></li>
        <li>Arch <span class="text-slate-400">sudo pacman -S git</span></li>
        <li>Windows <span class="text-slate-400">winget install Git.Git</span></li>
      </ul>
      <p class="mt-3 text-[11px] text-slate-600">
        Danach dieses Fenster neu starten — gesucht wird beim Start, einmal.
      </p>

      <!--
        What still works, because "nothing works" would be the easier sentence and the wrong one.
      -->
      <p class="mt-6 text-[11px] leading-relaxed text-slate-600">
        <template v-if="gh || curl">
          Die Forge wäre ansprechbar ({{
            [gh ? 'gh' : '', curl ? 'curl' : ''].filter(Boolean).join(', ')
          }}) — sie beantwortet aber nur Fragen zu Repositories, die erst gemessen werden müssen.
        </template>
        <template v-else>
          Auch gh und curl fehlen; Forge-Forderungen blieben ohnehin nicht messbar.
        </template>
      </p>
    </div>
  </section>
</template>
