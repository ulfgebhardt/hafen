import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { quest, ship } from './components/testing'

/**
 * The scene is stubbed: it mounts a WebGL canvas, which happy-dom has no renderer for. What it
 * *decides* is measured in `fleet.spec.ts` and `hull.spec.ts` — the point of this file is the
 * three states the window itself can be in.
 */
const stubs = {
  HarborScene: {
    name: 'HarborScene',
    template: '<div class="scene-stub" />',
    // Declared so the stub can hand a ship up the same way the real scene does.
    emits: ['update:picked'],
  },
}

/**
 * The app's own way in: the Tauri command, answering the way `lib.rs` does.
 *
 * Stubbed at the bridge rather than at `loadSnapshot`, so this spec exercises the same branch
 * the packaged window takes — `snapshot.spec.ts` covers the browser half.
 */
function answersWith(body: unknown, ok = true): void {
  const invoke = vi.fn<(command: string) => Promise<unknown>>(async () =>
    Promise.resolve(
      ok
        ? { path: '/cache/hafen/snapshot.json', json: JSON.stringify(body), error: null }
        : { path: '/cache/hafen/snapshot.json', json: null, error: 'No such file' },
    ),
  )
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
}

const snapshot = {
  at: '2026-09-29T21:42:18.126Z',
  root: '/repos',
  ships: [ship({ quests: [quest('lint', 'violated')] })],
}

describe('app', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('says it is reading before the snapshot arrives', () => {
    answersWith(snapshot)

    expect(mount(App, { global: { stubs } }).text()).toContain('wird gelesen')
  })

  it('draws the harbor once the snapshot is in', async () => {
    answersWith(snapshot)

    const app = mount(App, { global: { stubs } })
    await flushPromises()

    expect(app.text()).toContain('1 Schiffe')
    expect(app.find('.scene-stub').exists()).toBe(true)
  })

  /**
   * An empty harbor and a failed read are different sentences. A window that shows nothing for
   * both is a window that lies about one of them — and the one it lies about is the one a human
   * could have fixed.
   */
  it('names a snapshot it could not read, and how to make one', async () => {
    answersWith(null, false)

    const app = mount(App, { global: { stubs } })
    await flushPromises()

    expect(app.text()).toContain('Kein Schnappschuss')
    expect(app.text()).toContain('No such file')
    expect(app.text()).toContain('/cache/hafen/snapshot.json')
    expect(app.text()).toContain('hafen schnappschuss')
  })

  /** Anything the loader did not name is still named, rather than leaving "wird gelesen". */
  it('names a snapshot that is not JSON at all', async () => {
    const invoke = vi.fn<(command: string) => Promise<unknown>>(async () =>
      Promise.resolve({ path: '/cache/hafen/snapshot.json', json: 'kein JSON', error: null }),
    )
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke })

    const app = mount(App, { global: { stubs } })
    await flushPromises()

    expect(app.text()).toContain('Kein Schnappschuss')
  })

  it('waits for a ship to be picked before showing a sheet', async () => {
    answersWith(snapshot)

    const app = mount(App, { global: { stubs } })
    await flushPromises()

    expect(app.text()).toContain('Ein Schiff anfahren')
    expect(app.text()).not.toContain('SCHIFFSDATENBLATT')
  })

  it('shows the sheet of the ship the scene reports', async () => {
    answersWith(snapshot)

    const app = mount(App, { global: { stubs } })
    await flushPromises()

    // What `HarborScene` does on a pointer: hand the ship up through the model. `vm` comes back
    // as `any` from test-utils, so the cast is spelled out rather than spread over three lines
    // of unchecked access.
    const scene = app.findComponent({ name: 'HarborScene' }).vm as {
      $emit: (event: string, ...args: readonly unknown[]) => void
    }
    scene.$emit('update:picked', snapshot.ships[0])
    await flushPromises()

    expect(app.text()).toContain('Schiffsdatenblatt')
    expect(app.text()).toContain('/repos/org/ship')
  })
})
