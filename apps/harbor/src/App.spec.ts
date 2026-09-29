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

function answersWith(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Promise.resolve({
        ok,
        status: ok ? 200 : 404,
        statusText: ok ? 'OK' : 'Not Found',
        json: async () => Promise.resolve(body),
      }),
    ),
  )
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

    expect(app.text()).toContain('snapshot.json nicht lesbar')
    expect(app.text()).toContain('404')
    expect(app.text()).toContain('snapshot')
  })

  it('names a snapshot that is not JSON rather than hanging on "wird gelesen"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => Promise.reject(new Error('Unexpected token <')),
        }),
      ),
    )

    const app = mount(App, { global: { stubs } })
    await flushPromises()

    expect(app.text()).toContain('nicht lesbar')
    expect(app.text()).toContain('Unexpected token')
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
