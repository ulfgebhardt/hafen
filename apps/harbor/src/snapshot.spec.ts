import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  adopt,
  availableTools,
  deleteBranch,
  inTauri,
  loadForge,
  loadSnapshot,
  openForge,
  refetchForge,
  remeasure,
  setRegister,
  SnapshotError,
  spliceShip,
  startTool,
  statsFor,
} from './snapshot'

import type { Forge, Snapshot } from './snapshot'
import type { Ship } from '@hafen/core'

const SNAPSHOT = { at: '2026-09-30T00:00:00Z', root: '/repos', ships: [] }

/** Tauri's bridge as the webview sees it: one global, one function on it. */
function asApp(answer: unknown): void {
  const invoke = vi.fn<(command: string) => Promise<unknown>>(async () => Promise.resolve(answer))
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
}

function asBrowser(response: Partial<Response> & { json?: () => Promise<unknown> }): void {
  vi.stubGlobal('__TAURI_INTERNALS__', undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async () => Promise.resolve(response as Response)),
  )
}

describe('snapshot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe(inTauri, () => {
    it('knows which of the two places it is running in', () => {
      asApp({})

      expect(inTauri()).toBe(true)

      vi.stubGlobal('__TAURI_INTERNALS__', undefined)

      expect(inTauri()).toBe(false)
    })

    /** A global that exists but carries no `invoke` is not Tauri, and must not be read as it. */
    it('is not fooled by a global without an invoke', () => {
      vi.stubGlobal('__TAURI_INTERNALS__', { invoke: 'nicht aufrufbar' })

      expect(inTauri()).toBe(false)
    })
  })

  describe(loadSnapshot, () => {
    it('reads the file the app hands it, and says where it was', async () => {
      asApp({ path: '/cache/hafen/snapshot.json', json: JSON.stringify(SNAPSHOT), error: null })

      const loaded = await loadSnapshot()

      expect(loaded.snapshot.root).toBe('/repos')
      expect(loaded.source).toBe('/cache/hafen/snapshot.json')
    })

    /**
     * The path travels with the failure, because it is the one useful thing to say about a
     * snapshot that is not there — a message without it sends a human looking for a file the
     * program already knows the name of.
     */
    it('carries the path and the remedy when the app finds nothing', async () => {
      asApp({ path: '/cache/hafen/snapshot.json', json: null, error: 'No such file' })

      // `toMatchObject` rather than a `catch` with assertions in it: a conditional expect
      // passes silently when the promise unexpectedly resolves.
      await expect(loadSnapshot()).rejects.toThrow(SnapshotError)
      await expect(loadSnapshot()).rejects.toMatchObject({
        message: 'No such file',
        source: '/cache/hafen/snapshot.json',
        remedy: expect.stringContaining('hafen schnappschuss') as unknown as string,
      })
    })

    it('fetches from public/ in a browser', async () => {
      asBrowser({ ok: true, json: async () => Promise.resolve(SNAPSHOT) })

      const loaded = await loadSnapshot()

      expect(loaded.snapshot.root).toBe('/repos')
      expect(loaded.source).toBe('snapshot.json')
    })

    /** The two paths fail differently, and a human fixes them differently. */
    it('names the http status and the pnpm remedy in a browser', async () => {
      asBrowser({ ok: false, status: 404, statusText: 'Not Found' })

      await expect(loadSnapshot()).rejects.toMatchObject({
        message: '404 Not Found',
        remedy: expect.stringContaining('pnpm') as unknown as string,
      })
    })

    it('names a fetch that never got anywhere', async () => {
      vi.stubGlobal('__TAURI_INTERNALS__', undefined)
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () => Promise.reject(new Error('offline'))),
      )

      await expect(loadSnapshot()).rejects.toThrow('offline')
    })
  })
})

/** A ship with just the fields these tests compare — the rest is core's business. */
function ship(path: string, name = path.split('/').at(-1) ?? ''): unknown {
  return { path, name }
}

/**
 * The bridge with a reply per command, so one test can watch a whole round trip.
 *
 * Returns the spy, because what the window *asked for* is half of what is worth asserting here:
 * a per-project refresh that quietly measured the whole fleet would pass every test about its
 * result.
 */
function asAppWith(replies: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const invoke = vi.fn<(command: string) => Promise<unknown>>(async (command) =>
    Promise.resolve(replies[command]),
  )
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
  return invoke
}

describe('acting on the harbour', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe(spliceShip, () => {
    it('replaces the one that was measured and leaves the rest where they were', () => {
      const before = { ...SNAPSHOT, ships: [ship('/a'), ship('/b'), ship('/c')] } as Snapshot
      const fresh = { ...SNAPSHOT, at: 'später', ships: [ship('/b', 'neu')] } as Snapshot

      const after = spliceShip(before, fresh)

      expect(after.ships.map((one) => one.name)).toStrictEqual(['a', 'neu', 'c'])
      expect(after.at).toBe('später')
    })

    /** A repository measured for the first time is added rather than dropped on the floor. */
    it('takes on a ship it did not have', () => {
      const before = { ...SNAPSHOT, ships: [ship('/a')] } as Snapshot
      const after = spliceShip(before, { ...SNAPSHOT, ships: [ship('/neu')] } as Snapshot)

      expect(after.ships.map((one) => one.path)).toStrictEqual(['/a', '/neu'])
    })

    /**
     * One that no longer measures as a ship stays where it was. It would otherwise vanish under a
     * person who was reading it, for a reason nothing on screen could explain.
     */
    it('does not remove a ship the fresh answer is silent about', () => {
      const before = { ...SNAPSHOT, ships: [ship('/a'), ship('/b')] } as Snapshot
      const after = spliceShip(before, { ...SNAPSHOT, ships: [ship('/a')] } as Snapshot)

      expect(after.ships).toHaveLength(2)
    })
  })

  describe(remeasure, () => {
    it('measures everything and writes what it got', async () => {
      const fresh = { ...SNAPSHOT, at: 'jetzt', ships: [ship('/a')] }
      const invoke = asAppWith({
        measure: { json: JSON.stringify(fresh), error: null },
        store: null,
      })

      const after = await remeasure(SNAPSHOT)

      expect(after.ships).toHaveLength(1)
      expect(invoke).toHaveBeenCalledWith('measure', { only: null })
      expect(invoke).toHaveBeenCalledWith('store', { json: JSON.stringify(after) })
    })

    /** The whole point of the per-project button: it must not measure the other eighty-nine. */
    it('asks for one repository when it was given one', async () => {
      const invoke = asAppWith({
        measure: { json: JSON.stringify({ ...SNAPSHOT, ships: [ship('/a', 'neu')] }), error: null },
        store: null,
      })
      const before = { ...SNAPSHOT, ships: [ship('/a'), ship('/b')] } as Snapshot

      const after = await remeasure(before, '/a')

      expect(invoke).toHaveBeenCalledWith('measure', { only: '/a' })
      expect(after.ships.map((one) => one.name)).toStrictEqual(['neu', 'b'])
    })

    it('reports what the measurement said rather than an empty harbour', async () => {
      asAppWith({ measure: { json: null, error: 'hafen nicht ausführbar' } })

      await expect(remeasure(SNAPSHOT as Snapshot)).rejects.toThrow('hafen nicht ausführbar')
    })

    /**
     * A write that failed is said out loud: the picture on screen is right and the next start
     * would not be, and only one of those two is visible from here.
     */
    it('says when the cache could not be written', async () => {
      asAppWith({
        measure: { json: JSON.stringify(SNAPSHOT), error: null },
        store: 'Platte voll',
      })

      await expect(remeasure(SNAPSHOT as Snapshot)).rejects.toThrow('Platte voll')
    })

    it('refuses in a window that has no shell', async () => {
      vi.stubGlobal('__TAURI_INTERNALS__', undefined)

      await expect(remeasure(SNAPSHOT as Snapshot)).rejects.toThrow('ohne Hafen-Huelle')
    })
  })

  describe(setRegister, () => {
    /**
     * `archived` is not flipped here: the register decides it and the ship carries it, so the
     * answer comes back from a fresh measurement of that one repository. Two opinions about a file
     * that was just written is the kept status field the whole tool exists to avoid.
     */
    it('writes the register and then measures that repository again', async () => {
      const invoke = asAppWith({
        register: null,
        measure: { json: JSON.stringify({ ...SNAPSHOT, ships: [ship('/a', 'neu')] }), error: null },
        store: null,
      })
      const before = { ...SNAPSHOT, ships: [ship('/a')] } as Snapshot

      const after = await setRegister(before, 'archivieren', '/a')

      expect(invoke).toHaveBeenCalledWith('register', { action: 'archivieren', path: '/a' })
      expect(invoke).toHaveBeenCalledWith('measure', { only: '/a' })
      // `adopt` fills what an older snapshot never recorded, so the ship comes back filled out.
      expect(after.ships[0]).toMatchObject(ship('/a', 'neu') as object)
    })

    it('does not measure when the register refused', async () => {
      const invoke = asAppWith({ register: 'Register nicht schreibbar' })

      await expect(setRegister(SNAPSHOT as Snapshot, 'archivieren', '/a')).rejects.toThrow(
        'Register nicht schreibbar',
      )
      expect(invoke).not.toHaveBeenCalledWith('measure', expect.anything())
    })

    it('refuses in a window that has no shell', async () => {
      vi.stubGlobal('__TAURI_INTERNALS__', undefined)

      await expect(setRegister(SNAPSHOT as Snapshot, 'archivieren', '/a')).rejects.toThrow(
        'Register nicht aendern',
      )
    })
  })
})

describe('the tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers only what the shell said it has, and only names it knows', async () => {
    asAppWith({ tools: ['lazygit', 'prune', 'rm'] })

    await expect(availableTools()).resolves.toStrictEqual(['lazygit', 'prune'])
  })

  /**
   * An answer this cannot read is no tools rather than a thrown error: whatever went wrong with
   * the tool list, it must not be the reason the harbour fails to draw.
   */
  it('answers with nothing rather than throwing on an answer it cannot read', async () => {
    asAppWith({ tools: { nope: true } })

    await expect(availableTools()).resolves.toStrictEqual([])
  })

  it('has nothing to offer in a window without a shell', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', undefined)

    await expect(availableTools()).resolves.toStrictEqual([])
    await expect(startTool('lazygit', '/a')).rejects.toThrow('kein Werkzeug')
    await expect(deleteBranch('/a', 'feat')).rejects.toThrow('kein Branch')
  })

  it('starts a tool where the ship lies, and says when it could not', async () => {
    const invoke = asAppWith({ run_tool: null })

    await startTool('lazygit', '/repos/org/ship')

    expect(invoke).toHaveBeenCalledWith('run_tool', {
      name: 'lazygit',
      path: '/repos/org/ship',
    })

    asAppWith({ run_tool: 'kein Terminal gefunden' })

    await expect(startTool('shell', '/a')).rejects.toThrow('kein Terminal')
  })

  /** git's refusal is the safety, so its sentence is the whole answer. */
  it('passes the refusal from git through when a branch will not go', async () => {
    asAppWith({ branch_delete: "error: the branch 'feat' is not fully merged" })

    await expect(deleteBranch('/a', 'feat')).rejects.toThrow('not fully merged')
  })
})

describe(adopt, () => {
  /**
   * Every field added to `Ship` blanked the datasheet once: the type says a ship has `branches`,
   * the cache written last week says nothing of the kind, and the reader throws. Guarding at each
   * reader is the wrong shape — the type is *right* about a freshly measured ship, so every guard
   * reads as unnecessary and the linter says so, and the next field has the same accident waiting.
   */
  it('fills what an older snapshot never recorded', () => {
    const old = { ...SNAPSHOT, ships: [{ path: '/a', name: 'a' }] } as unknown as Snapshot

    expect(adopt(old).ships[0]).toMatchObject({
      branches: [],
      submodules: [],
      enlisted: false,
    })
  })

  /** Empty and never invented: what an old measurement did not record, this cannot know. */
  it('leaves what a snapshot did record alone', () => {
    const measured = {
      ...SNAPSHOT,
      ships: [{ path: '/a', enlisted: true, branches: [{ name: 'main' }], submodules: [] }],
    } as unknown as Snapshot
    const [one] = adopt(measured).ships

    expect(one?.enlisted).toBe(true)
    expect(one?.branches).toHaveLength(1)
  })
})

describe('the forge reading, beside the survey and never inside it', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const READING = {
    at: '2026-09-30T08:00:00Z',
    stats: [
      {
        slug: { host: 'github.com', owner: 'UlfGebhardt', repo: 'Hafen' },
        stars: 3,
        watchers: 2,
        forks: 1,
        issues: 7,
        pulls: 4,
        language: 'TypeScript',
      },
    ],
    unread: [{ slug: { host: 'git.it4c.dev', owner: 'org', repo: 'zu' }, reason: 'nicht lesbar' }],
  }

  /** A file that was never written is "never asked", which is a state and not a failure. */
  it('reads nothing as never asked, in either window', async () => {
    asAppWith({ snapshot: { json: null } })

    await expect(loadForge()).resolves.toMatchObject({ at: '', stats: [] })

    asBrowser({ ok: false })

    await expect(loadForge()).resolves.toMatchObject({ at: '', stats: [] })
  })

  it('reads the reading the app hands it', async () => {
    const invoke = asAppWith({ snapshot: { json: JSON.stringify(READING) } })
    const read = await loadForge()

    // Its own file beside the snapshot, asked for by name — one cache reader, two names.
    expect(invoke).toHaveBeenCalledWith('snapshot', { which: 'forge' })
    expect(read.stats).toHaveLength(1)
    expect(read.at).toBe('2026-09-30T08:00:00Z')
  })

  /** Half a reading is not a reading: anything unparsable reads as never asked. */
  it('falls back rather than throwing at the caller', async () => {
    asAppWith({ snapshot: { json: 'kein JSON' } })

    await expect(loadForge()).resolves.toStrictEqual({ at: '', stats: [], unread: [] })
  })

  it('has no forge to ask in a window without a shell', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', undefined)

    await expect(refetchForge()).rejects.toThrow('keine Forge')
  })

  it('asks again and keeps the answer in its own file', async () => {
    const invoke = asAppWith({
      forge: { json: JSON.stringify(READING), error: null },
      store: null,
    })
    const read = await refetchForge()

    expect(read.unread).toHaveLength(1)
    expect(invoke).toHaveBeenCalledWith('store', {
      json: JSON.stringify(READING),
      which: 'forge',
    })
  })

  /**
   * A reading that arrived and could not be kept is still said out loud. Silently dropping it
   * would mean seventeen seconds of somebody else's server asked for again on the next start.
   */
  it('names a reading it could not keep, and one it never got', async () => {
    asAppWith({ forge: { json: JSON.stringify(READING), error: null }, store: 'kein Platz' })

    await expect(refetchForge()).rejects.toThrow(SnapshotError)

    asAppWith({ forge: { json: null, error: 'gh nicht installiert' } })

    await expect(refetchForge()).rejects.toThrow('gh nicht installiert')

    asAppWith({ forge: { json: null, error: null } })

    await expect(refetchForge()).rejects.toThrow('ohne Antwort')
  })

  describe(statsFor, () => {
    const withOrigin = (url: string): Ship =>
      ({ remotes: [{ name: 'origin', url }] }) as unknown as Ship

    /**
     * Matched on the slug rather than merged into the ship: the two readings have different ages,
     * and folding one into the other gives the older number the younger timestamp.
     *
     * Case-insensitively, because a remote's spelling is not the API's — `UlfGebhardt/Hafen` and
     * `ulfgebhardt/hafen` are one repository, and the forge answers with its own capitalisation.
     */
    it('finds the figures for a ship by what its origin points at', () => {
      const forge = READING as unknown as Forge

      expect(statsFor(forge, withOrigin('git@github.com:ulfgebhardt/hafen.git'))?.stars).toBe(3)
    })

    /** No origin, an unreadable one, or one nobody asked about: null, never another ship's row. */
    it('says nothing rather than the nearest row', () => {
      const forge = READING as unknown as Forge

      expect(statsFor(forge, withOrigin('git@github.com:someone/else.git'))).toBeNull()
      expect(statsFor(forge, withOrigin('/srv/git/bare'))).toBeNull()
      expect(statsFor(forge, { remotes: [] } as unknown as Ship)).toBeNull()
    })
  })

  describe(openForge, () => {
    /** The host is checked in Rust against a closed list — this only asks. */
    it('hands the url to the side that checks it', async () => {
      const invoke = asAppWith({ open_url: null })

      await openForge('https://github.com/ulfgebhardt/hafen')

      expect(invoke).toHaveBeenCalledWith('open_url', {
        url: 'https://github.com/ulfgebhardt/hafen',
      })
    })

    it('passes a refused host through as the refusal it is', async () => {
      asAppWith({ open_url: 'kein bekannter Forge-Host' })

      await expect(openForge('https://example.org/x')).rejects.toThrow('kein bekannter Forge-Host')
    })

    /** In a browser the browser opens it, and there is nothing to check on this side. */
    it('opens a tab where there is no shell', async () => {
      vi.stubGlobal('__TAURI_INTERNALS__', undefined)
      const open = vi.fn<typeof globalThis.open>()
      vi.stubGlobal('open', open)

      await openForge('https://github.com/x/y')

      expect(open).toHaveBeenCalledWith('https://github.com/x/y', '_blank', 'noopener')
    })
  })
})
