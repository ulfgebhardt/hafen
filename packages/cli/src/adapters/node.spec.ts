import { chmod, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { nodePorts } from './node'

const MISSING = 'werft-kein-solches-binary'

/**
 * Against the real machine, not a mock: this file *is* the environment boundary, and a
 * mocked `fs` here would only prove that the mock works. The same reason the architecture
 * contract calls `git` as a command — so it stays testable.
 */
describe('nodePorts', () => {
  let dir: string

  beforeAll(async () => {
    // `realpath` because `pwd` reports the resolved path and /tmp is a symlink on some hosts.
    dir = await realpath(await mkdtemp(join(tmpdir(), 'werft-node-')))
    await writeFile(join(dir, 'file.txt'), 'inhalt', 'utf8')
    await mkdir(join(dir, 'sub'))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  describe('proc.run', () => {
    it('reports stdout and a clean exit', async () => {
      await expect(nodePorts.proc.run('echo', ['hallo'])).resolves.toStrictEqual({
        code: 0,
        stdout: 'hallo\n',
        stderr: '',
      })
    })

    it('treats a non-zero exit as data, not as a failure to throw', async () => {
      await expect(nodePorts.proc.run('false', [])).resolves.toStrictEqual({
        code: 1,
        stdout: '',
        stderr: '',
      })
    })

    it('keeps the code a number when the spawn itself fails', async () => {
      // execFile puts the errno name in `code` here — `'ENOENT'`, a string in a field the
      // port types as a number. Handed through, it reaches the snapshot the diorama reads.
      const result = await nodePorts.proc.run(MISSING, [])

      expect(result.code).toBe(1)
      expect(result.stderr).toContain('ENOENT')
    })

    it('names a missing binary instead of looking like a silent exit 1', async () => {
      const silent = await nodePorts.proc.run('false', [])
      const missing = await nodePorts.proc.run(MISSING, [])

      expect(missing).not.toStrictEqual(silent)
      expect(missing.stdout).toBe('')
    })

    it('keeps the output of a process that ran over the error message', async () => {
      // Only a failed *spawn* has nothing to say. A process that exited non-zero after
      // writing to stderr does, and that is the better answer than `Command failed: …`.
      await expect(
        nodePorts.proc.run('sh', ['-c', 'echo teil >&2; exit 3']),
      ).resolves.toStrictEqual({ code: 3, stdout: '', stderr: 'teil\n' })
    })

    it('runs in the given directory', async () => {
      const result = await nodePorts.proc.run('pwd', [], dir)

      expect(result.stdout.trim()).toBe(dir)
    })
  })

  describe('proc.which', () => {
    it('gives the absolute path of a tool on PATH', async () => {
      await expect(nodePorts.proc.which('node')).resolves.toMatch(/^\/.*node$/u)
    })

    it('gives null for a tool that is not there — absence is an answer, not an error', async () => {
      await expect(nodePorts.proc.which(MISSING)).resolves.toBeNull()
    })
  })

  describe('fs', () => {
    it('reads a file', async () => {
      await expect(nodePorts.fs.readFile(join(dir, 'file.txt'))).resolves.toBe('inhalt')
    })

    it('gives null for a missing file instead of throwing', async () => {
      await expect(nodePorts.fs.readFile(join(dir, 'weg.txt'))).resolves.toBeNull()
    })

    /**
     * With the kind, because the listing already knows it. A survey asked `isDirectory` 42 441
     * times on entries that had just come out of a listing — 86 % of all its port calls, to learn
     * something it had already been told.
     */
    it('lists a directory and says what each entry is', async () => {
      const entries = [...((await nodePorts.fs.readDir(dir)) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      )

      expect(entries).toStrictEqual([
        { name: 'file.txt', directory: false },
        { name: 'sub', directory: true },
      ])
    })

    /**
     * A link to a directory is a directory here, which a dirent does not say: `withFileTypes`
     * reports the *link's* own kind. Five of this machine's repositories are reachable only
     * through one, and they would simply have vanished from the survey.
     */
    it('counts a link to a directory as a directory', async () => {
      await symlink(join(dir, 'sub'), join(dir, 'link'))
      const entries = (await nodePorts.fs.readDir(dir)) ?? []

      expect(entries.find((one) => one.name === 'link')?.directory).toBe(true)
    })

    it('gives null for a missing directory', async () => {
      await expect(nodePorts.fs.readDir(join(dir, 'weg'))).resolves.toBeNull()
    })

    describe('the search for trees', () => {
      /**
       * The walk itself, handed to the side that has the filesystem. Done one directory at a time
       * over the port it was 2 174 of a survey's 6 676 calls; here it is one per root.
       */
      it('finds the directories that hold the marker', async () => {
        const root = await mkdtemp(join(await realpath(tmpdir()), 'hafen-trees-'))
        await mkdir(join(root, 'org/one/.git'), { recursive: true })
        await mkdir(join(root, 'org/two/.git'), { recursive: true })
        await mkdir(join(root, 'org/plain'), { recursive: true })

        const found = await nodePorts.fs.treesWith(root, '.git', 4, [])

        expect(found).toStrictEqual([join(root, 'org/one'), join(root, 'org/two')])

        await rm(root, { recursive: true, force: true })
      })

      /**
       * **Stops at each tree.** What lies inside a repository belongs to it — nine foreign
       * deployments under `Ocelot-Social/deployment/configurations`, four directus configs inside
       * `utopia-map` — and listing those separately would count one project's contents as a fleet.
       */
      it('does not look inside a tree it has found', async () => {
        const root = await mkdtemp(join(await realpath(tmpdir()), 'hafen-trees-'))
        await mkdir(join(root, 'repo/.git'), { recursive: true })
        await mkdir(join(root, 'repo/vendored/.git'), { recursive: true })

        await expect(nodePorts.fs.treesWith(root, '.git', 4, [])).resolves.toStrictEqual([
          join(root, 'repo'),
        ])

        await rm(root, { recursive: true, force: true })
      })

      /**
       * A **directory** called the marker, and that distinction is a measurement.
       *
       * A submodule's `.git` is a *file* pointing into `../.git/modules/…`. Those are measured as
       * the tenders of the repository that carries them; finding them here as well listed one
       * project's parts beside it as if they were the fleet —
       * `webcraftmedia/web-prod/lib/system` was the one that showed it.
       */
      it('passes over a marker that is a file, which is a carried repository', async () => {
        const root = await mkdtemp(join(await realpath(tmpdir()), 'hafen-trees-'))
        await mkdir(join(root, 'carried'), { recursive: true })
        await writeFile(join(root, 'carried/.git'), 'gitdir: ../.git/modules/carried')

        await expect(nodePorts.fs.treesWith(root, '.git', 4, [])).resolves.toStrictEqual([])

        await rm(root, { recursive: true, force: true })
      })

      /** The limit is why a stray link cannot turn the survey into a full disk walk. */
      it('goes no deeper than it was told', async () => {
        const root = await mkdtemp(join(await realpath(tmpdir()), 'hafen-trees-'))
        await mkdir(join(root, 'a/b/c/deep/.git'), { recursive: true })

        await expect(nodePorts.fs.treesWith(root, '.git', 2, [])).resolves.toStrictEqual([])
        await expect(nodePorts.fs.treesWith(root, '.git', 4, [])).resolves.toStrictEqual([
          join(root, 'a/b/c/deep'),
        ])

        await rm(root, { recursive: true, force: true })
      })

      it('prunes the names it was asked to and every hidden one', async () => {
        const root = await mkdtemp(join(await realpath(tmpdir()), 'hafen-trees-'))
        await mkdir(join(root, 'node_modules/dep/.git'), { recursive: true })
        await mkdir(join(root, '.cache/old/.git'), { recursive: true })
        await mkdir(join(root, 'real/.git'), { recursive: true })

        await expect(
          nodePorts.fs.treesWith(root, '.git', 4, ['node_modules']),
        ).resolves.toStrictEqual([join(root, 'real')])

        await rm(root, { recursive: true, force: true })
      })

      /** Five of this machine's repositories are reachable only through a link. */
      it('walks through a link to a directory', async () => {
        const root = await mkdtemp(join(await realpath(tmpdir()), 'hafen-trees-'))
        await mkdir(join(root, 'elsewhere/repo/.git'), { recursive: true })
        await mkdir(join(root, 'here'), { recursive: true })
        await symlink(join(root, 'elsewhere/repo'), join(root, 'here/linked'))

        await expect(
          nodePorts.fs.treesWith(join(root, 'here'), '.git', 4, []),
        ).resolves.toStrictEqual([join(root, 'here/linked')])

        await rm(root, { recursive: true, force: true })
      })

      /**
       * A link that points nowhere is not a directory, and must not stop the walk.
       *
       * Measured as a risk rather than imagined: this machine's repositories include ones
       * reachable only through a link, so links are walked — and a dangling one is what is left
       * when the target moved.
       */
      it('steps over a link that points nowhere', async () => {
        const root = await mkdtemp(join(await realpath(tmpdir()), 'hafen-trees-'))
        await mkdir(join(root, 'real/.git'), { recursive: true })
        await symlink(join(root, 'gone'), join(root, 'dangling'))

        await expect(nodePorts.fs.treesWith(root, '.git', 4, [])).resolves.toStrictEqual([
          join(root, 'real'),
        ])

        await rm(root, { recursive: true, force: true })
      })

      /**
       * A directory the walk may not read is skipped, not fatal.
       *
       * The survey runs in eighty-plus trees that are not all ours; one of them being unreadable
       * is a Tuesday, and it must cost that one directory rather than the fleet.
       */
      it('walks on past a directory it may not read', async () => {
        const root = await mkdtemp(join(await realpath(tmpdir()), 'hafen-trees-'))
        await mkdir(join(root, 'real/.git'), { recursive: true })
        await mkdir(join(root, 'shut'), { recursive: true })
        await chmod(join(root, 'shut'), 0o000)

        await expect(nodePorts.fs.treesWith(root, '.git', 4, [])).resolves.toStrictEqual([
          join(root, 'real'),
        ])

        await chmod(join(root, 'shut'), 0o700)
        await rm(root, { recursive: true, force: true })
      })

      /**
       * `null` only for a root that cannot be read, which is the one case a caller must tell from
       * "nothing there": a typo in a second root would otherwise quietly halve the fleet.
       */
      it('tells an unreadable root from an empty one', async () => {
        const root = await mkdtemp(join(await realpath(tmpdir()), 'hafen-trees-'))

        await expect(nodePorts.fs.treesWith(root, '.git', 4, [])).resolves.toStrictEqual([])
        await expect(nodePorts.fs.treesWith(join(root, 'weg'), '.git', 4, [])).resolves.toBeNull()

        await rm(root, { recursive: true, force: true })
      })
    })

    it('tells a directory from a file', async () => {
      await expect(nodePorts.fs.isDirectory(join(dir, 'sub'))).resolves.toBe(true)
      await expect(nodePorts.fs.isDirectory(join(dir, 'file.txt'))).resolves.toBe(false)
    })

    it('calls what is not there no directory instead of throwing', async () => {
      await expect(nodePorts.fs.isDirectory(join(dir, 'weg'))).resolves.toBe(false)
    })
  })

  describe('writing', () => {
    /**
     * The one writing call in the whole tool. It makes the directory above it too, because a
     * register is written before anybody has made a store — and a first run that fails with
     * ENOENT is a first run that looks broken.
     */
    it('writes a file and the directory above it', async () => {
      const path = join(dir, 'neu', 'tiefer', 'register.md')

      await expect(nodePorts.fs.writeFile(path, 'inhalt')).resolves.toBeNull()
      await expect(nodePorts.fs.readFile(path)).resolves.toBe('inhalt')
    })

    it('replaces what is already there', async () => {
      const path = join(dir, 'zweimal.md')

      await nodePorts.fs.writeFile(path, 'erst')

      await expect(nodePorts.fs.writeFile(path, 'dann')).resolves.toBeNull()
      await expect(nodePorts.fs.readFile(path)).resolves.toBe('dann')
    })

    /** The reason, not a throw: the caller asked for a change and has to be able to report why. */
    it('says why it could not write rather than throwing', async () => {
      const blocked = join(dir, 'datei.txt')
      await nodePorts.fs.writeFile(blocked, 'x')

      // A file where a directory would have to be: the one failure that is easy to arrange.

      await expect(nodePorts.fs.writeFile(join(blocked, 'darin.md'), 'y')).resolves.not.toBeNull()
    })
  })

  describe('host', () => {
    it('measures the machine it runs on', async () => {
      expect(nodePorts.host.cpuCount()).toBeGreaterThan(0)
      expect(nodePorts.host.totalMemory()).toBeGreaterThan(0)
      await expect(nodePorts.host.freeDiskBytes(dir)).resolves.toBeGreaterThan(0)
    })

    it('leaves free space unknown rather than guessing when the path is gone', async () => {
      await expect(nodePorts.host.freeDiskBytes(join(dir, 'weg'))).resolves.toBeNull()
    })
  })

  describe('clock', () => {
    it('reads the wall clock', () => {
      expect(nodePorts.clock.now().getTime()).toBeCloseTo(Date.now(), -4)
    })
  })
})
