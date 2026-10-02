import { leaderPath, remoteKey } from './alias'
import { BRANCH_FORMAT, defaultBranchOf, parseBranches } from './branches'
import { mergeCatalogs, readShipCatalog } from './catalog'
import { evaluateQuests } from './chain'
import { detectContract } from './contract'
import { forgeOf } from './forge'
import { measureLineage } from './lineage'
import { measureQuests } from './probe'
import { EMPTY_REGISTER } from './register'
import { statsFor } from './stats'
import { parseSubmodules } from './submodules'
import { daysSince } from './time'
import { LOG_FORMAT, NO_LEDGER, readLedger } from './work'
import { countStash, hasOpenWork, readWorking } from './working'

import type { Branch } from './branches'
import type { QuestResult } from './chain'
import type { Contract } from './contract'
import type { Forge } from './forge'
import type { Lineage } from './lineage'
import type { Ports } from './ports'
import type { Quest } from './quest'
import type { Register } from './register'
import type { ForgeStats } from './stats'
import type { Tender } from './submodules'
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
  /**
   * What each remote besides `origin` **is**: a mirror, an absorbed history, or undecidable.
   *
   * Beside `remotes` and never inside them, for the same reason the local marks stand beside the
   * contract: a remote is an address this repository has, and what it holds is a second question
   * with a second answer and its own evidence. Empty where there is only one remote — then there
   * is nothing to compare against, which is 77 of 92 repositories on this fleet.
   */
  lineage: readonly Lineage[]
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
  /**
   * Lines of text in the tree at `HEAD`, binaries excluded — `null` where git could not say.
   *
   * A size reading beside the score: a repository can be enormous and quiet, or small and busy,
   * and one number cannot be both. Generated files are in it, because they are text somebody
   * committed.
   */
  lines: number | null
  /**
   * The commits her history begins at — every one with no parent, sorted.
   *
   * The one reading that can say two repositories are the *same project*. A fork, a rebranding,
   * a deployment repo split off from a template: all of them keep the root commit of what they
   * came from, whatever they were renamed to and whichever organisation they ended up in. Eight
   * of the nine families on this fleet cross an organisation boundary, so nothing derived from a
   * directory name could have found them.
   *
   * A list, because a repository can honestly have more than one — a merged history, a grafted
   * import. Kinship is an intersection of the sets, never "the first one", which would depend on
   * git's output order.
   */
  roots: readonly string[]
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
   * The branch this repository treats as its default, or `null` where nothing said.
   *
   * Carried because it is what `Branch.merged` was measured against, and a verdict without the
   * thing it was compared to is one a reader has to take on faith.
   */
  defaultBranch: string | null
  /**
   * The repositories this one carries — submodules.
   *
   * A Beiboot and not a `dock`: a worktree is the same repository checked out twice and lies
   * beside her, a submodule is a different repository she takes with her. Measured because the
   * search cannot find them — it stops at a `.git` directory, and a submodule's `.git` is a file.
   */
  submodules: readonly Tender[]
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
  /**
   * When *this* ship was last read, where that is not the time of the whole survey.
   *
   * Absent after a full survey, because then the snapshot's own `at` is the answer for every ship
   * in it. Set where one repository was measured on its own: that ship is younger than the
   * picture around her, and the sheet beside her says so rather than letting the header's figure
   * speak for a minute it was not read in.
   */
  measuredAt?: string
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
 * mirror  https://git.seefahrt.example/org/ship.git (push)
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
  /**
   * What the forge said, where somebody asked it — **a file, never a request**.
   *
   * The survey reads this machine and asks nobody anything, and that does not change here: this
   * is the reading `hafen forge` wrote earlier, handed in by the caller. It exists because some
   * demands cannot be answered from a working tree at all — whether the default branch is guarded
   * is written down at GitHub and nowhere in the repository.
   *
   * Absent is the normal case and means exactly what it says: those quests stay `nicht messbar`,
   * which is the fifth verdict doing its job.
   */
  forge?: readonly ForgeStats[]
}

/**
 * The root commits, one per line, sorted so two readings of the same repository compare equal.
 *
 * Sorted here and not where they are compared: an order that comes out of git is an order that
 * can change, and a set whose spelling depends on the day is a set two snapshots disagree about.
 */
export function parseRoots(output: string | null): readonly string[] {
  return output === null
    ? []
    : [...new Set(output.split('\n').map((line) => line.trim()))]
        .filter((line) => line !== '')
        .sort()
}

/**
 * The lines `git grep -I -c '' HEAD` reported, added up.
 *
 * Each line is `HEAD:<path>:<count>`, and a path may hold colons — so the count is read from the
 * **end** and never by splitting the line into three. `null` for a repository git could not
 * answer about at all: no git, no HEAD, an empty tree. Nought lines and "no answer" are two
 * different things and must not look alike.
 */
export function countLines(output: string | null): number | null {
  if (output === null) {
    return null
  }
  let total = 0
  for (const line of output.split('\n')) {
    const at = line.lastIndexOf(':')
    const count = at === -1 ? Number.NaN : Number(line.slice(at + 1))
    if (Number.isFinite(count)) {
      total += count
    }
  }
  return total
}

export async function inspectShip(
  ports: Ports,
  path: string,
  options: InspectOptions = {},
): Promise<Ship> {
  const { catalog = [], ownEmails = [], archived = false, enlisted = false, forge = [] } = options
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
    remoteHead,
    modules,
    moduleUrls,
    roots,
    text,
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
    /*
     * Which branch the remote says leads. `git clone` writes this ref, `git remote add` does not,
     * so 12 of 92 repositories here answer nothing and fall back to a local name.
     */
    git(ports, path, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
    /*
     * The repositories this one carries.
     *
     * Needed because the search cannot find them: it stops at a `.git` **directory**, and a
     * submodule's `.git` is a file pointing into `../.git/modules/…`. Until this was measured the
     * survey walked straight through one and read whatever lay inside as the parent's.
     */
    git(ports, path, ['submodule', 'status']),
    /*
     * And where each of them is fetched from.
     *
     * `git submodule status` says *that* a repository is carried; only `.gitmodules` says
     * *which*. The url is what lets a carried repository be recognised as one of ours, which is
     * the tie the harbour draws two ships near each other for.
     */
    git(ports, path, ['config', '-f', '.gitmodules', '--get-regexp', '^submodule\\.']),
    /*
     * Where her history begins — every commit with no parent.
     *
     * The one reading here that can say two repositories are *the same project*: a fork, a
     * rebranding, a deployment repo split off from its template all keep the root commit of what
     * they came from. Nothing else measured here can tell that apart from a coincidence of names,
     * and it needs no forge and no network.
     *
     * A list and not one hash, because a repository can genuinely have several roots — a merged
     * history, a grafted import. Two of them are kin where the sets *intersect*; picking "the
     * first" would make the answer depend on git's output order.
     *
     * Measured over this fleet: 0.75 s for all 92, and it finds nine families, eight of which
     * cross organisation boundaries.
     */
    git(ports, path, ['rev-list', '--max-parents=0', 'HEAD']),
    /*
     * How much text this repository holds, counted once by git.
     *
     * `git grep -I -c '' HEAD` prints a line per **text** file with its line count, and the `-I`
     * is the whole reason this is honest: git decides what is binary, so no list of extensions
     * has to be kept and no image is counted as code. Measured on the biggest repository here —
     * 3 577 text files, 596 932 lines — at 0.29 s, which is cheaper than several of the calls
     * above it.
     *
     * It counts what is *in* the tree, generated files included: a lockfile is text somebody
     * committed. That is a size reading and not a craftsmanship one, and it is used as a size.
     */
    git(ports, path, ['grep', '-I', '-c', '', 'HEAD']),
  ])

  // The ship's own tree is in that list and is no dock of anybody's.
  const docks = parseWorktrees(worktrees)
    .map((tree) => tree.path)
    .filter((tree) => tree !== path)
  /*
   * Containment is asked against the branch that *leads*, so it needs the answer above first.
   *
   * One more round trip per repository rather than a guess: `--merged HEAD` is what it asked at
   * first, and standing on a feature branch that reports everything merged into *that* as ready to
   * delete. A branch that is not in the default branch cannot be deleted, and that is the whole
   * question.
   */
  const defaultBranch = defaultBranchOf(remoteHead, parseBranches(refs, null))
  const contained =
    defaultBranch === null
      ? null
      : await git(ports, path, ['branch', '--merged', defaultBranch, '--format=%(refname:short)'])
  const localBranches = parseBranches(refs, contained)
  const tenders = parseSubmodules(modules, moduleUrls)
  /*
   * And what the further remotes are, measured only where there are any.
   *
   * After the readings above rather than inside the big `Promise.all`, because it needs the parsed
   * remotes and because 77 of 92 repositories on this fleet skip it entirely — a repository with
   * only `origin` has nothing to compare against. See `lineage.ts`: until now every one of these
   * was called a mirror, and for the Leuchtturm upstreams that said the opposite of the truth.
   */
  const lineage = await measureLineage(ports, path, parseRemotes(remotes), defaultBranch)
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
      : evaluateQuests(
          merged.quests,
          await measureQuests(
            ports,
            path,
            contract,
            merged.quests,
            statsFor(forge, parseRemotes(remotes)),
          ),
        )

  return {
    name,
    org,
    path,
    remotes: parseRemotes(remotes),
    lineage,
    branch,
    dirty,
    working,
    stash,
    ledger,
    lines: countLines(text),
    roots: parseRoots(roots),
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
    defaultBranch,
    submodules: tenders,
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
 * `portmod_`, `portmod_new`, `altnetz_`, `altnetz-new`, `AddOns_`, `takel_local`. Without
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
 * `kombuese/addons/AddOns` at three. The limit exists so a stray symlink or a deeply nested
 * cache cannot turn the survey into a full disk walk.
 */
export const SEARCH_DEPTH = 4

export class UnreadableRootError extends Error {
  constructor(readonly root: string) {
    super(`Wurzel nicht lesbar: ${root}`)
    this.name = 'UnreadableRootError'
  }
}

/**
 * Every repository under the root — including nested ones, and stopping at each.
 *
 * The old search looked at exactly `<root>/<org>/<repo>` and found 90. There are 121 `.git`
 * directories out there, and the difference is the interesting part: **28 of the 31 it missed
 * live inside another repository** — nine foreign deployments under
 * `Leuchtturm/deployment/configurations`, four directus configs inside `peilung-app`, a
 * terraform module cache. Those are not ships. They are parts of the repository that contains
 * them, and listing them separately would count one project's contents as a fleet.
 *
 * So the rule is: descend, but **stop at a repository**. What is inside one belongs to it. That
 * leaves the two that really were missed — `kombuese/addons/AddOns` and `AddOns_`, which sit
 * one level deeper than the layout assumed because somebody grouped them in a folder.
 *
 * Breadth-first, so the shallow and ordinary case costs what it always did.
 */
export async function findShipPaths(ports: Ports, root: string): Promise<readonly string[]> {
  /*
   * The walk itself is the port's, and that is the whole saving.
   *
   * Done here it was two calls per directory entry — 2 174 of the survey's 6 676, and over a
   * process boundary 2 174 round trips to answer one question. The port does it in one call per
   * root, with whatever its environment has: a walk in Rust, a walk in node.
   *
   * `NOT_A_SHIP` goes along as a **hint** so a walker can prune the common names cheaply. The
   * rule is applied here afterwards, because it has a case a list of names cannot carry: a
   * directory is also not a ship when its name *begins* with one of them before a `_` or a `-`.
   * Half a rule in two places is how two answers to one question start.
   */
  const found = await ports.fs.treesWith(root, '.git', SEARCH_DEPTH, [...NOT_A_SHIP])
  if (found === null) {
    /*
     * An unreadable root and an empty one both yield zero ships, and only one of them is a fault:
     * reporting them alike hides a misconfiguration behind an empty harbour, and a typo in a
     * second root would quietly halve the fleet.
     *
     * Thrown from here rather than checked beforehand, which is what it was: a `readDir` of each
     * root *and* a search over it is two questions with one answer, and the search is the one that
     * has to look anyway.
     */
    throw new UnreadableRootError(root)
  }
  return found
    .filter((path) => {
      const below = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
      return !below.split('/').some((part) => isNotAShip(part) || part.startsWith('.'))
    })
    .sort()
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

/**
 * Runs `work` over `items`, never more than `lanes` of them at once.
 *
 * Exported because the forge reading needs the same shape for the same reason: a hundred requests
 * handed over at once is one wall the answers all arrive behind, and somebody else's rate limit
 * is a worse wall than this machine's.
 */
export async function inLanes<T>(
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
  /**
   * How many there are, as soon as that is known — which is before the first one is measured.
   *
   * A share needs a denominator, and a caller that guessed one from its own last snapshot would
   * be wrong exactly when it matters: the first survey of a machine, and the one right after a
   * repository was cloned or removed. The count is a measurement like any other, so it is
   * reported rather than inferred.
   */
  onCount?: (total: number) => void
  /**
   * Asked before each repository: whether to stop here and keep what is already measured.
   *
   * A survey of ninety repositories is seconds, and a reader who has seen enough must be able to
   * say so. It was a *process* that got killed while the CLI did the measuring; a window that
   * measures by itself has no process to kill, and "let it finish or reload the app" would be the
   * window taking a button away by moving the work closer.
   *
   * Partial and not discarded: what has been read is true, and throwing it away because the rest
   * was not would be the one thing a measurement must never do.
   */
  stop?: () => boolean
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
 * `kombuese/addons/AddOns` is linked into five game directories and drew as six identical ships
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
  const {
    register = EMPTY_REGISTER,
    progress = {},
    catalog = [],
    ownEmails = [],
    forge = [],
  } = options
  const enlisted = register.enlisted
  const adopted = new Set(enlisted)
  const archived = new Set(register.archived)
  const roots = typeof root === 'string' ? [root] : root

  const found = await findAcrossRoots(ports, roots)
  const extra: string[] = []
  for (const path of enlisted) {
    if (!found.includes(path) && (await ports.fs.isDirectory(path))) {
      extra.push(path)
    }
  }

  const paths = [...found, ...extra].sort()
  const measured = new Map<string, Ship>()
  progress.onCount?.(paths.length)

  await inLanes(surveyOrder(paths, progress.first ?? []), SURVEY_LANES, async (path) => {
    // Asked before the work and not after it: stopping is only worth anything if it stops
    // something, and the cheapest moment is before the fifteen git calls for this repository.
    if (progress.stop?.() === true) {
      return
    }
    const ship = await inspectShip(ports, path, {
      catalog,
      ownEmails,
      archived: archived.has(path),
      enlisted: adopted.has(path),
      forge,
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
