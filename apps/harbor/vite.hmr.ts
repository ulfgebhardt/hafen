/**
 * When a hot update is not good enough and the page has to be reloaded.
 *
 * Vite replaces a changed module for every *new* importer and leaves anything already built
 * holding the old one. For a component that is harmless — it is rebuilt from its template. For a
 * plain module it is not: `scene.ts` computes `CAPTION_TOP` once, at module level, out of
 * `MAX_DRAUGHT` in `hull.ts`. Add that constant to `hull.ts` while the server is running, and the
 * window ends up with one generation of `scene.ts` and another of `hull.ts` — measured on
 * 30.09.2026 as `MAX_DRAUGHT is not defined` and a white window that stayed white.
 *
 * Nothing was broken in the tree. That is the whole problem: no test, no type and no build sees
 * it, because it only exists in a page that stayed open across an edit. The same failure is
 * written up in Werft, and not carrying the fix across is what let it happen twice.
 *
 * Components stay hot. The cost of a reload is a scrolled position, and everything else in this
 * window is measured again on load anyway.
 */

/** A path Vite reports as changed. */
export function isComponent(path: string): boolean {
  return path.endsWith('.vue')
}

/**
 * Whether a change has to take the whole page with it.
 *
 * Everything that is not a component: plain modules hold module-level state, and whoever already
 * imported them keeps it. Style files are exempt — Vite swaps CSS without any JS holding a
 * reference to it.
 */
export function needsReload(paths: readonly string[]): boolean {
  return paths.some((path) => !isComponent(path) && !path.endsWith('.css'))
}
