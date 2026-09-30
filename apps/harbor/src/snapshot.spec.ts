import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  inTauri,
  loadSnapshot,
  remeasure,
  setRegister,
  SnapshotError,
  spliceShip,
} from './snapshot'

import type { Snapshot } from './snapshot'

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
      expect(after.ships[0]).toStrictEqual(ship('/a', 'neu'))
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
