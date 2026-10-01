import { homedir } from 'node:os'

import {
  EMPTY_REGISTER,
  FORGE_LANES,
  inLanes,
  inspectShip,
  isRead,
  parseRegister,
  readQuestCatalog,
  readStats,
  renderRegister,
  setArchived,
  setEnlisted,
  slugsOf,
  surveyHarbor,
} from '@hafen/core'

import { renderHarbor, renderPoints } from './render'

import type { ForgeReading, ForgeStats, Ports, Quest, Register, Ship, Unread } from '@hafen/core'

/**
 * Where to look for repositories — the one thing the harbor cannot derive.
 *
 * `$HAFEN_ROOT`, else `~/.data/sources`, and the argument beats both. The default is one
 * person's habit and is stated as such: a tool that only works for whoever wrote it is not a
 * tool, and every path here is overridable for exactly that reason.
 */
// eslint-disable-next-line n/no-process-env -- the roots have to be movable without an argument
const GIVEN_ROOTS = process.env['HAFEN_ROOT']

/**
 * Where to look, as a list.
 *
 * Plural because a machine keeps its projects in more than one place: this one has
 * `~/.data/sources` and `~/.data/games`, and the second holds a real project among a dozen
 * package caches. With one root that project simply did not exist.
 *
 * Comma-separated in `$HAFEN_ROOT`, the same shape `$HAFEN_EMAILS` uses — one convention for
 * "several of these" rather than two.
 */
export const DEFAULT_ROOTS: readonly string[] =
  GIVEN_ROOTS === undefined || GIVEN_ROOTS === ''
    ? [`${homedir()}/.data/sources`, `${homedir()}/.data/games`]
    : GIVEN_ROOTS.split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')

/** The first root, for the places that still name one — the usage line, and an error. */
export const DEFAULT_ROOT = DEFAULT_ROOTS[0] ?? `${homedir()}/.data/sources`

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
  forge           was GitHub und Gitea zu den Repos sagen (eigene Datei, eigener Zeitpunkt)
  register <was> <pfad>   archivieren | reaktivieren | aufnehmen | entfernen

  wurzel      Default: ${DEFAULT_ROOTS.join(', ')}
  --json      maschinenlesbar statt Text
  --evidenz   je Quest zeigen, was gelesen wurde
  --nur=PFAD  nur dieses eine Repository messen
  --fortschritt  je gemessenem Repository eine Zeile auf stderr
  HAFEN_GITEA_TOKEN  fuer nicht-oeffentliche Gitea-Repos
  HAFEN_EMAILS   weitere eigene Adressen, komma-getrennt
  --store     Katalog und Register; Default: ${DEFAULT_STORE}

Der Hafen misst und zeichnet. Er veraendert kein Repository - "register"
schreibt ausschliesslich ins eigene Register, und dort stehen Entscheidungen
eines Menschen, nie etwas Gemessenes.
`

/**
 * What `register` can be told to do.
 *
 * Four words and not two flags, because the four are what a person says: a repository is put away
 * or fetched back, a directory is taken on or dropped. A `--archiviert=true` would be the same
 * thing written as a machine would write it.
 */
export const REGISTER_ACTIONS = {
  archivieren: { field: 'archived', on: true },
  reaktivieren: { field: 'archived', on: false },
  aufnehmen: { field: 'enlisted', on: true },
  entfernen: { field: 'enlisted', on: false },
} as const

export type RegisterAction = keyof typeof REGISTER_ACTIONS

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
  // An argument names one root and replaces the list; without it, every default root is read.
  const roots = rootArg === undefined ? DEFAULT_ROOTS : [rootArg]
  const root = roots[0] ?? DEFAULT_ROOT
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
      const ships = await surveyHarbor(ports, roots, {
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
      const ships = await surveyHarbor(ports, roots, {
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
      /*
       * `--nur=…` measures one repository and nothing else.
       *
       * For the window's per-project refresh: a full survey is ninety repositories and some
       * seconds, and asking for all of them to learn what one of them just did is the reason
       * refreshing felt like something to avoid. The shape of the answer is the same either way —
       * a snapshot with a `ships` list — so the caller splices by path and needs no second format.
       */
      const one = flags.find((flag) => flag.startsWith('--nur='))?.slice('--nur='.length)
      /*
       * `--fortschritt` reports to **stderr** while the survey runs: one JSON line for the count,
       * then one per repository as it lands.
       *
       * On stderr because stdout carries the snapshot and nothing else — a caller that reads the
       * result by piping it must not have to filter progress out of it. One line per ship rather
       * than a redrawn bar, so whoever reads it can be a program as easily as a person; the window
       * is the caller this exists for, and it had no way to say anything but "misst …" for six
       * seconds.
       */
      const reporting = flags.includes('--fortschritt')
      let done = 0
      const progress = reporting
        ? {
            onCount: (total: number) => process.stderr.write(`${JSON.stringify({ of: total })}\n`),
            onShip: (ship: Ship) => {
              done += 1
              process.stderr.write(`${JSON.stringify({ at: done, path: ship.path })}\n`)
            },
          }
        : {}
      const ships =
        one === undefined || one === ''
          ? await surveyHarbor(ports, roots, {
              register: await registry(),
              catalog: await demands(),
              ownEmails: await identities(),
              progress,
            })
          : [
              await inspectShip(ports, one, {
                catalog: await demands(),
                ownEmails: await identities(),
                archived: (await registry()).archived.includes(one),
              }),
            ]
      const snapshot: Snapshot = { at: ports.clock.now().toISOString(), root, ships }
      write(snapshot)
      return 0
    }
    /**
     * What the forges say — the one command that goes to the network.
     *
     * Its own command and never part of `schnappschuss`, which is the whole point: the survey
     * reads 92 repositories off the disk in about six seconds and asks nobody anything. Folding an
     * API call into it would make the picture depend on a network, a login and somebody else's
     * rate limit — and a harbour that cannot draw because GitHub is slow has stopped being a
     * picture of this machine.
     *
     * Read-only throughout. `gh api graphql` and a `curl` GET are questions; nothing here posts,
     * patches or deletes, and both tools use the login the person already has.
     */
    case 'forge': {
      const ships = await surveyHarbor(ports, roots, { register: await registry() })
      const wanted = slugsOf(ships)
      const stats: ForgeStats[] = []
      const unread: Unread[] = []

      // eslint-disable-next-line n/no-process-env -- a token belongs in the environment, not a flag
      const token = process.env['HAFEN_GITEA_TOKEN'] ?? null
      await inLanes(wanted, FORGE_LANES, async (slug) => {
        const answer = await readStats(ports, slug, token === '' ? null : token)
        if (isRead(answer)) {
          stats.push(answer)
        } else {
          unread.push(answer)
        }
      })

      const reading: ForgeReading = { at: ports.clock.now().toISOString(), stats, unread }
      // Always JSON: there is no reading of this worth printing as prose, and the window is the
      // thing that draws it.
      write(reading)
      for (const one of unread) {
        process.stderr.write(
          `! ${one.slug.host}/${one.slug.owner}/${one.slug.repo}: ${one.reason}\n`,
        )
      }
      return 0
    }
    /**
     * The register, and the only thing this tool writes.
     *
     * Here and not in the window's shell, so the register's format has one implementation: the
     * window asks for an action by name, this reads, applies and renders. A Rust half that knew
     * the file would be a second opinion about a file both of them edit.
     */
    case 'register': {
      const [action, path] = argv.filter((arg) => !arg.startsWith('--')).slice(1)
      if (action === undefined || !(action in REGISTER_ACTIONS) || path === undefined) {
        process.stderr.write(
          `hafen: register <${Object.keys(REGISTER_ACTIONS).join('|')}> <pfad>\n`,
        )
        return 2
      }

      const { field, on } = REGISTER_ACTIONS[action as RegisterAction]
      const before = await registry()
      const after =
        field === 'archived' ? setArchived(before, path, on) : setEnlisted(before, path, on)

      const failure = await ports.fs.writeFile(`${store}/register.md`, renderRegister(after))
      if (failure !== null) {
        process.stderr.write(`hafen: Register nicht geschrieben: ${failure}\n`)
        return 1
      }
      if (asJson) {
        write(after)
      } else {
        process.stdout.write(`${action}: ${path}\n`)
      }
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
