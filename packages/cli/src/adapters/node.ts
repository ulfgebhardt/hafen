import { execFile } from 'node:child_process'
import { readdir, readFile, stat, statfs } from 'node:fs/promises'
import { cpus, totalmem } from 'node:os'
import { promisify } from 'node:util'

import type { CommandResult, Ports } from '@hafen/core'

const run = promisify(execFile)

/** Long enough for `git log` on a large repo, short enough to not hang a survey. */
const TIMEOUT_MS = 15_000

async function runCommand(
  command: string,
  args: readonly string[],
  cwd?: string,
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await run(command, [...args], {
      ...(cwd === undefined ? {} : { cwd }),
      timeout: TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    // A non-zero exit is data here, not a failure — the caller decides what it means.
    // Anything that is not a process error is a real defect and must surface.
    if (!(error instanceof Error)) {
      throw error
    }
    const failure = error as Error & { code?: number | string; stdout?: string; stderr?: string }
    // `code` is the exit status when the process ran, and the errno name when the spawn
    // itself failed — `'ENOENT'` for a missing binary. That second case is a string in a
    // field the port types as a number, and it arrives with stdout and stderr both `''`:
    // `?? failure.message` never fired, so a missing tool looked exactly like a command
    // that exited 1 in silence. A timeout is not this case — it kills a process that did
    // run, and its partial output is still the better answer than the message.
    if (typeof failure.code === 'string') {
      return { code: 1, stdout: '', stderr: failure.message }
    }
    return {
      code: failure.code ?? 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message,
    }
  }
}

export const nodePorts: Ports = {
  proc: {
    run: runCommand,
    which: async (command) => {
      // `command -v` would need a shell; `which` is an external binary and works here.
      const result = await runCommand('which', [command])
      return result.code === 0 && result.stdout.trim() !== '' ? result.stdout.trim() : null
    },
  },
  fs: {
    readFile: async (path) => await readFile(path, 'utf8').catch(() => null),
    readDir: async (path) => await readdir(path).catch(() => null),
    isDirectory: async (path) =>
      await stat(path)
        .then((entry) => entry.isDirectory())
        .catch(() => false),
  },
  host: {
    cpuCount: () => cpus().length,
    totalMemory: () => totalmem(),
    freeDiskBytes: async (path) =>
      await statfs(path)
        .then((info) => info.bavail * info.bsize)
        .catch(() => null),
  },
  clock: { now: () => new Date() },
}
