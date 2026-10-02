import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  adopt,
  availableTools,
  deleteBranch,
  inTauri,
  loadForge,
  loadSnapshot,
  measuring,
  openForge,
  refetchForge,
  remeasure,
  setRegister,
  SnapshotError,
  spliceShip,
  startTool,
  statsFor,
  stopMeasuring,
} from './snapshot'

import type { Progress } from './components/measuring'
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
  const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
    async (command, args) =>
      await Promise.resolve(
        typeof replies[command] === 'function'
          ? (replies[command] as (a?: Record<string, unknown>) => unknown)(args)
          : replies[command],
      ),
  )
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
  return invoke
}

/**
 * A window that can measure: the places, and a filesystem that answers nothing.
 *
 * The survey itself is `packages/core`'s and is tested there against its own mock. What is tested
 * here is that the window drives it — where it looks, what it writes, and what it does when that
 * fails. A repository whose git calls all come back empty is still a ship, which is what makes
 * this a short fixture rather than a fake fleet.
 */
const MEASURING: Record<string, unknown> = {
  port_places: { store: '/store', snapshot: '/cache/snapshot.json', roots: ['/repos'] },
  port_trees_with: ['/repos/org/a'],
  // The root is readable and holds nothing the walk needs to see — `port_trees_with` is what
  // finds the repositories now.
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
    })

    /**
     * The fleet's timestamp is about the fleet. Measuring one repository used to stamp the other
     * ninety-one with a minute they were not read in — and the header says that minute out loud.
     */
    it('leaves the whole fleet timestamp where it was', () => {
      const before = { ...SNAPSHOT, ships: [ship('/a'), ship('/b')] } as Snapshot
      const fresh = { ...SNAPSHOT, at: 'später', ships: [ship('/b', 'neu')] } as Snapshot

      const after = spliceShip(before, fresh)

      expect(after.at).toBe(SNAPSHOT.at)
      expect(after.touched).toBe('später')
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
    /**
     * The window measures **by itself** now.
     *
     * It used to start the CLI — `$HAFEN_CLI`, else `hafen` on the PATH — and on a stranger's
     * machine neither exists, so a downloaded binary measured nothing and showed an error with an
     * environment variable in it.
     */
    it('measures the fleet itself and writes what it got', async () => {
      const invoke = asAppWith(MEASURING)

      const after = await remeasure(SNAPSHOT)

      expect(after.ships).toHaveLength(1)
      expect(after.ships[0]?.path).toBe('/repos/org/a')
      // No CLI anywhere in it.
      expect(invoke).not.toHaveBeenCalledWith('measure', expect.anything())
      expect(invoke).toHaveBeenCalledWith('port_trees_with', expect.anything())
      expect(invoke).toHaveBeenCalledWith('port_write_file', {
        path: '/cache/snapshot.json',
        contents: JSON.stringify(after),
      })
    })

    /** The whole point of the per-project button: it must not measure the other eighty-nine. */
    it('reads one repository when it was given one, and searches for none', async () => {
      const invoke = asAppWith(MEASURING)
      const before = { ...SNAPSHOT, ships: [ship('/a'), ship('/b')] } as Snapshot

      const after = await remeasure(before, '/a')

      expect(invoke).not.toHaveBeenCalledWith('port_trees_with', expect.anything())
      expect(after.ships.map((one) => one.path)).toStrictEqual(['/a', '/b'])
    })

    /**
     * A write that failed is said out loud: the picture on screen is right and the next start
     * would not be, and only one of those two is visible from here.
     */
    it('says when the cache could not be written', async () => {
      asAppWith({ ...MEASURING, port_write_file: 'Platte voll' })

      await expect(remeasure(SNAPSHOT as Snapshot)).rejects.toThrow('Platte voll')
    })

    /** A machine nobody has told where to look has no roots — an empty harbour, not a guess. */
    it('measures nothing where no root has been named', async () => {
      asAppWith({
        ...MEASURING,
        port_places: { store: '/store', snapshot: '/cache/snapshot.json', roots: [] },
      })

      await expect(remeasure(SNAPSHOT as Snapshot)).resolves.toHaveProperty('ships', [])
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
      const invoke = asAppWith(MEASURING)
      const before = { ...SNAPSHOT, ships: [ship('/a')] } as Snapshot

      const after = await setRegister(before, 'archivieren', '/a')

      /*
       * Written here with `packages/core`'s own functions. It went through the CLI before, so a
       * machine without `hafen` on the PATH could record no decision at all — and a register
       * nobody can write is a decision nobody can make.
       */
      expect(invoke).not.toHaveBeenCalledWith('register', expect.anything())

      const written = invoke.mock.calls.find(
        (call) => call[0] === 'port_write_file' && registerPath(call[1]),
      )

      expect(wrote(written)).toContain('- /a')
      // That one repository and no search: the register decides, the ship carries, and the answer
      // comes back from measuring it again.
      expect(invoke).not.toHaveBeenCalledWith('port_trees_with', expect.anything())
      expect(after.ships.map((one) => one.path)).toStrictEqual(['/a'])
    })

    it('does not measure when the register could not be written', async () => {
      const invoke = asAppWith({ ...MEASURING, port_write_file: 'Register nicht schreibbar' })

      await expect(setRegister(SNAPSHOT as Snapshot, 'archivieren', '/a')).rejects.toThrow(
        'Register nicht schreibbar',
      )
      expect(invoke).not.toHaveBeenCalledWith('port_trees_with', expect.anything())
    })

    /** A path nobody named is a decision about nothing, and it must not write one. */
    it('refuses an empty path', async () => {
      asAppWith(MEASURING)

      await expect(setRegister(SNAPSHOT as Snapshot, 'archivieren', '  ')).rejects.toThrow(
        'kein Pfad',
      )
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
      lines: null,
      roots: [],
    })
  })

  /**
   * And the one field that is *inside* a list, which a spread cannot reach.
   *
   * A submodule gained its url with kinship. An older cache holds the entries without one, so the
   * list is there, `submodules: []` never fires, and the first reader of `tender.url` gets
   * `undefined` where the type promises `string | null` — which is exactly what blanked the
   * datasheet with "undefined is not an object (evaluating 'ship.roots')" beside it.
   */
  it('fills a field inside a list the same way', () => {
    const old = {
      ...SNAPSHOT,
      ships: [
        { path: '/a', name: 'a', submodules: [{ path: 'lib', state: 'aboard', at: 'aaaa' }] },
      ],
    } as unknown as Snapshot

    expect(adopt(old).ships[0]?.submodules[0]).toStrictEqual({
      path: 'lib',
      state: 'aboard',
      at: 'aaaa',
      url: null,
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

  /** The ship a forge reading is about: matched on `origin`, which is the only thing that matches. */
  const WITH_ORIGIN = {
    ...SNAPSHOT,
    ships: [
      {
        ...(ship('/a') as object),
        remotes: [{ name: 'origin', url: 'git@github.com:org/ship.git', forge: 'github' }],
      },
    ],
  }

  /** What `gh api graphql` prints, which is what the window now reads. */
  const GRAPHQL = JSON.stringify({
    data: {
      repository: {
        stargazerCount: 1743,
        forkCount: 210,
        watchers: { totalCount: 64 },
        primaryLanguage: { name: 'TypeScript' },
        issues: { totalCount: 442 },
        pullRequests: { totalCount: 53 },
        viewerPermission: 'READ',
        defaultBranchRef: { name: 'main', branchProtectionRule: null },
        rulesets: { nodes: [] },
      },
    },
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
    unread: [{ slug: { host: 'git.seefahrt.example', owner: 'org', repo: 'zu' }, reason: 'nicht lesbar' }],
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

  /**
   * Asked here, in this window.
   *
   * It went through the CLI, so on a machine without `hafen` the button failed for a reason that
   * had nothing to do with the forge. It is the one thing in this tool that leaves the machine,
   * and it still only does so when somebody presses it.
   */
  it('asks the forge itself and keeps the answer in its own file', async () => {
    const invoke = asAppWith({
      ...MEASURING,
      snapshot: { path: '/cache/snapshot.json', json: JSON.stringify(WITH_ORIGIN), error: null },
      port_which: '/usr/bin/gh',
      port_run: { code: 0, stdout: GRAPHQL, stderr: '' },
    })

    const read = await refetchForge()

    expect(read.stats).toHaveLength(1)
    expect(read.stats[0]?.issues).toBe(442)
    // No second program, and the reading lands beside the snapshot rather than under a cache key.
    expect(invoke).not.toHaveBeenCalledWith('forge', expect.anything())
    expect(invoke).toHaveBeenCalledWith('port_write_file', {
      path: '/cache/forge.json',
      contents: JSON.stringify(read),
    })
  })

  /**
   * A reading that arrived and could not be kept is still said out loud. Silently dropping it
   * would mean somebody else's server asked again on the next start.
   */
  it('names a reading it could not keep', async () => {
    asAppWith({
      ...MEASURING,
      snapshot: { path: '/cache/snapshot.json', json: JSON.stringify(WITH_ORIGIN), error: null },
      port_which: '/usr/bin/gh',
      port_run: { code: 0, stdout: GRAPHQL, stderr: '' },
      port_write_file: 'kein Platz',
    })

    await expect(refetchForge()).rejects.toThrow(SnapshotError)
  })

  /**
   * A missing tool is a **reading**, not an error: the repository is named, the reason is named,
   * and nothing is invented in its place.
   */
  it('brings back a repository it could not ask, with the reason', async () => {
    asAppWith({
      ...MEASURING,
      snapshot: { path: '/cache/snapshot.json', json: JSON.stringify(WITH_ORIGIN), error: null },
      port_which: null,
    })

    const read = await refetchForge()

    expect(read.stats).toStrictEqual([])
    expect(read.unread[0]?.reason).toContain('gh ist nicht installiert')
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

describe('watching a measurement', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * The progress is the window's own now.
   *
   * It used to be a *process* with a progress file that this side polled through a command. A
   * window that measures by itself has neither a process nor a file, and asking a command for a
   * number this module already holds would be the longer way round to the same answer.
   */
  it('counts the fleet and then the repositories as they land', async () => {
    const seen: Progress[] = []
    asAppWith({
      ...MEASURING,
      port_trees_with: ['/repos/org/a', '/repos/org/b'],
      port_run: () => {
        seen.push(measuring())
        return { code: 1, stdout: '', stderr: '' }
      },
    })

    await remeasure(SNAPSHOT)

    // Counted before the first repository was read, and running while it was.
    expect(seen.some((one) => one.of === 2 && one.running)).toBe(true)
    // And still when it is over: the bar is put away by the caller, not by a stale reading.
    expect(measuring().running).toBe(false)
  })

  /**
   * Stopping keeps what was measured.
   *
   * It was a signal to a separate process; it is a flag the survey reads before each repository
   * now. A reading already taken is true whether or not the rest followed, and throwing it away
   * because the rest did not is the one thing a measurement must never do.
   */
  it('stops the survey and keeps what it had', () => {
    stopMeasuring()

    expect(measuring().stopped).toBe(true)
  })
})
