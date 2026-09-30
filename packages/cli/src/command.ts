import { homedir } from 'node:os'

import { EMPTY_REGISTER, parseRegister, readQuestCatalog, surveyHarbor } from '@hafen/core'

import { renderHarbor, renderPoints } from './render'

import type { Ports, Quest, Register, Ship } from '@hafen/core'

/**
 * Where to look for repositories — the one thing the harbor cannot derive.
 *
 * `$HAFEN_ROOT`, else `~/.data/sources`, and the argument beats both. The default is one
 * person's habit and is stated as such: a tool that only works for whoever wrote it is not a
 * tool, and every path here is overridable for exactly that reason.
 */
// eslint-disable-next-line n/no-process-env -- the root has to be movable without an argument
export const DEFAULT_ROOT = process.env['HAFEN_ROOT'] ?? `${homedir()}/.data/sources`

/**
 * Where the fleet catalog lies — the quests, and the register.
 *
 * A store of its own and not a directory inside this repository: the demands are decisions, they
 * outlive any one version of this tool, and they are the one part of it that more than one person
 * can sensibly edit.
 *
 * Under `$XDG_DATA_HOME` and **not** under a hardcoded organisation directory. It was
 * `<root>/ulfgebhardt/hafen-data` until this was read with a push in mind: that path is one
 * person's, it made the tool useless to anybody else, and the register it points at holds the
 * absolute path of every repository on the machine — which is a list of clients, not a config.
 */
// eslint-disable-next-line n/no-process-env -- the store is the one thing that must be movable
const XDG_DATA = process.env['XDG_DATA_HOME']
export const DEFAULT_STORE =
  // eslint-disable-next-line n/no-process-env -- same reason, one line down
  process.env['HAFEN_STORE'] ??
  `${XDG_DATA !== undefined && XDG_DATA !== '' ? XDG_DATA : `${homedir()}/.local/share`}/hafen`

export const USAGE = `hafen <befehl> [wurzel] [--json] [--evidenz]

  hafen           alle Schiffe mit Zustand, Vertrags-Luecken und Quests
  punkte          was die Projekte geleistet haben, und was davon deins ist
  schnappschuss   alles als JSON

  wurzel      Default: ${DEFAULT_ROOT}
  --json      maschinenlesbar statt Text
  --evidenz   je Quest zeigen, was gelesen wurde
  HAFEN_EMAILS   weitere eigene Adressen, komma-getrennt
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

  /**
   * Whose commits count as the reader's own.
   *
   * `$HAFEN_EMAILS` first, then git's configured address. Read **once** rather than per
   * repository: `git config --get user.email` ninety times is ninety processes for an answer
   * that is almost always the same one, and a repository with a local override is rare enough
   * to name in the variable.
   *
   * Empty means no ledger is measured at all — a count of "own" against nobody would report
   * every commit as somebody else's, which is worse than saying nothing.
   */
  const identities = async (): Promise<readonly string[]> => {
    // eslint-disable-next-line n/no-process-env -- one person often commits under several names
    const declared = (process.env['HAFEN_EMAILS'] ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== '')

    const configured = await ports.proc.run('git', ['config', '--get', 'user.email'])
    const own = configured.code === 0 ? configured.stdout.trim().toLowerCase() : ''
    return own !== '' && !declared.includes(own) ? [...declared, own] : declared
  }

  /**
   * The register: what is put away, and which directories to treat as ships anyway.
   *
   * Handed to the survey whole. Both halves are decisions rather than measurements, which is the
   * only kind of thing the register holds.
   */
  const registry = async (): Promise<Register> => {
    const raw = await ports.fs.readFile(`${store}/register.md`)
    return raw === null ? EMPTY_REGISTER : parseRegister(raw)
  }

  switch (command) {
    case 'hafen': {
      const ships = await surveyHarbor(ports, root, {
        register: await registry(),
        catalog: await demands(),
        ownEmails: await identities(),
      })
      if (asJson) {
        write(ships)
      } else {
        process.stdout.write(`${renderHarbor(ships, { verbose: flags.includes('--evidenz') })}\n`)
      }
      return 0
    }
    case 'punkte': {
      const own = await identities()
      const ships = await surveyHarbor(ports, root, {
        register: await registry(),
        catalog: await demands(),
        ownEmails: own,
      })
      if (asJson) {
        write({
          ships: ships.map((ship) => ({ name: ship.name, org: ship.org, ledger: ship.ledger })),
        })
      } else {
        process.stdout.write(`${renderPoints(ships, own.length > 0)}\n`)
      }
      return 0
    }
    case 'schnappschuss': {
      const ships = await surveyHarbor(ports, root, {
        register: await registry(),
        catalog: await demands(),
        ownEmails: await identities(),
      })
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
