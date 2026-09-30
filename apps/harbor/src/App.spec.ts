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

/**
 * The bridge with a reply per command, so a whole action can be followed from click to picture.
 *
 * Stubbed at the bridge and not at `snapshot.ts`, for the reason `answersWith` is: this exercises
 * the branch the packaged window actually takes.
 */
function bridge(replies: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const invoke = vi.fn<(command: string) => Promise<unknown>>(async (command) =>
    Promise.resolve(replies[command]),
  )
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
  return invoke
}

describe('acting on a ship', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const read = {
    path: '/cache/hafen/snapshot.json',
    json: JSON.stringify(snapshot),
    error: null,
  }

  /** The one button that starts a measurement, beside the timestamp it makes stale. */
  it('measures the fleet when the bar asks for it', async () => {
    const fresh = { ...snapshot, at: '2026-09-30T08:00:00.000Z' }
    const invoke = bridge({
      snapshot: read,
      measure: { json: JSON.stringify(fresh), error: null },
      store: null,
    })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    const button = page.findAll('button').find((one) => one.text().includes('neu messen'))

    expect(button).toBeDefined()

    await button?.trigger('click')
    await flushPromises()

    expect(invoke).toHaveBeenCalledWith('measure', { only: null })
    expect(page.text()).toContain('30.9.2026')
  })

  /** Said and not swallowed: an action that quietly did nothing is the worst of the three. */
  it('shows what a failed measurement said', async () => {
    bridge({ snapshot: read, measure: { json: null, error: 'hafen nicht gefunden' } })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    await page
      .findAll('button')
      .find((one) => one.text().includes('neu messen'))
      ?.trigger('click')
    await flushPromises()

    expect(page.text()).toContain('hafen nicht gefunden')
  })

  /**
   * Archiving writes the register and then measures that one repository: `archived` travels on the
   * ship, and flipping it here as well would be a second opinion about a file just written.
   */
  it('archives the pinned ship through the register', async () => {
    const away = {
      ...snapshot,
      ships: [{ ...snapshot.ships[0], archived: true }],
    }
    const invoke = bridge({
      snapshot: read,
      register: null,
      measure: { json: JSON.stringify(away), error: null },
      store: null,
    })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    const scene = page.findComponent({ name: 'HarborScene' }).vm as {
      $emit: (event: string, ...args: readonly unknown[]) => void
    }
    scene.$emit('update:picked', snapshot.ships[0])
    await flushPromises()

    await page
      .findAll('button')
      .find((one) => one.text() === 'archivieren')
      ?.trigger('click')
    await flushPromises()

    expect(invoke).toHaveBeenCalledWith('register', {
      action: 'archivieren',
      path: snapshot.ships[0]?.path,
    })
  })
})

describe('the register, from the window', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const read = {
    path: '/cache/hafen/snapshot.json',
    json: JSON.stringify(snapshot),
    error: null,
  }

  /**
   * Adopting a directory is the only action here that names a path nobody clicked on — there is
   * nothing to click, because the whole point is a directory the survey does not find.
   */
  it('takes a typed directory into the register', async () => {
    const invoke = bridge({
      snapshot: read,
      register: null,
      measure: { json: JSON.stringify(snapshot), error: null },
      store: null,
    })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    await page
      .findAll('button')
      .find((one) => one.text() === 'aufnehmen')
      ?.trigger('click')
    await page.find('input').setValue('/anderswo/ding')
    await page
      .findAll('button')
      .find((one) => one.text() === 'ok')
      ?.trigger('click')
    await flushPromises()

    expect(invoke).toHaveBeenCalledWith('register', {
      action: 'aufnehmen',
      path: '/anderswo/ding',
    })
  })

  /** One choice, wherever it was made: the sheet's plan and the harbour mark the same box. */
  it('carries a demand chosen in the sheet back to the drawing', async () => {
    bridge({ snapshot: read })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    const scene = page.findComponent({ name: 'HarborScene' }).vm as {
      $emit: (event: string, ...args: readonly unknown[]) => void
    }
    scene.$emit('update:picked', snapshot.ships[0])
    scene.$emit('update:quest', 'lint')
    await flushPromises()

    expect(page.findComponent({ name: 'ShipSheet' }).props('quest')).toBe('lint')
  })
})

describe('the tools, from the window', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const read = { path: '/cache/hafen/snapshot.json', json: JSON.stringify(snapshot), error: null }

  /**
   * Four of the five hand over — they outlive the click, and a measurement taken a second after
   * lazygit opened would say what it said before. Only `prune` changes something, so only `prune`
   * ends with a fresh reading.
   */
  it('opens a tool where the ship lies and does not re-measure for it', async () => {
    const invoke = bridge({ snapshot: read, tools: ['lazygit'], run_tool: null })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    const scene = page.findComponent({ name: 'HarborScene' }).vm as {
      $emit: (event: string, ...args: readonly unknown[]) => void
    }
    scene.$emit('update:picked', snapshot.ships[0])
    await flushPromises()

    await page
      .findAll('button')
      .find((one) => one.text() === 'lazygit')
      ?.trigger('click')
    await flushPromises()

    expect(invoke).toHaveBeenCalledWith('run_tool', {
      name: 'lazygit',
      path: snapshot.ships[0]?.path,
    })
    expect(invoke).not.toHaveBeenCalledWith('measure', expect.anything())
  })

  it('says what went wrong rather than opening nothing quietly', async () => {
    bridge({ snapshot: read, tools: ['shell'], run_tool: 'kein Terminal gefunden' })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    const scene = page.findComponent({ name: 'HarborScene' }).vm as {
      $emit: (event: string, ...args: readonly unknown[]) => void
    }
    scene.$emit('update:picked', snapshot.ships[0])
    await flushPromises()

    await page
      .findAll('button')
      .find((one) => one.text() === 'Terminal')
      ?.trigger('click')
    await flushPromises()

    expect(page.text()).toContain('kein Terminal gefunden')
  })
})
