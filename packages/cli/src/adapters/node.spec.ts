import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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
