/**
 * The measuring half of a quest: what a check reads, and what it saw.
 *
 * The demand is a file in the Ablage (`quest.ts`); this is the code that answers it. The two are
 * apart because they fail in opposite directions — a demand in code cannot be changed without
 * cutting a release, and a measurement in a data file cannot be run at all.
 *
 * **Every answer carries its evidence.** A bare verdict is a thing to believe, and a quest
 * evaluation nobody can trace back to what was read would be the kept status field it replaces,
 * only with better manners. So a probe says what it asked, where it looked, and what stood there
 * — including when it could not answer, which is a third result and not a `false`.
 *
 * Only the art `datei` answers here. It costs no access Werft does not already pay for: the same
 * manifests and workflows `detectContract` reads, plus the handful of files a quest names.
 * `forge`, `http`, `tls`, `dns` and `metrik` are `0045`; they are recognised and answered with
 * "this Werft does not measure that", which is section 4's own rule about the blind spot being
 * named instead of guessed at.
 */

import { CONTRACT_SCRIPTS, readWorkflows } from './contract'
import { SHIP_TRAITS } from './quest'
import { bodyBuilds } from './role'

import type { Contract, ContractPorts } from './contract'
import type { Quest, QuestCheck, ShipTrait } from './quest'
import type { CheckRole } from './role'
import type { ForgeStats } from './stats'

/** What a probe read, so a verdict can be argued with instead of believed. */
export interface Evidence {
  /** What was asked, in the words of the catalog or of the probe itself. */
  question: string
  /** Where it was looked up — a path in the ship, or the measurement it came out of. */
  where: string
  /** What stood there. */
  found: string
}

export interface ProbeResult {
  /**
   * `null` where the question cannot be answered on this ship at all — no manifest to read, no
   * workflow to look in, an art this Werft does not measure.
   *
   * A third value and not a `false`, for the reason the dock sweep gives when tmux does not
   * answer: an unsuccessful measurement is not a finding. A Rust crate has no `package.json`,
   * and reading that as "declares no lint script" is how the fixed list of four produced gaps
   * that were not there.
   */
  ok: boolean | null
  evidence: Evidence
}

/**
 * Everything the art `datei` needs, measured once per ship.
 *
 * Handed to the evaluation rather than read inside it, so that the evaluation stays a pure
 * function over facts — the same reason `orderCandidates` takes `landed` instead of asking git.
 */
export interface QuestFacts {
  contract: Contract
  /** What this ship is, of the traits a quest may ask for. */
  traits: readonly ShipTrait[]
  /** Every file the catalog names, read once. `null` for one that is not there. */
  files: ReadonlyMap<string, string | null>
  /** Dependency names across every manifest of the ship, both kinds. */
  dependencies: readonly string[]
  /**
   * Every workflow file of the ship, as text.
   *
   * The count answers "does this ship have CI at all", which has to stay apart from "no workflow
   * runs lint": without the distinction, a repository with no CI is told it has a lint gap in its
   * CI. The *contents* answer the other question — whether any workflow names a given tool, which
   * no fixed path can, because the file is called `release.yml` in five repositories here and
   * `release-please-lint.yml` in another.
   *
   * Read once and handed on: this used to be a bare count taken by listing the directory a second
   * time, while `detectContract` had already read every one of these files for `inCi`.
   */
  workflows: readonly string[]
  /**
   * What the forge said about this ship, where a reading was handed in.
   *
   * `null` is the normal case: the survey asks nobody anything, so unless the caller passed the
   * file `hafen forge` wrote, nothing here knows what GitHub thinks. Quests that need it answer
   * `nicht messbar`, which is what that verdict is for.
   */
  forge: ForgeStats | null
}

/**
 * The path a workflow names under a key, where one does.
 *
 * `release-please` is the case that forced it, and it is the same argument `ci-nennt` was built
 * on, one step further: the action takes `config-file: .github/release-please/config.json`, and a
 * quest naming a fixed path told two repositories on this fleet that their configuration was
 * missing while the workflow beside it said exactly where it is. The path is *measured* out of
 * the workflow rather than guessed from a list of places people usually put it.
 *
 * Refuses anything that climbs out of the ship or starts at the root, the same way `wantedFiles`
 * does: a workflow is a file in somebody else's repository, and it must not be able to make the
 * survey read `../../.ssh/id_ed25519`.
 */
export function namedInCi(workflows: readonly string[], key: string): string | null {
  if (key === '') {
    return null
  }
  for (const body of workflows) {
    for (const line of body.split('\n')) {
      const at = line.indexOf(`${key}:`)
      if (at === -1) {
        continue
      }
      const value = line
        .slice(at + key.length + 1)
        .trim()
        .replace(/^['"]|['"]$/gu, '')
        .split('#')[0]
        ?.trim()
      if (
        value === undefined ||
        value === '' ||
        value.startsWith('/') ||
        value.split('/').includes('..')
      ) {
        continue
      }
      return value
    }
  }
  return null
}

function role(check: QuestCheck): CheckRole | null {
  const named = check.args['rolle'] ?? ''
  return named === 'lint' || named === 'typecheck' || named === 'unit' || named === 'e2e'
    ? named
    : null
}

/** Which scripts of the ship fill a role, with the member they live in. */
function filling(contract: Contract, wanted: CheckRole): readonly string[] {
  return contract.members.flatMap((member) =>
    member.checks
      .filter((check) => check.role === wanted)
      .map((check) => (member.dir === '.' ? check.script : `${check.script} (${member.dir})`)),
  )
}

function manifestNote(contract: Contract): string {
  const count = contract.members.length
  return count === 1 ? '1 Manifest' : `${String(count)} Manifeste`
}

function workflowNote(facts: QuestFacts): string {
  const count = facts.workflows.length
  return count === 1 ? '1 Workflow' : `${String(count)} Workflows`
}

/** A path a quest names, refused when it would leave the ship. */
function shipFile(facts: QuestFacts, path: string): { ok: boolean | null; found: string } {
  const text = facts.files.get(path)
  if (text === undefined) {
    // Only a path the catalog refused to resolve gets here — an absolute one, or one climbing
    // out of the ship. Answered rather than read: the store can be pushed, and a quest that
    // reads `../../.ssh/id_ed25519` would make the survey a file exfiltration.
    return { ok: null, found: 'Pfad liegt nicht im Schiff' }
  }
  return { ok: text !== null, found: text === null ? 'nicht vorhanden' : 'vorhanden' }
}

/**
 * One check, answered.
 *
 * Every branch produces an `Evidence`, including the ones that answer `null`: "Werft cannot say"
 * is the answer that most needs its reason, because it is the one a reader would otherwise take
 * for a defect in the catalog.
 */
export function runCheck(check: QuestCheck, facts: QuestFacts): ProbeResult {
  const { contract } = facts
  const say = (
    question: string,
    where: string,
    found: string,
    ok: boolean | null,
  ): ProbeResult => ({
    ok,
    evidence: { question: check.question ?? question, where, found },
  })

  // Answering nothing is the point of this one, and it comes before the art: section 4 allows a
  // manual quest and demands in the same breath that Werft say which demands it cannot check
  // itself. "Nobody can measure this" and "this Werft does not measure that yet" are two
  // sentences, and only the second one will ever stop being true.
  if (check.kind === 'manuell' || check.probe === 'manuell') {
    return say('von Hand zu prüfen', 'nirgends', 'nicht maschinell prüfbar', null)
  }
  /*
   * `forge` is measured now, where a reading was handed in — see `forge-schutz`.
   *
   * It was the named blind spot: "this applies here and I cannot check it". It still is for every
   * ship whose forge nobody asked, and that is the point — the verdict depends on whether the
   * reading exists, not on the kind of the check.
   */
  if (check.kind !== 'datei' && check.kind !== 'forge') {
    return say(
      `Prüfung der Art ${check.kind}`,
      'nirgends',
      `die Prüfart ${check.kind} misst diese Werft nicht`,
      null,
    )
  }

  const wanted = role(check)

  switch (check.probe) {
    case 'rolle': {
      if (wanted === null) {
        return say(
          'Rolle',
          'nirgends',
          `keine Rolle genannt (rolle: ${check.args['rolle'] ?? ''})`,
          null,
        )
      }
      const scripts = filling(contract, wanted)
      const inCi = contract.inCi.includes(wanted)
      if (contract.members.length === 0 && facts.workflows.length === 0) {
        return say(
          `irgendetwas misst die Rolle ${wanted}`,
          'package.json, .github/workflows',
          'weder Manifest noch Workflow — hier ist nichts zu lesen',
          null,
        )
      }
      return say(
        `irgendetwas misst die Rolle ${wanted}`,
        `${manifestNote(contract)}, ${workflowNote(facts)}`,
        scripts.length > 0
          ? scripts.join(', ')
          : inCi
            ? 'kein Skript, aber die CI misst es'
            : 'nichts',
        contract.scripts[wanted] || inCi,
      )
    }

    case 'rolle-in-ci': {
      if (wanted === null) {
        return say('Rolle in der CI', 'nirgends', 'keine Rolle genannt', null)
      }
      if (facts.workflows.length === 0) {
        return say(
          `ein CI-Workflow ruft ${wanted} auf`,
          '.github/workflows',
          'keine Workflows — ob eine CI das misst, sagt dieses Repository nicht',
          null,
        )
      }
      return say(
        `ein CI-Workflow ruft ${wanted} auf`,
        `.github/workflows (${workflowNote(facts)})`,
        contract.inCi.length > 0 ? contract.inCi.join(', ') : 'keine Rolle in den run-Schritten',
        contract.inCi.includes(wanted),
      )
    }

    case 'haus-name': {
      if (wanted === null) {
        return say('Hausname', 'nirgends', 'keine Rolle genannt', null)
      }
      const scripts = filling(contract, wanted)
      if (scripts.length === 0) {
        // Whether the check carries the house name is only a question once there is a check.
        // Answering `false` here would report the same absence twice — once as the missing step
        // and once as the wrong name — and make one gap look like two.
        return say(
          `der ${wanted}-Schritt heißt ${CONTRACT_SCRIPTS[wanted]}`,
          'package.json → scripts',
          `kein Skript füllt die Rolle ${wanted}`,
          null,
        )
      }
      return say(
        `der ${wanted}-Schritt heißt ${CONTRACT_SCRIPTS[wanted]}`,
        'package.json → scripts',
        scripts.join(', '),
        contract.members.some((member) =>
          member.checks.some(
            (entry) => entry.role === wanted && entry.script === CONTRACT_SCRIPTS[wanted],
          ),
        ),
      )
    }

    case 'datei': {
      const path = check.args['datei'] ?? ''
      const seen = shipFile(facts, path)
      return say(`${path} liegt im Schiff`, path, seen.found, seen.ok)
    }

    /**
     * Any one of several paths — the question a single path cannot answer.
     *
     * A licence is spelled `LICENSE`, `LICENSE.md`, `LICENCE` or `COPYING`, and a readme is
     * `README.md` or `README`. Measured over 44 node repositories here: 16 carry `LICENSE` and 10
     * carry `LICENSE.md`, so a quest naming one path would report a gap in ten repositories that
     * do exactly what is asked. That is the same argument `ci-nennt` was created for, one
     * directory over.
     *
     * Comma-separated in `dateien:`, the shape `gilt_fuer` already uses for "several of these".
     */
    case 'datei-eine-von': {
      const candidates = (check.args['dateien'] ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')
      if (candidates.length === 0) {
        return say('eine dieser Dateien liegt im Schiff', 'nirgends', 'keine Datei genannt', null)
      }

      const seen = candidates.map((path) => ({ path, ...shipFile(facts, path) }))
      const hit = seen.find((one) => one.ok === true)
      // Unreadable everywhere is unmeasured, not missing: a catalog that named only paths this
      // survey refuses has said nothing about the ship, and `null` is what that is.
      const readable = seen.some((one) => one.ok !== null)
      return say(
        `eine von ${candidates.join(', ')} liegt im Schiff`,
        candidates.join(', '),
        hit === undefined
          ? readable
            ? 'keine davon vorhanden'
            : 'kein Pfad liegt im Schiff'
          : `${hit.path} vorhanden`,
        readable ? hit !== undefined : null,
      )
    }

    /**
     * A file the CI itself names — and the default where it names none.
     *
     * Two repositories here run release-please with `config-file:` pointing into
     * `.github/release-please/`, and a quest naming the default path alone reported a gap in both.
     * That is the failure `ci-nennt` exists to prevent, one directory over: the drawing of a
     * demand must not depend on where a tool's documentation happens to put a file by default.
     *
     * `sonst` is the tool's own default and not a list of places people like: a default is a fact
     * about the tool, a list would be a guess about this fleet — and the one thing this survey
     * never does is keep a guess list.
     */
    case 'datei-aus-ci': {
      const key = check.args['schluessel'] ?? ''
      const fallback = check.args['sonst'] ?? ''
      const named = namedInCi(facts.workflows, key)
      const path = named ?? fallback
      if (path === '') {
        return say(`eine Datei, die ${key} nennt`, 'nirgends', 'keine Datei genannt', null)
      }
      const seen = shipFile(facts, path)
      return say(
        `${path} liegt im Schiff`,
        named === null ? `${path} (Vorgabe)` : `${path} (aus .github/workflows)`,
        seen.found,
        seen.ok,
      )
    }

    case 'datei-enthaelt': {
      const path = check.args['datei'] ?? ''
      const text = check.args['text'] ?? ''
      const raw = facts.files.get(path)
      if (raw === undefined) {
        return say(`${path} nennt ${text}`, path, 'Pfad liegt nicht im Schiff', null)
      }
      return say(
        `${path} nennt ${text}`,
        path,
        raw === null
          ? 'nicht vorhanden'
          : raw.includes(text)
            ? `nennt ${text}`
            : `nennt ${text} nicht`,
        raw?.includes(text) ?? false,
      )
    }

    /**
     * Whether *any* workflow names something — the question a fixed path cannot answer.
     *
     * release-please is the case that forced it: the workflow is called `release.yml` in five of
     * these repositories, `release-please-lint.yml` in another, `ui-release.yml` in a third. A
     * quest that named one path would measure the file name instead of the practice, and would
     * report a gap in repositories that do exactly what is asked.
     */
    /**
     * Whether anything in this ship builds a deliverable artifact.
     *
     * Measured off the commands and not off a script called `build`: `"bundle": "vite build"`
     * builds and `"build": "turbo build"` only delegates. A ship with no manifest at all cannot
     * answer — that is `nicht messbar` and not a gap.
     */
    case 'baut': {
      if (contract.members.length === 0) {
        return say('ein Skript baut ein Artefakt', 'nirgends', 'kein Manifest zu lesen', null)
      }
      return say(
        'ein Skript baut ein Artefakt',
        `package.json (${manifestNote(contract)})`,
        contract.builds ? 'ein Skript baut' : 'kein Skript baut',
        contract.builds,
      )
    }

    /**
     * And whether a workflow runs one — the other half of "somebody goes the whole way".
     *
     * Read out of the `run:` steps rather than by looking for the word `build`, which stands in
     * half the job names on this fleet without anything being built.
     */
    case 'baut-in-ci': {
      if (facts.workflows.length === 0) {
        return say(
          'ein Workflow baut',
          '.github/workflows',
          'keine Workflows — ob eine CI das tut, sagt dieses Repository nicht',
          null,
        )
      }
      const hit = facts.workflows.some((body) =>
        body
          .split('\n')
          .filter((line) => line.includes('run:'))
          .some((line) => bodyBuilds(line.slice(line.indexOf('run:') + 4))),
      )
      return say(
        'ein Workflow baut',
        `.github/workflows (${workflowNote(facts)})`,
        hit ? 'ein Schritt baut' : 'kein Schritt baut',
        hit,
      )
    }

    /**
     * What guards the default branch — the one demand no working tree can answer.
     *
     * Read from the forge **file**, never from the network: the survey asks nobody anything, and
     * this is the reading `hafen forge` wrote. Without one the answer is `nicht messbar`, which is
     * the honest sentence — "this applies here and I cannot check it".
     *
     * And where nothing was found, the answer depends on whether we were *allowed* to look.
     * Rulesets are public, the classic protection rule is admin-only — so an empty answer from a
     * repository we do not administer means "we may not see it" and not "nothing guards it". The
     * second would be an invented gap, which is the one thing this catalog never does.
     */
    case 'forge-schutz': {
      const asked = (check.args['fordert'] ?? '')
        .split(',')
        .map((one) => one.trim())
        .filter((one) => one !== '')
      const stats = facts.forge
      if (stats === null) {
        return say(
          `der Hauptzweig verlangt ${asked.join(' und ')}`,
          'nirgends',
          'die Forge wurde nicht gefragt — `hafen forge` liefert die Lesung',
          null,
        )
      }
      /*
       * `?? null` and not `stats.guard`: a reading written before this field existed carries no
       * `guard` at all, and `undefined` would walk straight past a `=== null` check into a crash.
       * An old file is not a finding — it is a reading that cannot answer this question.
       */
      const guard = stats.guard ?? null
      if (guard === null) {
        return say(
          `der Hauptzweig verlangt ${asked.join(' und ')}`,
          stats.slug.host,
          `${stats.slug.host} beantwortet diese Frage nicht — oder die Lesung ist aelter als sie`,
          null,
        )
      }
      if (guard.source === 'none' && !guard.admin) {
        return say(
          `der Hauptzweig verlangt ${asked.join(' und ')}`,
          `${stats.slug.host} (kein Ruleset sichtbar)`,
          'kein Ruleset, und ohne Admin-Recht ist die klassische Regel nicht lesbar',
          null,
        )
      }
      const has: Record<string, boolean> = {
        'pull-request': guard.pullRequest,
        'status-checks': guard.statusChecks,
      }
      const missing = asked.filter((one) => has[one] !== true)
      return say(
        `der Hauptzweig verlangt ${asked.join(' und ')}`,
        `${stats.slug.host} (${guard.source === 'none' ? 'nichts gesetzt' : guard.source})`,
        missing.length === 0 ? 'alles davon' : `es fehlt: ${missing.join(', ')}`,
        missing.length === 0,
      )
    }

    case 'ci-nennt': {
      const text = check.args['text'] ?? ''
      if (facts.workflows.length === 0) {
        return say(
          `ein Workflow nennt ${text}`,
          '.github/workflows',
          'keine Workflows — ob eine CI das tut, sagt dieses Repository nicht',
          null,
        )
      }
      const hit = facts.workflows.some((body) => body.includes(text))
      return say(
        `ein Workflow nennt ${text}`,
        `.github/workflows (${workflowNote(facts)})`,
        hit ? `nennt ${text}` : `nennt ${text} nirgends`,
        hit,
      )
    }

    case 'abhaengigkeit': {
      const name = check.args['paket'] ?? ''
      if (contract.members.length === 0) {
        return say(`${name} ist eine Abhängigkeit`, 'package.json', 'kein Manifest zu lesen', null)
      }
      return say(
        `${name} ist eine Abhängigkeit`,
        `package.json (${manifestNote(contract)})`,
        facts.dependencies.includes(name) ? 'deklariert' : 'nicht deklariert',
        facts.dependencies.includes(name),
      )
    }

    default:
      // The one place that decides which probes exist. A name nobody implements is answered and
      // not thrown: a typo in one quest must not take the catalog down, and a catalog written
      // for a later Werft has to be readable by this one.
      return say(
        `Prüfung ${check.probe}`,
        'nirgends',
        `die Prüfung ${check.probe} kennt diese Werft nicht`,
        null,
      )
  }
}

/** Every distinct file path the catalog names, and whether it is one this survey may read. */
function wantedFiles(catalog: readonly Quest[]): readonly string[] {
  const paths = new Set<string>()
  for (const quest of catalog) {
    for (const check of quest.checks) {
      // `datei` names one, `dateien` several, `sonst` the default a `datei-aus-ci` falls back
      // to — all of them end up in the same read.
      const named = [
        check.args['datei'],
        check.args['sonst'],
        ...(check.args['dateien'] ?? '').split(','),
      ]
      for (const entry of named) {
        const path = entry?.trim()
        if (
          path !== undefined &&
          path !== '' &&
          !path.startsWith('/') &&
          !path.split('/').includes('..')
        ) {
          paths.add(path)
        }
      }
    }
  }
  return [...paths].sort()
}

interface Manifest {
  dependencies?: Readonly<Record<string, string>>
  devDependencies?: Readonly<Record<string, string>>
}

/**
 * The dependency names of every member.
 *
 * Read from the directories the contract already found, and only when a quest asks — the survey
 * has parsed these files once for their scripts, and asking git a second time for the same list
 * would be a second answer to "which manifests are this ship's".
 */
async function readDependencies(
  ports: ContractPorts,
  shipPath: string,
  contract: Contract,
): Promise<readonly string[]> {
  const found = await Promise.all(
    contract.members.map(async (member) => {
      const at = member.dir === '.' ? shipPath : `${shipPath}/${member.dir}`
      const raw = await ports.fs.readFile(`${at}/package.json`)
      if (raw === null) {
        return []
      }
      try {
        const manifest = JSON.parse(raw) as Manifest
        return [
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.devDependencies ?? {}),
        ]
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          throw error
        }
        return []
      }
    }),
  )
  return [...new Set(found.flat())].sort()
}

/** How many workflow files there are — counted, never read. See `QuestFacts.workflows`. */

/**
 * Whether this repository bundles a desktop binary.
 *
 * Asked of git and not of a list of likely places. `tauri.conf.json` sits at `src-tauri/` in a
 * single-app repository and at `apps/<name>/src-tauri/` in a monorepo, and a candidate list would
 * be the guess that this tool refuses everywhere else it looks for a file — the same rule that
 * finds the manifests with `git ls-files '*package.json'`.
 *
 * Only when the catalog asks, like the dependencies: a fleet whose quests never name the trait
 * pays no git call for it, and on eighty-odd worktrees that is the difference that matters.
 */
async function bundlesBinary(ports: ContractPorts, shipPath: string): Promise<boolean> {
  const found = await ports.proc.run('git', ['ls-files', '-z', '--', '*tauri.conf.json'], shipPath)
  return found.code === 0 && found.stdout.replaceAll('\0', '').trim() !== ''
}

/** What the ship is, of the traits a quest may ask for. */
async function readTraits(
  ports: ContractPorts,
  shipPath: string,
  contract: Contract,
  asked: ReadonlySet<string>,
): Promise<readonly ShipTrait[]> {
  const has: Record<ShipTrait, boolean> = {
    node: contract.kind !== 'other',
    rust: (await ports.fs.readFile(`${shipPath}/Cargo.toml`)) !== null,
    tauri: asked.has('tauri') && (await bundlesBinary(ports, shipPath)),
  }
  return SHIP_TRAITS.filter((trait) => has[trait])
}

/**
 * Everything the catalog needs to know about one ship.
 *
 * Driven by the catalog and not by a fixed list: a quest that names no file costs no read, and a
 * fleet with an empty catalog pays nothing at all. That is what keeps the demand extensible by
 * lines in a file rather than by a second rebuild.
 */
export async function measureQuests(
  ports: ContractPorts,
  shipPath: string,
  contract: Contract,
  catalog: readonly Quest[],
  forge: ForgeStats | null = null,
): Promise<QuestFacts> {
  const paths = wantedFiles(catalog)
  const asksDependencies = catalog.some((quest) =>
    quest.checks.some((check) => check.probe === 'abhaengigkeit'),
  )
  // Which traits any quest gates on at all. The cheap ones are measured regardless; the ones that
  // cost a git call are not, and this is what tells them apart.
  const askedTraits = new Set(catalog.flatMap((quest) => quest.appliesTo))

  const [files, dependencies, workflows, traits] = await Promise.all([
    Promise.all(
      paths.map(async (path) => [path, await ports.fs.readFile(`${shipPath}/${path}`)] as const),
    ),
    asksDependencies ? readDependencies(ports, shipPath, contract) : Promise.resolve([]),
    readWorkflows(ports.fs, shipPath),
    readTraits(ports, shipPath, contract, askedTraits),
  ])

  /*
   * And the files the workflows themselves name — a second pass, because their paths are not
   * known until the workflows have been read.
   *
   * Only for the keys a quest asks about, so a fleet whose catalog has no `datei-aus-ci` check
   * pays nothing for this, exactly as it pays nothing for a quest that names no file.
   */
  const keys = new Set(
    catalog.flatMap((quest) =>
      quest.checks
        .filter((check) => check.probe === 'datei-aus-ci')
        .map((check) => check.args['schluessel'] ?? ''),
    ),
  )
  const fromCi = await Promise.all(
    [...keys]
      .map((key) => namedInCi(workflows, key))
      .filter((path): path is string => path !== null && !paths.includes(path))
      .map(async (path) => [path, await ports.fs.readFile(`${shipPath}/${path}`)] as const),
  )

  return {
    contract,
    traits,
    files: new Map([...files, ...fromCi]),
    dependencies,
    workflows,
    forge,
  }
}
