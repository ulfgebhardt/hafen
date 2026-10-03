import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  EMPTY_REGISTER,
  FORGE_LANES,
  forgesOf,
  inLanes,
  inspectShip,
  isRead,
  parseRegister,
  mergeCatalogs,
  readQuestCatalog,
  readStats,
  renderRegister,
  rootsFor,
  setArchived,
  setEnlisted,
  setRoot,
  slugsOf,
  surveyHarbor,
} from '@hafen/core'

import { renderHarbor, renderPoints } from './render'

import type { ForgeReading, ForgeStats, Ports, Quest, Register, Ship, Unread } from '@hafen/core'

/**
 * Where to look for repositories, if somebody said so in the environment.
 *
 * Comma-separated, the same shape `$HAFEN_EMAILS` uses — one convention for "several of these"
 * rather than two. An argument beats it, and it beats the register; neither and no register, and
 * the answer is nothing. Until 03.10.2026 the fallback was two fixed directories of one person's
 * own convention, shipped as everybody's default: a guess list with two entries.
 */
// eslint-disable-next-line n/no-process-env -- the roots have to be movable without an argument
export const GIVEN_ROOTS: readonly string[] = (process.env['HAFEN_ROOT'] ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry) => entry !== '')

/** What the CLI says when nobody has told it where to look — every way to answer, once. */
export const NO_ROOTS =
  'hafen: keine Wurzel - wo liegen deine Projekte?\n' +
  '  hafen <befehl> <wurzel>            einmalig\n' +
  '  HAFEN_ROOT=<wurzel>[,<wurzel>]     fuer diese Shell\n' +
  '  hafen register wurzel <wurzel>     dauerhaft, im Register (wie die Frage im Fenster)\n'

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

/**
 * The catalog that travels with the tool.
 *
 * Resolved from this file rather than from the working directory: `hafen` is run from inside
 * whatever repository somebody happens to be in, and a relative path would read that repository's
 * `store/` instead of its own. Two levels up from `packages/cli/src` is the checkout.
 */
export const BUILTIN_STORE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..', 'store')

/**
 * Where `hafen forge` writes, and therefore where the survey looks for it.
 *
 * The cache and not the store: it is a measurement with its own age, not a decision somebody
 * made, and the one place in this tool that holds measurements is the cache.
 */
// eslint-disable-next-line n/no-process-env -- the same variable the window reads it from
const XDG_CACHE = process.env['XDG_CACHE_HOME']
export const DEFAULT_FORGE = `${XDG_CACHE !== undefined && XDG_CACHE !== '' ? XDG_CACHE : `${homedir()}/.cache`}/hafen/forge.json`

export const USAGE = `hafen <befehl> [wurzel] [--json] [--evidenz]

  hafen           alle Schiffe mit Zustand, Vertrags-Luecken und Quests
  punkte          was die Projekte geleistet haben, und was davon deins ist
  schnappschuss   alles als JSON
  forge           was GitHub und Gitea zu den Repos sagen (eigene Datei, eigener Zeitpunkt)
  register <was> <pfad>   archivieren | reaktivieren | aufnehmen | entfernen | wurzel | entwurzeln

  wurzel      sonst HAFEN_ROOT, sonst die Wurzeln im Register
  --json      maschinenlesbar statt Text
  --evidenz   je Quest zeigen, was gelesen wurde
  --nur=PFAD  nur dieses eine Repository messen
  --fortschritt  je gemessenem Repository eine Zeile auf stderr
  --forge=PFAD   die Lesung von 'hafen forge' mitlesen; Default: der Cache
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
 * Words and not flags, because they are what a person says: a repository is put away or fetched
 * back, a directory is taken on or dropped, a place is where projects grow or no longer. A `--archiviert=true` would be the same
 * thing written as a machine would write it.
 */
export const REGISTER_ACTIONS = {
  archivieren: { field: 'archived', on: true },
  reaktivieren: { field: 'archived', on: false },
  aufnehmen: { field: 'enlisted', on: true },
  entfernen: { field: 'enlisted', on: false },
  wurzel: { field: 'roots', on: true },
  entwurzeln: { field: 'roots', on: false },
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
/**
 * Where the forge reading lies, and what it says — or nothing at all.
 *
 * `--forge=` with an empty value switches it off, which is how a caller says "measure the disk and
 * nothing else". A file that is not there is not an error either: it only means nobody has asked
 * the forge yet, and the quests that need it say so themselves.
 */
async function readForge(ports: Ports, flags: readonly string[]): Promise<readonly ForgeStats[]> {
  const given = flags.find((flag) => flag.startsWith('--forge='))?.slice('--forge='.length)
  if (given === '') {
    return []
  }
  const path = given ?? DEFAULT_FORGE
  const raw = await ports.fs.readFile(path)
  if (raw === null) {
    return []
  }
  try {
    return (JSON.parse(raw) as ForgeReading).stats
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error
    }
    process.stderr.write(`! keine lesbare Forge-Lesung: ${path}\n`)
    return []
  }
}

export async function main(argv: readonly string[], ports: Ports): Promise<number> {
  const flags = argv.filter((arg) => arg.startsWith('--'))
  const [command, rootArg] = argv.filter((arg) => !arg.startsWith('--'))
  const store = storeFrom(flags)
  const asJson = flags.includes('--json')

  /**
   * The demands, read once per invocation. An unreadable quest is reported and not swallowed: a
   * quest file with a typo is a demand the whole fleet silently stops being held to.
   */
  const demands = async (): Promise<readonly Quest[]> => {
    /*
     * The catalog the tool **brings with it**, and then whatever the store adds.
     *
     * It used to live only in a store somebody had to create, so a fresh checkout measured a fleet
     * against no demands at all and every quest verdict was simply absent. The demands in `store/`
     * are the fleet's — they travel with the tool, and a machine that clones this repository has a
     * working harbour on the first run.
     *
     * The built-in catalog **leads**, the store **adds**: the same rule a ship's own
     * `.hafen/quests` follows, one level up. A store quest that reuses an id of the catalog is
     * discarded and said out loud — a rule whose only bite is invisible is no rule.
     */
    const builtIn = await readQuestCatalog(ports.fs, BUILTIN_STORE)
    const mine = await readQuestCatalog(ports.fs, store)
    for (const path of builtIn.unreadable) {
      process.stderr.write(`! keine lesbare Quest: ${BUILTIN_STORE}/${path}\n`)
    }
    for (const path of mine.unreadable) {
      process.stderr.write(`! keine lesbare Quest: ${store}/${path}\n`)
    }
    const merged = mergeCatalogs(builtIn, mine)
    if (merged.overridden.length > 0) {
      // One line and not one per id: a store that mirrors the catalog would otherwise print a
      // wall of them on every run, and a message nobody reads is a message nobody reads.
      process.stderr.write(
        `! ${store} fordert ${String(merged.overridden.length)} Id(s) erneut — der mitgelieferte Katalog gilt: ${merged.overridden.join(', ')}\n`,
      )
    }
    return merged.quests
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

  /**
   * Where to look: the argument, else `$HAFEN_ROOT`, else the register — the same order the window
   * uses, from the same function. `null` means nobody has said, and the caller says so.
   */
  const whereToLook = async (): Promise<readonly string[] | null> => {
    const roots = rootsFor(rootArg === undefined ? GIVEN_ROOTS : [rootArg], await registry())
    return roots.length > 0 ? roots : null
  }

  switch (command) {
    case 'hafen': {
      const roots = await whereToLook()
      if (roots === null) {
        process.stderr.write(NO_ROOTS)
        return 2
      }
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
      const roots = await whereToLook()
      if (roots === null) {
        process.stderr.write(NO_ROOTS)
        return 2
      }
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
      /*
       * The forge reading, where one is at hand — **a file, never a request**.
       *
       * The survey still asks nobody anything: this is what `hafen forge` wrote, with its own
       * timestamp, read off the disk. It is here because some demands cannot be answered from a
       * working tree at all — whether the default branch is guarded is written down at GitHub and
       * nowhere in the repository. Without the file those quests stay `nicht messbar`.
       */
      const forge = await readForge(ports, flags)
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
      const whole = one === undefined || one === ''
      const roots = whole ? await whereToLook() : []
      if (roots === null) {
        process.stderr.write(NO_ROOTS)
        return 2
      }
      const ships = whole
        ? await surveyHarbor(ports, roots, {
            register: await registry(),
            catalog: await demands(),
            ownEmails: await identities(),
            progress,
            forge,
          })
        : [
            await inspectShip(ports, one, {
              catalog: await demands(),
              ownEmails: await identities(),
              archived: (await registry()).archived.includes(one),
              forge,
              forges: forgesOf(await registry()),
            }),
          ]
      const snapshot: Snapshot = {
        at: ports.clock.now().toISOString(),
        root: roots[0] ?? '',
        ships,
      }
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
      const roots = await whereToLook()
      if (roots === null) {
        process.stderr.write(NO_ROOTS)
        return 2
      }
      const register = await registry()
      const ships = await surveyHarbor(ports, roots, { register })
      const wanted = slugsOf(ships)
      const stats: ForgeStats[] = []
      const unread: Unread[] = []

      // eslint-disable-next-line n/no-process-env -- a token belongs in the environment, not a flag
      const token = process.env['HAFEN_GITEA_TOKEN'] ?? null
      await inLanes(wanted, FORGE_LANES, async (slug) => {
        const answer = await readStats(ports, slug, token === '' ? null : token, forgesOf(register))
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
        field === 'archived'
          ? setArchived(before, path, on)
          : field === 'enlisted'
            ? setEnlisted(before, path, on)
            : setRoot(before, path, on)

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
