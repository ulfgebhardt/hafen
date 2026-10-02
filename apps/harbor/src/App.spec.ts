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
    // Declared so a spec can read what the window handed the drawing — chiefly which ships are on
    // it and which of them a search found.
    props: ['ships', 'found', 'layout', 'centre', 'hold', 'forge'],
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
/**
 * What a fixture that said nothing answers.
 *
 * `undefined` is "this test has no opinion", `null` is an answer — a write that succeeded, a file
 * that is not there, **a program that is not installed**. Folding the two together is how a test
 * about something else ended up drawing the missing-git view.
 */
function answered(given: unknown, command: string): unknown {
  if (given !== undefined) {
    return given
  }
  // A machine has its tools unless a test says otherwise.
  return command === 'port_which' ? '/usr/bin/git' : null
}

function bridge(replies: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
    async (command, args) =>
      await Promise.resolve(
        typeof replies[command] === 'function'
          ? (replies[command] as (a?: Record<string, unknown>) => unknown)(args)
          : // Only where a test is silent, never instead of an answer it gave: `null` is a real
            // reply here — a write that succeeded, a file that is not there — and `??` would eat
            // both. A machine has its tools unless a test says otherwise, because `port_which`
            // answering `null` means "not installed" and the window then draws the missing-git
            // view instead of whatever the test is about.
            Object.hasOwn(replies, command)
            ? replies[command]
            : answered(undefined, command),
      ),
  )
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
  return invoke
}

/**
 * What a window needs to measure by itself: the places, and a filesystem answering nothing.
 *
 * The window measures in-process now instead of starting the CLI, so the shell it talks to is the
 * set of ports rather than one `measure` command. A repository whose git calls all come back empty
 * is still a ship, which is what keeps this a fixture rather than a fake fleet.
 */
const MEASURES: Record<string, unknown> = {
  port_places: { store: '/store', snapshot: '/cache/hafen/snapshot.json', roots: ['/repos'] },
  port_trees_with: ['/repos/org/ship'],
  port_read_dir: [],
  port_read_file: null,
  port_is_directory: false,
  port_real_path: (args?: Record<string, unknown>) => args?.['path'],
  port_run: { code: 1, stdout: '', stderr: '' },
  port_write_file: null,
}

/** One recorded call to a port command, as the mock keeps it. */
type Wrote = { path?: string; contents?: string } | undefined

/** Whether a recorded `port_write_file` call was aimed at the register. */
const registerPath = (args: unknown): boolean =>
  ((args as Wrote)?.path ?? '').endsWith('register.md')

/** What such a call wrote. */
const wrote = (call: readonly unknown[] | undefined): string => {
  return (call?.[1] as Wrote)?.contents ?? ''
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
    const invoke = bridge({ ...MEASURES, snapshot: read })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    const button = page.findAll('button').find((one) => one.text().includes('neu messen'))

    expect(button).toBeDefined()

    await button?.trigger('click')
    await flushPromises()

    // In this window and not in a second program: no `measure`, a search and a write instead.
    expect(invoke).not.toHaveBeenCalledWith('measure', expect.anything())
    expect(invoke).toHaveBeenCalledWith('port_trees_with', expect.anything())
    expect(invoke).toHaveBeenCalledWith('port_write_file', expect.anything())
  })

  /** Said and not swallowed: an action that quietly did nothing is the worst of the three. */
  it('shows what a failed measurement said', async () => {
    bridge({ ...MEASURES, snapshot: read, port_write_file: 'Platte voll' })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    await page
      .findAll('button')
      .find((one) => one.text().includes('neu messen'))
      ?.trigger('click')
    await flushPromises()

    expect(page.text()).toContain('Platte voll')
  })

  /**
   * Archiving writes the register and then measures that one repository: `archived` travels on the
   * ship, and flipping it here as well would be a second opinion about a file just written.
   */
  it('archives the pinned ship through the register', async () => {
    const invoke = bridge({ ...MEASURES, snapshot: read })
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

    /*
     * Written here with core's own functions rather than through the CLI: a machine without
     * `hafen` on the PATH could record no decision at all, and a register nobody can write is a
     * decision nobody can make.
     */
    const written = invoke.mock.calls.find(
      (call) => call[0] === 'port_write_file' && registerPath(call[1]),
    )

    expect(wrote(written)).toContain(String(snapshot.ships[0]?.path))
  })

  /**
   * A tab within a view keeps the ship where she stood and how large, the same as the view switch.
   *
   * The tabs set the page directly at first, so the fleet sheet and the one with the archive came
   * up at "everything fits" — the ship still marked, and a speck.
   */
  it('carries where the ship stood across a tab within the fleet', async () => {
    bridge({ ...MEASURES, snapshot: read })
    // A different answer every time, so the hold the new sheet gets is provably the one asked at
    // the tab and not one left over from the view switch before it.
    let asked = 0
    const page = mount(App, {
      global: {
        stubs: {
          HarborScene: {
            ...stubs.HarborScene,
            methods: {
              where: () => {
                asked += 1
                return { x: asked, y: 80, scale: 1.8 }
              },
            },
          },
        },
      },
    })
    await flushPromises()

    const scene = () =>
      page.findComponent({ name: 'HarborScene' }).vm as unknown as {
        $emit: (event: string, ...args: readonly unknown[]) => void
        hold: unknown
      }
    const button = (label: RegExp) => page.findAll('button').find((one) => label.test(one.text()))

    await button(/^Flotte/)?.trigger('click')
    scene().$emit('update:picked', snapshot.ships[0])
    await flushPromises()
    const before = asked
    await button(/^mit Archiv/)?.trigger('click')
    await flushPromises()

    expect(scene().hold).toStrictEqual({ x: before + 1, y: 80, scale: 1.8 })
  })

  /**
   * A measurement that moves the ship moves the page with her.
   *
   * Archived here, because that is a band change one click can make: the register is written, the
   * one repository measured again, and she is in another band. The page used to stay on the band
   * she had left — the datasheet still read her and the drawing no longer carried her.
   */
  it('follows the ship to the band a measurement put her in', async () => {
    const files = new Map<string, string>()
    bridge({
      ...MEASURES,
      snapshot: read,
      port_write_file: (args?: Record<string, unknown>) => {
        files.set(String(args?.['path']), String(args?.['contents']))
        return null
      },
      port_read_file: (args?: Record<string, unknown>) => files.get(String(args?.['path'])) ?? null,
    })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    const scene = () =>
      page.findComponent({ name: 'HarborScene' }).vm as unknown as {
        $emit: (event: string, ...args: readonly unknown[]) => void
        ships: readonly { path: string }[]
        centre: { path: string; archived: boolean } | null
      }
    const open = () =>
      page
        .findAll('button')
        .find((one) => one.attributes('aria-current') === 'page')
        ?.text() ?? ''

    expect(open()).toContain('Aktiv')

    scene().$emit('update:picked', snapshot.ships[0])
    await flushPromises()
    await page
      .findAll('button')
      .find((one) => one.text() === 'archivieren')
      ?.trigger('click')
    await flushPromises()

    expect(open()).toContain('Archiviert')
    // Still the one being read, and the fresh reading of her rather than the one from before.
    expect(scene().centre?.path).toBe(snapshot.ships[0]?.path)
    expect(scene().centre?.archived).toBe(true)
    expect(scene().ships.map((one) => one.path)).toContain(snapshot.ships[0]?.path)
  })
})

describe('a machine without the tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const read = {
    path: '/cache/hafen/snapshot.json',
    json: JSON.stringify(snapshot),
    error: null,
  }

  /**
   * Without git every reading comes back empty, and a harbour of nothing looks exactly like a
   * machine with no repositories on it. Two different sentences, and ninety-two silent failures
   * are not a measurement.
   */
  it('says git is missing instead of drawing an empty harbour', async () => {
    bridge({ ...MEASURES, snapshot: read, port_which: null })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    expect(page.text()).toContain('git fehlt')
    expect(page.text()).not.toContain('neu messen')
  })

  /** The harbour draws while the answer is on its way — a check must not hold the picture back. */
  it('draws the harbour where the tools are there', async () => {
    bridge({ ...MEASURES, snapshot: read })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    expect(page.text()).not.toContain('git fehlt')
    expect(page.text()).toContain('neu messen')
  })
})

describe('a machine nobody has asked yet', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const read = {
    path: '/cache/hafen/snapshot.json',
    json: JSON.stringify(snapshot),
    error: null,
  }

  /**
   * An empty harbour and an unasked machine look alike, and only one of them has a remedy.
   *
   * Asked off the **register** rather than off an empty fleet: a fleet can honestly be empty —
   * everything archived, a root that holds nothing yet — and asking somebody to answer a question
   * they have already answered is worse than not asking at all.
   */
  it('asks where the projects are when nothing says so', async () => {
    bridge({
      ...MEASURES,
      snapshot: read,
      port_places: { store: '/store', snapshot: '/s.json', roots: [] },
    })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    expect(page.text()).toContain('Der Hafen ist noch leer')
    expect(page.text()).toContain('/store/register.md')
  })

  /** And never again once it has been answered — the register is where that answer lives. */
  it('does not ask a machine that has already said', async () => {
    bridge({
      ...MEASURES,
      snapshot: read,
      port_places: { store: '/store', snapshot: '/s.json', roots: [] },
      port_read_file: '## Wurzeln\n\n- /home/wer/Projekte\n',
    })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    expect(page.text()).not.toContain('Der Hafen ist noch leer')
  })

  /** `$HAFEN_ROOT` is an override somebody typed on purpose, so it answers the question too. */
  it('does not ask where a root was handed in from the environment', async () => {
    bridge({ ...MEASURES, snapshot: read })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    expect(page.text()).not.toContain('Der Hafen ist noch leer')
  })

  /** The answer goes into the register, and the fleet is measured anew — not one repository. */
  it('writes the chosen directory to the register and measures again', async () => {
    /*
     * A filesystem that remembers, because the point is the round trip: the answer is written to
     * the register and the next measurement reads it **back** from there. One source of truth, and
     * a fixture that forgot would be testing the opposite.
     */
    const written = new Map<string, string>()
    const invoke = bridge({
      ...MEASURES,
      snapshot: read,
      port_places: { store: '/store', snapshot: '/s.json', roots: [] },
      'plugin:dialog|open': '/home/wer/Projekte',
      port_write_file: (args?: Record<string, unknown>) => {
        written.set(String(args?.['path']), String(args?.['contents']))
        return null
      },
      port_read_file: (args?: Record<string, unknown>) =>
        written.get(String(args?.['path'])) ?? null,
    })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    await page
      .findAll('button')
      .find((one) => one.text().includes('Verzeichnis wählen'))
      ?.trigger('click')
    await flushPromises()

    expect(written.get('/store/register.md')).toContain('/home/wer/Projekte')
    expect(invoke).toHaveBeenCalledWith('port_trees_with', expect.anything())
    expect(page.text()).not.toContain('Der Hafen ist noch leer')
  })

  /** Closing the picker is an answer, and nothing is written for a question nobody answered. */
  it('writes nothing when the picker is closed', async () => {
    const invoke = bridge({
      ...MEASURES,
      snapshot: read,
      port_places: { store: '/store', snapshot: '/s.json', roots: [] },
      'plugin:dialog|open': null,
    })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    await page
      .findAll('button')
      .find((one) => one.text().includes('Verzeichnis wählen'))
      ?.trigger('click')
    await flushPromises()

    expect(invoke).not.toHaveBeenCalledWith('port_write_file', expect.anything())
    expect(page.text()).toContain('Der Hafen ist noch leer')
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
    const invoke = bridge({ ...MEASURES, snapshot: read })
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

    const written = invoke.mock.calls.find(
      (call) => call[0] === 'port_write_file' && registerPath(call[1]),
    )

    expect(wrote(written)).toContain('/anderswo/ding')
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

  /**
   * Choosing the same thing twice lets go of it.
   *
   * Decided here and not in either of the two that offer the gesture: the drawing and the sheet
   * both hand a choice up, and a toggle built into one of them is a toggle the other does not do.
   */
  it('drops a choice that is made a second time', async () => {
    bridge({ snapshot: read })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    const scene = page.findComponent({ name: 'HarborScene' }).vm as {
      $emit: (event: string, ...args: readonly unknown[]) => void
    }
    scene.$emit('update:picked', snapshot.ships[0])
    scene.$emit('update:quest', { kind: 'quest', id: 'lint' })
    await flushPromises()

    expect(page.findComponent({ name: 'ShipSheet' }).props('quest')).toStrictEqual({
      kind: 'quest',
      id: 'lint',
    })

    // A fresh object with the same contents, which is what a second click actually hands up.
    scene.$emit('update:quest', { kind: 'quest', id: 'lint' })
    await flushPromises()

    expect(page.findComponent({ name: 'ShipSheet' }).props('quest')).toBeNull()
  })

  /** And a different one replaces rather than clears: two clicks on two boxes mark the second. */
  it('keeps a choice that is made on something else', async () => {
    bridge({ snapshot: read })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    const scene = page.findComponent({ name: 'HarborScene' }).vm as {
      $emit: (event: string, ...args: readonly unknown[]) => void
    }
    scene.$emit('update:picked', snapshot.ships[0])
    scene.$emit('update:quest', { kind: 'quest', id: 'lint' })
    scene.$emit('update:quest', { kind: 'forge', open: 'pull' })
    await flushPromises()

    expect(page.findComponent({ name: 'ShipSheet' }).props('quest')).toStrictEqual({
      kind: 'forge',
      open: 'pull',
    })
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

describe('a snapshot older than the window', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * Measured the hard way: a cache written before `branches` existed made the datasheet throw, and
   * what a reader saw was an empty column — no message, no clue. Every field added to `Ship` can
   * do that to every snapshot already on disk.
   */
  it('says why a datasheet could not be drawn instead of leaving a blank column', async () => {
    const old = {
      ...snapshot,
      // A ship from before the field existed.
      ships: [{ ...snapshot.ships[0], branches: undefined, contract: undefined }],
    }
    bridge({
      snapshot: { path: '/cache', json: JSON.stringify(old), error: null },
      tools: [],
    })
    const page = mount(App, { global: { stubs } })
    await flushPromises()

    const scene = page.findComponent({ name: 'HarborScene' }).vm as {
      $emit: (event: string, ...args: readonly unknown[]) => void
    }
    scene.$emit('update:picked', old.ships[0])
    await flushPromises()

    expect(page.text()).toContain('Datenblatt nicht zeichenbar')
    expect(page.text()).toContain('neu messen')
  })
})

/**
 * A bridge that answers per command, because the forge tests need two different answers out of
 * one command: `snapshot` reads the survey or the forge file depending on `which`.
 */

function bridgeBy(reply: (command: string, args?: unknown) => unknown): void {
  const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>(
    async (command, args) =>
      // Same rule as the other two: a machine has its tools unless the test answers for itself.
      await Promise.resolve(answered(reply(command, args), command)),
  )
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
}

/** The same, when the test also wants to see what was asked. */
/**
 * A window on a machine that has its tools, unless a test says otherwise.
 *
 * `port_which` answering `null` means "not installed", and the window then draws the missing-git
 * view instead of the harbour — which is exactly what it is for, and exactly wrong as a default
 * for every test that is about something else.
 */
function watchedBridge(reply: (command: string, args?: unknown) => unknown) {
  const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>(
    async (command, args) => await Promise.resolve(answered(reply(command, args), command)),
  )
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
  return invoke
}

const cached = (body: unknown) => ({ path: '/cache', json: JSON.stringify(body), error: null })

/** Which of the two caches is being asked for — the survey, or the forge reading beside it. */
const which = (args: unknown): string | undefined => (args as { which?: string } | undefined)?.which

const clicking = async (page: ReturnType<typeof mount>, label: string): Promise<void> => {
  const button = page.findAll('button').find((one) => one.text() === label)

  // Named rather than optional-chained: a click on a button that is not there would otherwise
  // pass as a test of nothing, which is how a silent no-op gets committed as coverage.
  expect(button, `kein Knopf "${label}"`).toBeDefined()

  await button?.trigger('click')
  await flushPromises()
}

/** The same guard, for a control named by its title rather than its text. */
const clickingTitled = async (page: ReturnType<typeof mount>, title: string): Promise<void> => {
  const button = page.findAll('button').find((one) => one.attributes('title') === title)

  expect(button, `kein Knopf mit Titel "${title}"`).toBeDefined()

  await button?.trigger('click')
  await flushPromises()
}

/** And for a control whose text carries a count after its label, like a tab. */
const clickingStarting = async (page: ReturnType<typeof mount>, label: string): Promise<void> => {
  const button = page.findAll('button').find((one) => one.text().startsWith(label))

  expect(button, `kein Knopf, der mit "${label}" beginnt`).toBeDefined()

  await button?.trigger('click')
  await flushPromises()
}

const pick = async (page: ReturnType<typeof mount>, one: unknown): Promise<void> => {
  const scene = page.findComponent({ name: 'HarborScene' }).vm as {
    $emit: (event: string, ...args: readonly unknown[]) => void
  }
  scene.$emit('update:picked', one)
  await flushPromises()
}

describe('the forge, from the window', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const READING = {
    at: '2026-09-30T08:00:00Z',
    stats: [
      {
        slug: { host: 'github.com', owner: 'org', repo: 'ship' },
        stars: 1743,
        watchers: 64,
        forks: 210,
        issues: 442,
        pulls: 53,
        language: 'JavaScript',
      },
    ],
    unread: [],
  }

  /**
   * What `gh api graphql` prints, which is what the window now reads.
   *
   * The forge query went through the CLI, so on a machine without `hafen` the button failed for a
   * reason that had nothing to do with the forge. It runs here now, through the port — and the
   * allow list in `ports.rs` lets exactly this one call out.
   */
  const GRAPHQL = JSON.stringify({
    data: {
      repository: {
        stargazerCount: 1743,
        forkCount: 210,
        watchers: { totalCount: 64 },
        primaryLanguage: { name: 'JavaScript' },
        issues: { totalCount: 442 },
        pullRequests: { totalCount: 53 },
        viewerPermission: 'READ',
        defaultBranchRef: { name: 'main', branchProtectionRule: null },
        rulesets: { nodes: [] },
      },
    },
  })

  /** A window that can ask: `gh` is on the PATH and answers. */
  const ASKS: Record<string, unknown> = {
    port_which: '/usr/bin/gh',
    port_run: { code: 0, stdout: GRAPHQL, stderr: '' },
    port_places: { store: '/store', snapshot: '/cache/snapshot.json', roots: ['/repos'] },
    port_write_file: null,
  }

  /** The ship the reading is about: matched on `origin`, which is the only thing that matches. */
  const withOrigin = {
    ...snapshot,
    ships: [{ ...ship(), remotes: [{ name: 'origin', url: 'git@github.com:org/ship.git' }] }],
  }

  /**
   * Its own button beside its own timestamp. The survey is six seconds of disk and this is
   * seventeen of network — one timestamp for both would date the older reading by the younger.
   */
  it('asks the forges only when asked, and draws what came back', async () => {
    const invoke = watchedBridge((command, args) => {
      if (command === 'snapshot') {
        return which(args) === 'forge' ? { json: null } : cached(withOrigin)
      }
      if (command in ASKS) {
        return ASKS[command]
      }
      return command === 'tools' ? [] : undefined
    })

    const page = mount(App, { global: { stubs } })
    await flushPromises()

    // Nothing asked on start: drawing the harbour must not wait on somebody else's server.
    expect(invoke).not.toHaveBeenCalledWith('port_run', expect.anything())

    await clicking(page, 'Forge fragen')
    await pick(page, withOrigin.ships[0])

    expect(page.text()).toContain('442')
    expect(page.text()).toContain('53')
    // Not 495, which is what GitHub's REST `open_issues_count` reports for those two.
    expect(page.text()).not.toContain('495')
  })

  /**
   * Thirteen of fifteen unread rows on this fleet are private Gitea repositories, and a plain
   * "gefragt" over a reading missing a sixth of the fleet is the quiet kind of lie.
   */
  it('says how many went unanswered, and what the first one said', async () => {
    /* A Gitea repository whose server refuses: `curl --fail` comes back non-zero. */
    const gitea = {
      ...snapshot,
      ships: [{ ...ship(), remotes: [{ name: 'origin', url: 'git@git.it4c.dev:org/zu.git' }] }],
    }
    bridgeBy((command, args) => {
      if (command === 'snapshot') {
        return which(args) === 'forge' ? { json: null } : cached(gitea)
      }
      if (command === 'port_places') {
        return { store: '/store', snapshot: '/cache/snapshot.json', roots: ['/repos'] }
      }
      if (command === 'port_run') {
        return { code: 22, stdout: '', stderr: '401 Unauthorized' }
      }
      return command === 'tools' ? [] : undefined
    })

    const page = mount(App, { global: { stubs } })
    await flushPromises()
    await clicking(page, 'Forge fragen')

    expect(page.text()).toContain('1 Repositories konnten nicht gefragt werden')
  })

  /**
   * A missing tool is said **once, up front** rather than ninety-two times as a verdict.
   *
   * That the reading itself answers "gh ist nicht installiert" is `readStats`' own promise and is
   * tested where it lives. What belongs here is the line that names the cause before anybody has
   * pressed anything: a reader who sees "nicht messbar" on every forge quest has no way to get
   * from there to a missing program.
   */
  it('names a missing forge tool before anything is asked', async () => {
    bridgeBy((command, args) => {
      if (command === 'snapshot') {
        return which(args) === 'forge' ? { json: null } : cached(withOrigin)
      }
      // Everything is on the PATH except the one that reads GitHub.
      if (command === 'port_which') {
        return (args as { command?: string } | undefined)?.command === 'gh' ? null : '/usr/bin/git'
      }
      return command === 'tools' ? [] : undefined
    })

    const page = mount(App, { global: { stubs } })
    await flushPromises()

    expect(page.text()).toContain('gh fehlt')
  })

  /** The host is checked in Rust against a closed list; a refusal from there is shown as one. */
  it('carries a refused host back to the reader', async () => {
    bridgeBy((command, args) => {
      if (command === 'snapshot') {
        return which(args) === 'forge' ? { json: JSON.stringify(READING) } : cached(withOrigin)
      }
      if (command === 'open_url') {
        return 'kein bekannter Forge-Host'
      }
      return command === 'tools' ? [] : undefined
    })

    const page = mount(App, { global: { stubs } })
    await flushPromises()
    await pick(page, withOrigin.ships[0])

    const figure = page.findAll('button').find((one) => one.text().includes('Sterne'))

    expect(figure, 'keine Forge-Kennzahl im Blatt').toBeDefined()

    await figure?.trigger('click')
    await flushPromises()

    expect(page.text()).toContain('kein bekannter Forge-Host')
  })
})

describe('deleting one branch, from the window', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stale = {
    ...snapshot,
    ships: [
      {
        ...ship(),
        defaultBranch: 'master',
        branches: [
          { name: 'master', upstream: 'origin/master', gone: false, merged: false, current: true },
          { name: 'feat/old', upstream: null, gone: true, merged: false, current: false },
        ],
      },
    ],
  }

  /**
   * One name per click, and a fresh reading of that one repository afterwards: the list the button
   * came from is a measurement, and one still showing a branch that is gone is exactly the kept
   * status field this tool exists to avoid.
   */
  it('deletes the branch on the row and reads that repository again', async () => {
    const invoke = watchedBridge((command, args) => {
      if (command === 'snapshot') {
        return which(args) === 'forge' ? { json: null } : cached(stale)
      }
      if (command === 'port_places') {
        return { store: '/store', snapshot: '/cache/snapshot.json', roots: ['/repos'] }
      }
      if (command === 'port_run') {
        return { code: 1, stdout: '', stderr: '' }
      }
      if (command === 'port_read_dir') {
        return []
      }
      if (command === 'port_real_path') {
        return (args as { path?: string } | undefined)?.path
      }
      return command === 'tools' ? [] : undefined
    })

    const page = mount(App, { global: { stubs } })
    await flushPromises()
    await pick(page, stale.ships[0])
    await clicking(page, 'löschen')

    expect(invoke).toHaveBeenCalledWith('branch_delete', {
      path: stale.ships[0]?.path,
      branch: 'feat/old',
    })
    /*
     * That one repository, read again — and in this window rather than by a second program.
     * The list the button came from is a measurement, and one still showing a branch that is gone
     * is exactly the kept status field this tool exists to avoid.
     */
    expect(invoke).not.toHaveBeenCalledWith('measure', expect.anything())
    expect(invoke).not.toHaveBeenCalledWith('port_trees_with', expect.anything())
    expect(invoke).toHaveBeenCalledWith('port_write_file', expect.anything())
  })

  /** git's refusal *is* the safety here, so its own sentence is what a reader gets. */
  it('shows git refusing rather than a deletion that did not happen', async () => {
    const invoke = watchedBridge((command, args) => {
      if (command === 'snapshot') {
        return which(args) === 'forge' ? { json: null } : cached(stale)
      }
      if (command === 'branch_delete') {
        return "error: the branch 'feat/old' is not fully merged"
      }
      return command === 'tools' ? [] : undefined
    })

    const page = mount(App, { global: { stubs } })
    await flushPromises()
    await pick(page, stale.ships[0])
    await clicking(page, 'löschen')

    expect(page.text()).toContain('not fully merged')
    expect(invoke).not.toHaveBeenCalledWith('measure', expect.anything())
  })
})

describe('the catalog page, from the window', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * Two ships, one demand, and the only two verdicts that make it a debt. Deliberately spread
   * across bands: picking a contract has to change what every tab counts, not only the open one.
   */
  const catalog = {
    ...snapshot,
    ships: [
      ship({ path: '/repos/a', name: 'a', quests: [quest('lint', 'violated')] }),
      ship({ path: '/repos/b', name: 'b', quests: [quest('lint', 'met')] }),
      ship({ path: '/repos/c', name: 'c', quests: [quest('lint', 'unmeasured')] }),
    ],
  }

  const open = async (): Promise<ReturnType<typeof mount>> => {
    bridgeBy((command, args) => {
      if (command === 'snapshot') {
        return which(args) === 'forge' ? { json: null } : cached(catalog)
      }
      return command === 'tools' ? [] : undefined
    })
    const page = mount(App, { global: { stubs } })
    await flushPromises()
    await clickingStarting(page, 'Verträge')
    return page
  }

  it('offers the catalog beside the bands and draws it instead of the basin', async () => {
    const page = await open()

    expect(page.text()).toContain('lint')
    expect(page.find('.scene-stub').exists()).toBe(false)
  })

  /**
   * Picking leaves the catalog, and that is the design rather than a side effect: the answer to
   * "who still owes this" is a harbour, and drawing it on the page that asked would have put two
   * answers in one column.
   */
  it('narrows the basin to the ships a demand found wanting', async () => {
    const page = await open()

    await clickingStarting(page, 'lint')

    expect(page.find('.scene-stub').exists()).toBe(true)
    // One violated; the met one and the unmeasured one are both out — and for different reasons.
    expect(page.text()).toContain('1 Schiffe')
    expect(page.text()).toContain('Vertrag')

    /*
     * And the demand travels with it: somebody reading about `lint` should find every datasheet
     * they open already at that line, not at the top of thirteen.
     */
    await pick(page, catalog.ships[0])

    expect(page.findComponent({ name: 'ShipSheet' }).props('quest')).toStrictEqual({
      kind: 'quest',
      id: 'lint',
    })
  })

  /** The filter is undone where it is shown, and the fleet comes back whole. */
  it('gives the fleet back when the pick is cleared', async () => {
    const page = await open()

    await clickingStarting(page, 'lint')
    await clickingTitled(page, 'Vertragsfilter aufheben')

    expect(page.text()).toContain('3 Schiffe')
  })
})

describe('searching the harbour', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const three = {
    ...snapshot,
    ships: [
      ship({ path: '/repos/a', name: 'hafen' }),
      ship({ path: '/repos/b', name: 'werft' }),
      ship({ path: '/repos/c', name: 'hafen-data' }),
    ],
  }

  const open = async (): Promise<ReturnType<typeof mount>> => {
    bridge({
      snapshot: { path: '/cache', json: JSON.stringify(three), error: null },
      tools: [],
    })
    const page = mount(App, { global: { stubs } })
    await flushPromises()
    return page
  }

  /**
   * Marked and not filtered. A search that rebuilt the harbour out of whatever matched answered
   * "what matched" and lost the question a drawing exists for: where they are.
   */
  it('keeps the whole fleet drawn and hands the matches down', async () => {
    const page = await open()

    await page.find('input[type="search"]').setValue('hafen')
    await flushPromises()

    const scene = page.findComponent({ name: 'HarborScene' })

    expect(scene.props('ships') as readonly unknown[]).toHaveLength(3)
    expect(
      (scene.props('found') as readonly { name: string }[]).map((one) => one.name),
    ).toStrictEqual(['hafen', 'hafen-data'])
  })

  it('says so where nothing matches, instead of showing an empty harbour', async () => {
    const page = await open()

    await page.find('input[type="search"]').setValue('gibtesnicht')
    await flushPromises()

    expect(page.text()).toContain('Kein Schiff passt zu')
    expect(page.findComponent({ name: 'HarborScene' }).props('ships') as unknown[]).toHaveLength(3)
  })
})
