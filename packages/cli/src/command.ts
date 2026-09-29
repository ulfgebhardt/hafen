import { homedir } from 'node:os'

import { EMPTY_REGISTER, parseRegister, readQuestCatalog, surveyHarbor } from '@hafen/core'

import { renderHarbor } from './render'

import type { Ports, Quest, Ship } from '@hafen/core'

/** The only thing the harbor cannot derive: where to look. */
export const DEFAULT_ROOT = `${homedir()}/.data/sources`

/**
 * Where the fleet catalog lies — the quests, and the register.
 *
 * A store of its own and not a directory inside this repository: the demands are decisions, they
 * outlive any one version of this tool, and they are the one part of it that more than one person
 * can sensibly edit. Overridable so a second fleet — or a test — can be pointed somewhere else.
 */
// eslint-disable-next-line n/no-process-env -- the store is the one thing that must be movable
export const DEFAULT_STORE = process.env['HAFEN_STORE'] ?? `${DEFAULT_ROOT}/ulfgebhardt/hafen-data`

export const USAGE = `hafen <befehl> [wurzel] [--json] [--evidenz]

  hafen           alle Schiffe mit Zustand, Vertrags-Luecken und Quests
  schnappschuss   dasselbe als JSON

  wurzel      Default: ${DEFAULT_ROOT}
  --json      maschinenlesbar statt Text
  --evidenz   je Quest zeigen, was gelesen wurde
  --store     Katalog und Register; Default: ${DEFAULT_STORE}

Der Hafen misst und zeichnet. Er veraendert kein Repository.
`

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

/** `--store=…`, or the default. */
function storeFrom(flags: readonly string[]): string {
  const given = flags.find((flag) => flag.startsWith('--store='))
  return given === undefined ? DEFAULT_STORE : given.slice('--store='.length)
}

export interface Snapshot {
  at: string
  root: string
  ships: readonly Ship[]
}

/**
 * Argv, command choice and exit codes — everything the bin does except touching `process`.
 * The ports come in from outside so this is answerable without a disk.
 */
export async function main(argv: readonly string[], ports: Ports): Promise<number> {
  const flags = argv.filter((arg) => arg.startsWith('--'))
  const [command, rootArg] = argv.filter((arg) => !arg.startsWith('--'))
  const root = rootArg ?? DEFAULT_ROOT
  const store = storeFrom(flags)
  const asJson = flags.includes('--json')

  /**
   * The demands, read once per invocation. An unreadable quest is reported and not swallowed: a
   * quest file with a typo is a demand the whole fleet silently stops being held to.
   */
  const demands = async (): Promise<readonly Quest[]> => {
    const catalog = await readQuestCatalog(ports.fs, store)
    for (const path of catalog.unreadable) {
      process.stderr.write(`! keine lesbare Quest: ${store}/${path}\n`)
    }
    return catalog.quests
  }

  /** Directories the survey would not find by itself. A decision, so it comes from the register. */
  const enlisted = async (): Promise<readonly string[]> => {
    const raw = await ports.fs.readFile(`${store}/register.md`)
    return (raw === null ? EMPTY_REGISTER : parseRegister(raw)).enlisted
  }

  switch (command) {
    case 'hafen': {
      const ships = await surveyHarbor(ports, root, await enlisted(), {}, await demands())
      if (asJson) {
        write(ships)
      } else {
        process.stdout.write(`${renderHarbor(ships, { verbose: flags.includes('--evidenz') })}\n`)
      }
      return 0
    }
    case 'schnappschuss': {
      const ships = await surveyHarbor(ports, root, await enlisted(), {}, await demands())
      const snapshot: Snapshot = { at: ports.clock.now().toISOString(), root, ships }
      write(snapshot)
      return 0
    }
    case undefined: {
      process.stdout.write(USAGE)
      return 0
    }
    default: {
      process.stdout.write(USAGE)
      return 2
    }
  }
}
