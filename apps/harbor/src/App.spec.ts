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
    async (command, args) => Promise.resolve(reply(command, args)),
  )
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
}

/** The same, when the test also wants to see what was asked. */
function watchedBridge(reply: (command: string, args?: unknown) => unknown) {
  const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>(
    async (command, args) => Promise.resolve(reply(command, args)),
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
      if (command === 'forge') {
        return { json: JSON.stringify(READING), error: null }
      }
      return command === 'tools' ? [] : null
    })

    const page = mount(App, { global: { stubs } })
    await flushPromises()

    // Nothing asked on start: drawing the harbour must not wait on somebody else's server.
    expect(invoke).not.toHaveBeenCalledWith('forge', expect.anything())

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
    const unread = {
      ...READING,
      unread: [
        {
          slug: { host: 'git.it4c.dev', owner: 'org', repo: 'zu' },
          reason: 'HAFEN_GITEA_TOKEN setzen',
        },
      ],
    }
    bridgeBy((command, args) => {
      if (command === 'snapshot') {
        return which(args) === 'forge' ? { json: null } : cached(snapshot)
      }
      if (command === 'forge') {
        return { json: JSON.stringify(unread), error: null }
      }
      return command === 'tools' ? [] : null
    })

    const page = mount(App, { global: { stubs } })
    await flushPromises()
    await clicking(page, 'Forge fragen')

    expect(page.text()).toContain('1 Repositories konnten nicht gefragt werden')
    expect(page.text()).toContain('HAFEN_GITEA_TOKEN setzen')
  })

  it('shows what a failed query said instead of an empty panel', async () => {
    bridgeBy((command, args) => {
      if (command === 'snapshot') {
        return which(args) === 'forge' ? { json: null } : cached(snapshot)
      }
      if (command === 'forge') {
        return { json: null, error: 'gh ist nicht installiert' }
      }
      return command === 'tools' ? [] : null
    })

    const page = mount(App, { global: { stubs } })
    await flushPromises()
    await clicking(page, 'Forge fragen')

    expect(page.text()).toContain('gh ist nicht installiert')
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
      return command === 'tools' ? [] : null
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
      if (command === 'measure') {
        return { json: JSON.stringify(stale), error: null }
      }
      return command === 'tools' ? [] : null
    })

    const page = mount(App, { global: { stubs } })
    await flushPromises()
    await pick(page, stale.ships[0])
    await clicking(page, 'ausführen')

    expect(invoke).toHaveBeenCalledWith('branch_delete', {
      path: stale.ships[0]?.path,
      branch: 'feat/old',
    })
    expect(invoke).toHaveBeenCalledWith('measure', { only: stale.ships[0]?.path })
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
      return command === 'tools' ? [] : null
    })

    const page = mount(App, { global: { stubs } })
    await flushPromises()
    await pick(page, stale.ships[0])
    await clicking(page, 'ausführen')

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
      return command === 'tools' ? [] : null
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
