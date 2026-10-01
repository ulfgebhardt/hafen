import { afterEach, describe, expect, it, vi } from 'vitest'

import { canMeasure, readMachine, tauriPorts } from './tauri'

const withInvoke = (invoke: unknown): void => {
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
}

describe(canMeasure, () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * A browser can still read a published snapshot, so the absence of the Rust half is an answer
   * and not a failure: the window says what it cannot do rather than refusing to load.
   */
  it('says whether there is a Rust half at all', () => {
    expect(canMeasure()).toBe(false)

    withInvoke(async () => Promise.resolve(null))

    expect(canMeasure()).toBe(true)
  })
})

describe('the ports', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hands a command and its arguments across as they were given', async () => {
    const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
      async () => ({ code: 0, stdout: 'x', stderr: '' }),
    )
    withInvoke(invoke)

    const ran = await tauriPorts.proc.run('git', ['status', '--porcelain'], '/repo')

    expect(invoke).toHaveBeenCalledWith('port_run', {
      command: 'git',
      args: ['status', '--porcelain'],
      cwd: '/repo',
    })
    expect(ran).toStrictEqual({ code: 0, stdout: 'x', stderr: '' })
  })

  /** `cwd` is optional in the port and must cross as an explicit nothing, not as an absence. */
  it('says so when a call has no working directory', async () => {
    const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
      async () => Promise.resolve({ code: 0, stdout: '', stderr: '' }),
    )
    withInvoke(invoke)

    await tauriPorts.proc.run('git', ['rev-parse'])

    expect(invoke).toHaveBeenCalledWith('port_run', {
      command: 'git',
      args: ['rev-parse'],
      cwd: null,
    })
  })

  /**
   * The platform is **not** handed in. Which names an executable may carry is a fact about the
   * machine, and a webview that could claim to be Windows would be deciding which files count as
   * programs.
   */
  it('asks for a program without saying what kind of machine this is', async () => {
    const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
      async () => '/usr/bin/git',
    )
    withInvoke(invoke)

    await expect(tauriPorts.proc.which('git')).resolves.toBe('/usr/bin/git')
    expect(invoke).toHaveBeenCalledWith('port_which', { command: 'git' })
  })

  it('reads and writes through the named commands and nothing else', async () => {
    const seen: string[] = []
    withInvoke(async (command: string) => {
      seen.push(command)
      return Promise.resolve(null)
    })

    await tauriPorts.fs.readFile('/a')
    await tauriPorts.fs.readDir('/a')
    await tauriPorts.fs.isDirectory('/a')
    await tauriPorts.fs.realPath('/a')
    await tauriPorts.fs.writeFile('/a', 'x')

    expect(seen).toStrictEqual([
      'port_read_file',
      'port_read_dir',
      'port_is_directory',
      'port_real_path',
      'port_write_file',
    ])
  })

  /** Without the Rust half a call fails loudly, and it fails on the call rather than on import. */
  it('refuses to measure where there is nothing to measure with', async () => {
    await expect(tauriPorts.fs.readFile('/a')).rejects.toThrow('Rust-Haelfte')
  })

  /** Unmeasured is a nought and never a guess: nothing in core reads these today. */
  it('answers about the machine once it has been asked for', async () => {
    withInvoke(async () => Promise.resolve({ cpus: 12, memory: 64 }))
    await readMachine()

    expect(tauriPorts.host.cpuCount()).toBe(12)
    expect(tauriPorts.host.totalMemory()).toBe(64)
    await expect(tauriPorts.host.freeDiskBytes('/')).resolves.toBeNull()
  })

  it('leaves the machine unread in a browser rather than failing', async () => {
    await expect(readMachine()).resolves.toBeUndefined()
  })
})
