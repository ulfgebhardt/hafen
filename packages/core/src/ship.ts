import { leaderPath, remoteKey } from './alias'
import { BRANCH_FORMAT, parseBranches } from './branches'
import { mergeCatalogs, readShipCatalog } from './catalog'
import { evaluateQuests } from './chain'
import { detectContract } from './contract'
import { forgeOf } from './forge'
import { measureQuests } from './probe'
import { EMPTY_REGISTER } from './register'
import { daysSince } from './time'
import { LOG_FORMAT, NO_LEDGER, readLedger } from './work'
import { countStash, hasOpenWork, readWorking } from './working'

import type { Branch } from './branches'
import type { QuestResult } from './chain'
import type { Contract } from './contract'
import type { Forge } from './forge'
import type { Ports } from './ports'
import type { Quest } from './quest'
import type { Register } from './register'
import type { Ledger } from './work'
import type { Working } from './working'

/**
 * One of a ship's remotes, as git names it.
 *
 * The forge travels with the URL rather than being asked for again later: it is a reading of
 * this address and of no other, and a ship that lies on GitHub and mirrors to Gitea has two
 * different answers at the same time.
 */
export interface Remote {
  name: string
  url: string
  forge: Forge
}

/** The remote that leads. Not configurable — git already carries this rule. */
const ORIGIN = 'origin'

/**
 * Where a ship lies, derived from what the local repository actually knows.
 *
 * Deliberately *not* the objective axis from concept section 4: "in Fahrt" there means
 * deployed, and deployment cannot be seen without a forge connection. Claiming it from a
 * recent commit alone was wrong — a notes repo is not in service because it was edited.
 * Once the forge is connected, `berthed` becomes "PR open" and `sailing` becomes
 * "deployed"; until then these mean what they can mean.
 */
export type Stage = 'drydock' | 'dock' | 'berthed' | 'sailing'

export interface Ship {
  name: string
  org: string
  path: string
  /**
   * Every remote this repository has, `origin` first.
   *
   * One list rather than a leading pair beside a mirror list, because a ship on GitHub that
   * mirrors to Gitea had no place to say so and the mirror would have had a different shape
   * from the thing it mirrors. Which of them counts is not a field: `origin` leads because git
   * says it does, `originOf` is the one place that spells that out, and a kept "which forge
   * applies here" would be exactly the status field the architecture contract forbids.
   */
  remotes: readonly Remote[]
  branch: string | null
  /** Whether anything at all is open. Derived from `working` — see `hasOpenWork`. */
  dirty: boolean
  /**
   * What is open, in the five kinds git tells apart.
   *
   * Beside `dirty` and not instead of it, because most readers only ask the yes/no question. The
   * detail exists because staged work, untracked files and a stuck merge are three different
   * sentences, and one bit told none of them.
   */
  working: Working
  /**
   * Entries on the stash.
   *
   * Counted because stashed work exists nowhere else — not in a commit, not in the tree, and in
   * no other measurement here. A repository with four stash entries and a clean tree looks
   * finished and is not.
   */
  stash: number
  /**
   * What was done here, and the reader's share of it.
   *
   * Raw counts and never points: what any of it is worth is a decision, and that lives in
   * `points.ts`. Keeping the signals in the snapshot means a different weighting costs no new
   * measurement — which matters, because the first set of weights is always wrong.
   */
  ledger: Ledger
  /** Days since the last commit — the source of `rust`. */
  rustDays: number | null
  /** Worktrees other than the main one, i.e. active docks. */
  docks: readonly string[]
  /**
   * Every local branch, and what git knows about it.
   *
   * Measured because branch housekeeping is the one tidy job nobody does: a merged branch and one
   * whose remote was deleted both sit there forever, cost nothing visible, and after two years a
   * repository is carrying forty. `staleBranches` reads which of them git would let go.
   */
  branches: readonly Branch[]
  /**
   * Other directories that are this same project, folded into this one.
   *
   * Absent where there are none, which is nearly always. Not the same thing as `docks`: a worktree
   * is one repository with two trees and git knows about it, while these are separate clones of
   * the same remote that nothing but their `origin` connects. Kept rather than discarded silently,
   * because "this project is checked out three times" is a fact about the machine somebody may
   * want to act on.
   */
  aliases?: readonly string[]
  /** Commits on the current branch not yet pushed. `null` without an upstream. */
  ahead: number | null
  /** Commits on the upstream not yet merged locally. */
  behind: number | null
  contract: Contract
  /**
   * What the quest catalog says this ship owes, with the evidence behind every answer.
   *
   * Beside `contract` and not instead of it: the two answer different questions. `contract` is a
   * measurement — which of the four roles does nothing here measure — and this is the norm:
   * which of the demands the fleet has written down does this ship meet. Empty where no catalog
   * was handed in, which is the honest answer for a survey that was not shown one.
   */
  quests: readonly QuestResult[]
  /**
   * Ids among `quests` this ship demanded of itself, rather than the fleet demanding them.
   *
   * A list of ids and not a field on `QuestResult`: origin is a fact about where the file lies,
   * the result is a measurement against this repository, and a snapshot of this has to survive
   * `JSON.stringify` — a `Map` beside them would not.
   */
  ownQuests: readonly string[]
  /** Ids this ship demanded that the fleet already demands — its file was dropped (`catalog.ts`). */
  overriddenQuests: readonly string[]
  /** Quest files that did not read as quests, in either store. A demand nobody is held to. */
  unreadableQuests: readonly string[]
  stage: Stage
  /**
   * Whether the register says this ship is put away.
   *
   * A decision and not a measurement — the one kind of thing the register holds — but it has to
   * travel with the ship, because the window bands on it and nothing in a repository says it.
   */
  archived: boolean
  /**
   * Whether the register took this directory on by hand.
   *
   * The register's other half, and it travels for the same reason `archived` does: it is a
   * decision nothing in the repository says, and the window has to be able to offer taking it back
   * out. Without it a "remove from the register" button would stand on every ship and do nothing
   * on most of them — a button that lies.
   */
  enlisted: boolean
  /**
   * Whether this is a git repository at all. An enlisted directory may not be one, and then
   * branch, age and points are absent rather than zero — the two must not look alike.
   */
  hasGit: boolean
}

/**
 * Below this a ship is simply in use. Set to 90 rather than 60 because at 60 days
 * 74 of 88 real repos landed in drydock, which made the distinction meaningless.
 * Finer grades live in `fleet.ts`.
 */
export const RUST_THRESHOLD_DAYS = 90

async function git(ports: Ports, path: string, args: readonly string[]): Promise<string | null> {
  const result = await ports.proc.run('git', args, path)
  return result.code === 0 ? result.stdout.trim() : null
}

/**
 * `git remote -v` prints one line per remote *and direction*:
 *
 * ```
 * origin  git@github.com:org/ship.git (fetch)
 * origin  git@github.com:org/ship.git (push)
 * mirror  https://git.it4c.dev/org/ship.git (push)
 * ```
 *
 * One command rather than `git remote` and a `get-url` per name: a survey over eighty-odd
 * repositories pays for every extra process, and a list of names on its own answers nothing.
 *
 * The first URL a name brings wins, which is the fetch one wherever there is one. A remote that
 * only pushes — a `pushurl`, a mirror added with `--push` — has no other, and dropping it would
 * make the very thing this measurement is for invisible.
 *
 * `origin` is put first so the window reads the leader first. Found by name, though, never by
 * position: a repository whose remotes are `upstream` and `fork` has none, and `remotes[0]`
 * would quietly promote a stranger.
 */
function parseRemotes(output: string | null): readonly Remote[] {
  if (output === null) {
    return []
  }

  const byName = new Map<string, string>()
  for (const line of output.split('\n')) {
    const [name, rest] = line.split(/\s+/u)
    const url = rest?.replace(/\s*\((?:fetch|push)\)$/u, '')
    if (name === undefined || name === '' || url === undefined || url === '') {
      continue
    }
    if (!byName.has(name)) {
      byName.set(name, url)
    }
  }

  return [...byName]
    .sort(([a], [b]) => Number(b === ORIGIN) - Number(a === ORIGIN))
    .map(([name, url]) => ({ name, url, forge: forgeOf(url) }))
}

/**
 * The remote that leads: issues come from it, the launch runs against it, and it is the one that
 * decides whether a ship is "am Kai" or "in Fahrt". `null` when there is none — a repository
 * with no remote at all, or one whose remotes are all named something else.
 *
 * Takes the remotes rather than a whole `Ship` so the same reading works on a survey entry and
 * on anything else that has measured them.
 */
export function originOf(remotes: readonly Remote[]): Remote | null {
  return remotes.find((remote) => remote.name === ORIGIN) ?? null
}

/**
 * Everything else. A mirror is shown and never asked: it holds the same work, so fetching its
 * issues would list the fleet's work twice, and writing to it would write somewhere nobody
 * pointed at.
 */
export function mirrorsOf(remotes: readonly Remote[]): readonly Remote[] {
  return remotes.filter((remote) => remote.name !== ORIGIN)
}

/** One working tree of a repository, and what it has checked out. */
export interface Worktree {
  path: string
  /**
   * The branch, or `null` on a detached HEAD — the porcelain prints `detached` in place of the
   * `branch` line there. A tree without a branch is still a tree somebody works in, so it is
   * listed rather than dropped.
   */
  branch: string | null
}

/**
 * Every working tree the repository has, with the branch each of them holds.
 *
 * One parser for `git worktree list --porcelain`, read by two questions: which docks a ship has,
 * and which workplace a stash entry came from (`stash.ts`). Two parsers would be two opinions
 * about which tree holds which branch, and one of them decides what a stash entry is attributed
 * to — while git guarantees the pairing is unique, because a branch cannot be checked out twice.
 *
 * The blocks come in the order git prints them, main tree first, and each one opens with its
 * `worktree` line. A `branch` line belongs to the block it follows, so the current path is
 * carried along rather than looked up.
 */
export function parseWorktrees(porcelain: string | null): readonly Worktree[] {
  if (porcelain === null) {
    return []
  }

  const trees: Worktree[] = []
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      trees.push({ path: line.slice('worktree '.length), branch: null })
      continue
    }
    const tree = trees.at(-1)
    if (tree !== undefined && line.startsWith('branch ')) {
      tree.branch = line.slice('branch '.length).replace(/^refs\/heads\//u, '')
    }
  }
  return trees
}

interface StageInput {
  docks: readonly string[]
  rustDays: number | null
  ahead: number | null
  dirty: boolean
}

/**
 * Stage is derived, never stored, and only from evidence that exists locally:
 *
 * - `dock`     an agent or a human has a worktree open — work is under way
 * - `berthed`  work is finished but not handed over: uncommitted changes or unpushed commits
 * - `drydock`  untouched long enough that neglect is the honest reading
 * - `sailing`  in service: nothing pending, recently touched
 *
 * Order matters: open work outranks pending handover, which outranks age.
 */
function stageOf({ docks, rustDays, ahead, dirty }: StageInput): Stage {
  if (docks.length > 0) {
    return 'dock'
  }
  if (dirty || (ahead !== null && ahead > 0)) {
    return 'berthed'
  }
  if (rustDays !== null && rustDays > RUST_THRESHOLD_DAYS) {
    return 'drydock'
  }
  return 'sailing'
}

/** `git rev-list --count --left-right @{upstream}...HEAD` gives "behind\tahead". */
function parseTracking(output: string | null): { ahead: number | null; behind: number | null } {
  const parts = output?.split(/\s+/) ?? []
  const behind = Number(parts[0])
  const ahead = Number(parts[1])
  return Number.isFinite(behind) && Number.isFinite(ahead)
    ? { ahead, behind }
    : { ahead: null, behind: null }
}

export interface InspectOptions {
  catalog?: readonly Quest[]
  /** Whose commits count as the reader's own. Empty means no ledger is measured. */
  ownEmails?: readonly string[]
  /** Whether the register puts this one away. */
  archived?: boolean
  /** Whether the register took this directory on by hand. */
  enlisted?: boolean
}

export async function inspectShip(
  ports: Ports,
  path: string,
  options: InspectOptions = {},
): Promise<Ship> {
  const { catalog = [], ownEmails = [], archived = false, enlisted = false } = options
  const segments = path.split('/').filter((segment) => segment !== '')
  const name = segments.at(-1) ?? path
  const org = segments.at(-2) ?? ''

  const [
    hasGit,
    remotes,
    branch,
    status,
    lastCommit,
    worktrees,
    tracking,
    stashList,
    log,
    refs,
    contained,
  ] = await Promise.all([
    ports.fs.isDirectory(`${path}/.git`),
    git(ports, path, ['remote', '-v']),
    git(ports, path, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(ports, path, ['status', '--porcelain']),
    git(ports, path, ['log', '-1', '--format=%cI']),
    git(ports, path, ['worktree', 'list', '--porcelain']),
    git(ports, path, ['rev-list', '--count', '--left-right', '@{upstream}...HEAD']),
    git(ports, path, ['stash', 'list']),
    /*
     * The whole history in one call: author, subject and parents per commit.
     *
     * Measured at 0.3 s for 17 642 commits — cheaper than several of the small calls above it,
     * because the cost here is starting a process and not reading the objects. Skipped entirely
     * where nobody named an address to count against: there would be nothing to compare to.
     */
    ownEmails.length === 0
      ? Promise.resolve(null)
      : git(ports, path, ['log', `--format=${LOG_FORMAT}`]),
    /*
     * The local branches, and which of them are already contained in this one.
     *
     * Two calls because they are two questions: a ref knows what it follows, but containment is
     * a walk of the graph. Both read, and both go in this batch rather than after it — the cost
     * of a `git` here is starting the process, not the work.
     */
    git(ports, path, ['for-each-ref', `--format=${BRANCH_FORMAT}`, 'refs/heads']),
    git(ports, path, ['branch', '--merged', 'HEAD', '--format=%(refname:short)']),
  ])

  // The ship's own tree is in that list and is no dock of anybody's.
  const docks = parseWorktrees(worktrees)
    .map((tree) => tree.path)
    .filter((tree) => tree !== path)
  const localBranches = parseBranches(refs, contained)
  const rustDays = daysSince(lastCommit, ports.clock.now())
  const { ahead, behind } = parseTracking(tracking)
  // `dirty` is derived and no longer measured on its own: two readings of one porcelain would be
  // two opinions about the same tree.
  const working = readWorking(status)
  const dirty = hasOpenWork(working)
  const stash = countStash(stashList)
  // Nothing measured where nobody was named: a ledger without own addresses would report every
  // commit as somebody else's, which is worse than saying nothing.
  const ledger = ownEmails.length === 0 ? NO_LEDGER : readLedger(log, ownEmails)

  const contract = await detectContract(ports, path)

  /**
   * What this ship is held to: the fleet's demands, plus its own.
   *
   * Read here and not handed in, because it is per ship — `surveyHarbor` takes one catalog for
   * the whole fleet, and a ship's own quests are a file inside it. The fleet catalog still comes
   * from outside: `core` knows no store path, and the merge rule lives in `catalog.ts`.
   */
  const own = await readShipCatalog(ports.fs, path)
  const merged = mergeCatalogs({ quests: catalog, unreadable: [] }, own)

  // Nothing measured for an empty catalog: every file a quest reads is a file some quest named,
  // so a fleet with no demands written down pays nothing for having none.
  const quests =
    merged.quests.length === 0
      ? []
      : evaluateQuests(merged.quests, await measureQuests(ports, path, contract, merged.quests))

  return {
    name,
    org,
    path,
    remotes: parseRemotes(remotes),
    branch,
    dirty,
    working,
    stash,
    ledger,
    rustDays,
    docks,
    ahead,
    behind,
    contract,
    quests,
    ownQuests: merged.quests.flatMap((quest) =>
      merged.origin.get(quest.id) === 'ship' ? [quest.id] : [],
    ),
    overriddenQuests: merged.overridden,
    unreadableQuests: merged.unreadable,
    stage: stageOf({ docks, rustDays, ahead, dirty }),
    branches: localBranches,
    archived,
    enlisted,
    hasGit,
  }
}

/**
 * Finds repos under `<root>/<org>/<repo>`. That layout already exists, so no
 * configuration beyond the roots is needed.
 */
/**
 * Directories a survey never descends into.
 *
 * Dependencies and build output, which hold repositories that belong to somebody else and were
 * pulled in rather than written. `.terraform/modules` is the one that made this a list rather
 * than a single `node_modules` check — it clones whole repositories into a cache directory.
 */
const NOT_A_SHIP = new Set([
  'node_modules',
  '.terraform',
  'vendor',
  'dist',
  'build',
  'target',
  '.venv',
  'venv',
  // portmod keeps twelve package sources under `<game>/portmod/repos/`. Measured on this
  // machine: one real project under `~/.data/games` and twelve of these.
  'portmod',
])

/**
 * Whether a directory name is one the survey never descends into.
 *
 * Matches a copy as well as the original. Copies on this machine are made by suffixing — measured:
 * `portmod_`, `portmod_new`, `nostalgeek_`, `nostalgeek-new`, `AddOns_`, `gradido_local`. Without
 * this, `portmod` was skipped and its two backups contributed six package caches as ships.
 *
 * Only after `_` or `-`, so a real project is not caught by sharing a prefix: `buildkite` is not
 * `build`, and `vendorful` is not `vendor`.
 */
function isNotAShip(entry: string): boolean {
  if (NOT_A_SHIP.has(entry)) {
    return true
  }
  const cut = entry.search(/[_-]/u)
  return cut > 0 && NOT_A_SHIP.has(entry.slice(0, cut))
}

/**
 * How deep below the root a repository is still looked for.
 *
 * Four, measured: `<org>/<repo>` is two, and the deepest real project on this machine is
 * `mojotrollz/addons/AddOns` at three. The limit exists so a stray symlink or a deeply nested
 * cache cannot turn the survey into a full disk walk.
 */
export const SEARCH_DEPTH = 4

/**
 * Every repository under the root — including nested ones, and stopping at each.
 *
 * The old search looked at exactly `<root>/<org>/<repo>` and found 90. There are 121 `.git`
 * directories out there, and the difference is the interesting part: **28 of the 31 it missed
 * live inside another repository** — nine foreign deployments under
 * `Ocelot-Social/deployment/configurations`, four directus configs inside `utopia-map`, a
 * terraform module cache. Those are not ships. They are parts of the repository that contains
 * them, and listing them separately would count one project's contents as a fleet.
 *
 * So the rule is: descend, but **stop at a repository**. What is inside one belongs to it. That
 * leaves the two that really were missed — `mojotrollz/addons/AddOns` and `AddOns_`, which sit
 * one level deeper than the layout assumed because somebody grouped them in a folder.
 *
 * Breadth-first, so the shallow and ordinary case costs what it always did.
 */
export async function findShipPaths(ports: Ports, root: string): Promise<readonly string[]> {
  const found: string[] = []
  let level = [root]

  for (let depth = 0; depth < SEARCH_DEPTH && level.length > 0; depth += 1) {
    const next: string[] = []

    await Promise.all(
      level.map(async (dir) => {
        const entries = await ports.fs.readDir(dir)
        if (entries === null) {
          return
        }

        await Promise.all(
          entries.map(async (entry) => {
            if (isNotAShip(entry) || entry.startsWith('.')) {
              return
            }
            const path = `${dir}/${entry}`
            if (!(await ports.fs.isDirectory(path))) {
              return
            }
            if (await ports.fs.isDirectory(`${path}/.git`)) {
              // A repository. Everything inside it belongs to it, so the search stops here.
              found.push(path)
              return
            }
            next.push(path)
          }),
        )
      }),
    )

    level = next
  }

  return found.sort()
}

export class UnreadableRootError extends Error {
  constructor(readonly root: string) {
    super(`Wurzel nicht lesbar: ${root}`)
    this.name = 'UnreadableRootError'
  }
}

/**
 * How many ships are measured at once.
 *
 * Not a speed setting, and measured before it was written down: on 89 repositories on
 * 29.09.2026 the whole survey takes 5.4 s unbounded, 5.8 s at four lanes and 6.5 s one at a
 * time — while the *same* run varies between 5.4 s and 9.2 s depending on what else the machine
 * is doing. Total time is therefore not something this number buys.
 *
 * What it buys is the shape. Unbounded, all 623 `git` calls are handed over in one go and every
 * ship arrives at the end: in the app that is one message loop carrying both the survey and the
 * drawing, which is the whole of "the window is not reactive". Bounded, the first ships are in
 * within tens of milliseconds, each of them is a task of its own, and nothing queues behind a
 * wall of processes.
 */
export const SURVEY_LANES = 8

/** Runs `work` over `items`, never more than `lanes` of them at once. */
async function inLanes<T>(
  items: readonly T[],
  lanes: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items]
  const running = Array.from({ length: Math.min(lanes, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      await work(next)
    }
  })
  await Promise.all(running)
}

/**
 * The order the fleet is measured in: what the eye is on, then the rest.
 *
 * `first` is what the window already shows. The survey exists to correct a picture that is
 * on screen already — the cached one — so the order it corrects in is the order the human
 * reads. Paths that are not in the fleet drop out rather than being inspected: this is a
 * sort, not a selection, and a stale cache naming a repository that is gone must not be able
 * to add it back.
 */
export function surveyOrder(paths: readonly string[], first: readonly string[]): readonly string[] {
  const wanted = first.filter((path) => paths.includes(path))
  const rest = paths.filter((path) => !wanted.includes(path))
  return [...wanted, ...rest]
}

/** How a survey reports while it is still running. */
export interface SurveyProgress {
  /**
   * Each ship as it is measured, in measurement order.
   *
   * So the harbor can draw what it has. Without it a machine with no cache shows nothing at
   * all for as long as the survey takes, and one with a cache shows an answer that is minutes
   * old while the fresh one is being assembled invisibly.
   */
  onShip?: (ship: Ship) => void
  /** Measured before the rest — see `surveyOrder`. */
  first?: readonly string[]
}

/**
 * Surveys the fleet.
 *
 * `enlisted` are directories the survey would not find by itself — no git repository, or
 * outside the root. Whether such a directory is a project is a decision, not a measurement,
 * so it comes from the register. Inspection tolerates them: without git there is no branch,
 * no age and no points, and those stay null rather than being invented.
 *
 * `catalog` is what the fleet demands, read out of the store by the caller. Handed in rather
 * than read here for the reason `enlisted` is: `core` knows no store path, and a survey that
 * went looking for one would have a second opinion about where the Ablage lies. Empty means no
 * demands were shown to it, and then no ship owes anything — which is not the same as meeting
 * everything, and `quests` being empty says exactly that.
 */
export interface SurveyOptions extends InspectOptions {
  /**
   * The register: what is put away, and which directories to treat as ships anyway.
   *
   * Handed in whole rather than as two lists, because it is one file and one decision. The
   * signature had grown to six positional parameters, which is the point at which the next one
   * gets passed in the wrong slot.
   */
  register?: Register
  progress?: SurveyProgress
}

/**
 * Every repository under any of the roots, each of them once.
 *
 * Roots plural, because a machine keeps its projects in more than one place: this one has
 * `~/.data/sources` and `~/.data/games`, and the second holds exactly one real project among a
 * dozen package caches. A single root meant that project simply did not exist.
 *
 * Deduplicated **after resolving links**, and the second half is what the first could not do.
 * Overlapping roots were always folded — `~/.data` and `~/.data/sources` are a reasonable pair to
 * hand in — but a link is invisible to a string comparison. Measured on this machine:
 * `mojotrollz/addons/AddOns` is linked into five game directories and drew as six identical ships
 * of 948 days, filling a third of the basin with one repository.
 *
 * What survives is the **real** path and never the link, even where the real one lies outside
 * every root. A link is a name for a repository and the repository is the thing being surveyed;
 * keeping the name would put a ship where there is only a pointer, and the next measurement of it
 * — a commit, a worktree — would be made somewhere else than it is reported.
 */
export async function findAcrossRoots(
  ports: Ports,
  roots: readonly string[],
): Promise<readonly string[]> {
  const found = await Promise.all(roots.map(async (root) => await findShipPaths(ports, root)))
  const real = await Promise.all(
    [...new Set(found.flat())].map(async (path) => (await ports.fs.realPath(path)) ?? path),
  )
  return [...new Set(real)].sort()
}

/**
 * Ships folded down to projects: two checkouts of one remote become one ship and an alias.
 *
 * Here and not in `alias.ts` because it is a rule about `Ship`, and `alias.ts` has to stay a file
 * `ship.ts` can import — the two rules it holds need no ship to state. What survives keeps its
 * place in the order it came in, so a fold does not quietly rewrite the caller's sorting.
 *
 * A ship with no `origin` is **never** folded. Nothing about two unrelated directories says they
 * are one project, and guessing from the name would fold two unrelated `notes` together. That is
 * also why this cannot answer the symlink case: those six `AddOns` have no remote at all.
 */
export function foldAliases(ships: readonly Ship[]): readonly Ship[] {
  const groups = new Map<string, string[]>()
  for (const ship of ships) {
    const origin = originOf(ship.remotes)
    const key = origin === null ? null : remoteKey(origin.url)
    if (key === null) {
      continue
    }
    groups.set(key, [...(groups.get(key) ?? []), ship.path])
  }

  // Path to the aliases it absorbs. An empty list means somebody else leads this project.
  const folded = new Map<string, readonly string[]>()
  for (const paths of groups.values()) {
    if (paths.length < 2) {
      continue
    }
    const leader = leaderPath(paths)
    for (const path of paths) {
      folded.set(path, path === leader ? paths.filter((other) => other !== leader) : [])
    }
  }

  return ships.flatMap((ship) => {
    const aliases = folded.get(ship.path)
    if (aliases === undefined) {
      return [ship]
    }
    return aliases.length === 0 ? [] : [{ ...ship, aliases }]
  })
}

export async function surveyHarbor(
  ports: Ports,
  root: string | readonly string[],
  options: SurveyOptions = {},
): Promise<readonly Ship[]> {
  const { register = EMPTY_REGISTER, progress = {}, catalog = [], ownEmails = [] } = options
  const enlisted = register.enlisted
  const adopted = new Set(enlisted)
  const archived = new Set(register.archived)
  const roots = typeof root === 'string' ? [root] : root

  // An unreadable root and an empty one both yield zero ships, but only one of them is
  // a fault. Reporting them alike hides misconfiguration behind an empty harbor. Every root has
  // to be readable: a typo in the second one would otherwise just quietly halve the fleet.
  for (const one of roots) {
    if ((await ports.fs.readDir(one)) === null) {
      throw new UnreadableRootError(one)
    }
  }

  const found = await findAcrossRoots(ports, roots)
  const extra: string[] = []
  for (const path of enlisted) {
    if (!found.includes(path) && (await ports.fs.isDirectory(path))) {
      extra.push(path)
    }
  }

  const paths = [...found, ...extra].sort()
  const measured = new Map<string, Ship>()

  await inLanes(surveyOrder(paths, progress.first ?? []), SURVEY_LANES, async (path) => {
    const ship = await inspectShip(ports, path, {
      catalog,
      ownEmails,
      archived: archived.has(path),
      enlisted: adopted.has(path),
    })
    measured.set(path, ship)
    progress.onShip?.(ship)
  })

  // By path, however it was measured: the measurement order is a decision about what the human
  // sees first, and it must not turn into the order the fleet is listed in.
  //
  // Folded at the end and not during the search: what says two directories are one project is what
  // each of them reports as `origin`, and that is not known until both have been measured.
  return foldAliases(
    paths.flatMap((path) => {
      const ship = measured.get(path)
      return ship === undefined ? [] : [ship]
    }),
  )
}
