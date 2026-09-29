import { describe, expect, it } from 'vitest'

import { isComponent, needsReload } from './vite.hmr'

describe(isComponent, () => {
  it('knows a component from a module', () => {
    expect(isComponent('/src/components/ShipSheet.vue')).toBe(true)
    expect(isComponent('/src/components/hull.ts')).toBe(false)
  })
})

describe(needsReload, () => {
  /**
   * The measured failure: `MAX_DRAUGHT` was added to `hull.ts` while the server ran, `scene.ts`
   * kept the generation without it, and the window went white and stayed white. Nothing in the
   * tree was wrong — which is why only a reload can answer it.
   */
  it('reloads for a plain module, because module-level state does not swap', () => {
    expect(needsReload(['/src/components/hull.ts'])).toBe(true)
  })

  /** Components are rebuilt from their template; the cost of reloading them is a lost scroll. */
  it('leaves a component hot', () => {
    expect(needsReload(['/src/components/ShipSheet.vue'])).toBe(false)
  })

  /** Vite swaps stylesheets without any JS holding a reference to them. */
  it('leaves a stylesheet hot', () => {
    expect(needsReload(['/src/style.css'])).toBe(false)
  })

  it('reloads when a batch contains even one module', () => {
    expect(needsReload(['/src/App.vue', '/src/style.css', '/src/components/fleet.ts'])).toBe(true)
  })

  it('does nothing for an empty batch', () => {
    expect(needsReload([])).toBe(false)
  })
})
