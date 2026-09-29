import { mergeCatalogs, readShipCatalog } from './catalog'
import { evaluateQuests } from './chain'
import { detectContract } from './contract'
import { forgeOf } from './forge'
import { measureQuests } from './probe'
import { daysSince } from './time'

import type { QuestResult } from './chain'
import type { Contract } from './contract'
import type { Forge } from './forge'
import type { Ports } from './ports'
import type { Quest } from './quest'

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
  dirty: boolean
  /** Days since the last commit — the source of `rust`. */
  rustDays: number | null
  /** Worktrees other than the main one, i.e. active docks. */
  docks: readonly string[]
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

export async function inspectShip(
  ports: Ports,
  path: string,
  catalog: readonly Quest[] = [],
): Promise<Ship> {
  const segments = path.split('/').filter((segment) => segment !== '')
  const name = segments.at(-1) ?? path
  const org = segments.at(-2) ?? ''

  const [hasGit, remotes, branch, status, lastCommit, worktrees, tracking] = await Promise.all([
    ports.fs.isDirectory(`${path}/.git`),
    git(ports, path, ['remote', '-v']),
    git(ports, path, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(ports, path, ['status', '--porcelain']),
    git(ports, path, ['log', '-1', '--format=%cI']),
    git(ports, path, ['worktree', 'list', '--porcelain']),
    git(ports, path, ['rev-list', '--count', '--left-right', '@{upstream}...HEAD']),
  ])

  // The ship's own tree is in that list and is no dock of anybody's.
  const docks = parseWorktrees(worktrees)
    .map((tree) => tree.path)
    .filter((tree) => tree !== path)
  const rustDays = daysSince(lastCommit, ports.clock.now())
  const { ahead, behind } = parseTracking(tracking)
  const dirty = status !== null && status !== ''

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
    hasGit,
  }
}

/**
 * Finds repos under `<root>/<org>/<repo>`. That layout already exists, so no
 * configuration beyond the roots is needed.
 */
export async function findShipPaths(ports: Ports, root: string): Promise<readonly string[]> {
  const orgs = await ports.fs.readDir(root)
  if (orgs === null) {
    return []
  }

  const paths: string[] = []
  for (const org of orgs) {
    const orgPath = `${root}/${org}`
    if (!(await ports.fs.isDirectory(orgPath))) {
      continue
    }
    const repos = await ports.fs.readDir(orgPath)
    if (repos === null) {
      continue
    }
    for (const repo of repos) {
      const repoPath = `${orgPath}/${repo}`
      if (await ports.fs.isDirectory(`${repoPath}/.git`)) {
        paths.push(repoPath)
      }
    }
  }
  return paths.sort()
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
export async function surveyHarbor(
  ports: Ports,
  root: string,
  enlisted: readonly string[] = [],
  progress: SurveyProgress = {},
  catalog: readonly Quest[] = [],
): Promise<readonly Ship[]> {
  // An unreadable root and an empty one both yield zero ships, but only one of them is
  // a fault. Reporting them alike hides misconfiguration behind an empty harbor.
  if ((await ports.fs.readDir(root)) === null) {
    throw new UnreadableRootError(root)
  }

  const found = await findShipPaths(ports, root)
  const extra: string[] = []
  for (const path of enlisted) {
    if (!found.includes(path) && (await ports.fs.isDirectory(path))) {
      extra.push(path)
    }
  }

  const paths = [...found, ...extra].sort()
  const measured = new Map<string, Ship>()

  await inLanes(surveyOrder(paths, progress.first ?? []), SURVEY_LANES, async (path) => {
    const ship = await inspectShip(ports, path, catalog)
    measured.set(path, ship)
    progress.onShip?.(ship)
  })

  // By path, however it was measured: the measurement order is a decision about what the human
  // sees first, and it must not turn into the order the fleet is listed in.
  return paths.flatMap((path) => {
    const ship = measured.get(path)
    return ship === undefined ? [] : [ship]
  })
}
