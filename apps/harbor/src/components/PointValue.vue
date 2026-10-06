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
      The mark carries the distinction for the eye, the words carry it for everything else: a
      glyph alone is silent to a screen reader and invisible in a copied line of text.

      Spelled out as hidden text and not as an `aria-label`. The label stood on a bare `<span>`,
      where ARIA forbids it and screen readers drop it — and with the figure itself `aria-hidden`,
      what a screen reader got was nothing at all. axe found it on the first run against the
      rendered window (`aria-prohibited-attr`, every score in the bar and on the sheet).

      `relative` holds the hidden text in place. `sr-only` is `position: absolute`, and without a
      positioned ancestor it is placed against the viewport — outside the sheet's scroller, so a
      score far down the sheet stretched the page and the whole window scrolled.
    -->
    <span v-if="project !== 0" class="relative text-sky-300" title="Projektpunkte">
      <span aria-hidden="true">◆ {{ write(project) }}</span>
      <span class="sr-only">{{ write(project) }} Projektpunkte</span>
    </span>
    <span v-if="personal !== 0" class="relative text-emerald-300" title="Deine Punkte">
      <span aria-hidden="true">● {{ write(personal) }}</span>
      <span class="sr-only">{{ write(personal) }} deine Punkte</span>
    </span>
  </span>
</template>
