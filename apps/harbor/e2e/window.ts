/**
 * A Rust half that answers the window's reading commands, and refuses everything else.
 *
 * Needed for the one part of the window a browser cannot show: everything behind `inTauri()` —
 * the roots in the bar, the buttons on a datasheet — is hidden where there is nothing to run, and
 * that is correct, so axe in a plain browser never sees it. Installed the way Tauri installs its
 * own: as `__TAURI_INTERNALS__.invoke` before the first script runs.
 *
 * **Only readings.** A command that would change something — `port_write_file`, `run_tool`,
 * `branch_delete`, `open_url`, a dialog, an update — rejects with its name, so a check that
 * clicked one by accident fails loudly instead of passing against an answer this file made up.
 * The same direction as the allow list in `command.spec.ts`: what is not named here is refused.
 */

import { EMPTY_REGISTER, renderRegister } from '@hafen/core'

import { FORGE, ROOTS, SNAPSHOT } from './fleet'

export interface WindowAnswers {
  store: string
  snapshotPath: string
  snapshot: string
  forge: string
  register: string
  /** Directories that exist. A root not in here is the dead one. */
  directories: readonly string[]
}

const STORE = '/srv/hafen-e2e-store'

export const ANSWERS: WindowAnswers = {
  store: STORE,
  snapshotPath: '/srv/hafen-e2e-cache/snapshot.json',
  snapshot: JSON.stringify(SNAPSHOT),
  forge: JSON.stringify(FORGE),
  register: renderRegister({ ...EMPTY_REGISTER, roots: [...ROOTS] }),
  directories: [ROOTS[0]],
}

/**
 * Runs in the page, before the app. Serialised by Playwright, so it may close over nothing but
 * its argument — every name it uses is a parameter or a global.
 */
export function installWindow(answers: WindowAnswers): void {
  const reading = (command: string, args: Record<string, unknown> = {}): unknown => {
    switch (command) {
      case 'snapshot':
        return args.which === 'forge'
          ? { path: `${answers.snapshotPath}.forge`, json: answers.forge, error: null }
          : { path: answers.snapshotPath, json: answers.snapshot, error: null }
      case 'port_places':
        return { store: answers.store, snapshot: answers.snapshotPath, roots: [] }
      case 'port_read_file':
        return args.path === `${answers.store}/register.md` ? answers.register : null
      case 'port_is_directory':
        return answers.directories.includes(String(args.path))
      case 'port_real_path':
        return answers.directories.includes(String(args.path)) ? args.path : null
      case 'port_which':
        return `/usr/bin/${String(args.command)}`
      case 'port_host':
        return { cpus: 4, memory: 8 * 1024 ** 3 }
      case 'tools':
        return ['lazygit', 'shell', 'editor', 'prune']
      case 'plugin:app|version':
        return '0.0.0-e2e'
      // No newer version: the banner is its own component with its own spec, and an update offered
      // here would be one this fake could never install.
      case 'plugin:updater|check':
        return null
      default:
        throw new Error(
          `e2e: "${command}" ist kein lesender Aufruf und wird hier nicht beantwortet`,
        )
    }
  }
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    value: {
      invoke: async (command: string, args?: Record<string, unknown>): Promise<unknown> =>
        Promise.resolve().then(() => reading(command, args)),
    },
  })
}
