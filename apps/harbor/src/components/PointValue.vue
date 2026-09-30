<script setup lang="ts">
  /**
   * A point value, in the one shape it is written everywhere.
   *
   * Two marks, used consistently: `◆` for the project score and `●` for the personal one. Two
   * scores written the same way is how a reader ends up adding numbers that must not be added —
   * so they never look alike, in the header, on a sheet, or beside a task.
   *
   * A zero is *absent* rather than written. `+0 Projekt` beside a task is noise that makes the
   * number that matters harder to find.
   */
  const {
    project = 0,
    personal = 0,
    signed = false,
  } = defineProps<{
    project?: number
    personal?: number
    /** Write a leading `+` — for what a task *would* add, rather than what something *is*. */
    signed?: boolean
  }>()

  const write = (value: number): string =>
    `${signed && value > 0 ? '+' : ''}${value.toLocaleString('de-DE')}`
</script>

<template>
  <span class="inline-flex items-baseline gap-2 font-mono text-xs whitespace-nowrap">
    <!--
      The mark carries the distinction for the eye, the label carries it for everything else: a
      glyph alone is silent to a screen reader and invisible in a copied line of text.
    -->
    <span
      v-if="project !== 0"
      class="text-sky-300"
      :aria-label="`${write(project)} Projektpunkte`"
      title="Projektpunkte"
    >
      <span aria-hidden="true">◆ {{ write(project) }}</span>
    </span>
    <span
      v-if="personal !== 0"
      class="text-emerald-300"
      :aria-label="`${write(personal)} deine Punkte`"
      title="Deine Punkte"
    >
      <span aria-hidden="true">● {{ write(personal) }}</span>
    </span>
  </span>
</template>
