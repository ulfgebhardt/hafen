import { afterEach, describe, expect, it, vi } from 'vitest'

import { inTauri, loadSnapshot, SnapshotError } from './snapshot'

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
