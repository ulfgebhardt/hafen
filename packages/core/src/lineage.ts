/**
 * What a second remote *is* — a mirror of this repository, or a different one it descends from.
 *
 * Until now every remote that was not `origin` was a mirror (`mirrorsOf`), and that was one word
 * for two things. Measured on this fleet: of 24 such remotes, three hold the same repository under
 * a second address, nine are foreign histories merged in, and twelve are a different repository of
 * the same lineage. Calling the Ocelot upstream a "mirror" said the opposite of the truth: a
 * mirror holds the same work and may be ignored, an origin is where the work came from and the one
 * place a change belongs.
 *
 * **Three verdicts and not two, and the third is the point.** Whether a remote of the same lineage
 * is the origin or an abandoned mirror is not in the repository: `sender-fm` is 75 commits ahead of
 * `ocelot/master` and `u-vote.eu` is 7 ahead of its old gogs address, and those two readings are
 * the same reading. Only the forge knows (`isFork { parent }`), so the answer here is `uncertain`
 * and the direction is the forge's to give. Folding it into `origin` would invent a fact in the
 * one case this was built for.
 */

import type { Ports } from './ports'
import type { Remote } from './ship'

/**
 * Git's own name for the remote that leads, spelled here rather than imported.
 *
 * `ship.ts` has the same constant, and a value import of it would point this module back at the
 * one that uses it. A type-only import does not: `kin.ts` is built the same way and for the same
 * reason. The duplication is one string that git itself fixes.
 */
const ORIGIN = 'origin'

/**
 * What a remote holds, as far as the repository alone can say.
 *
 * - `mirror` — the same repository: both addresses hold exactly the same commits.
 * - `absorbed` — a foreign history merged into this one: its root is not this lineage's root.
 * - `uncertain` — the same lineage, direction unknown. See the note above.
 *
 * There is no `origin` here on purpose. It would have to come from the counts, and the counts
 * cannot carry it.
 */
export type Kinship = 'mirror' | 'absorbed' | 'uncertain'

/** What was counted, so the word can be checked rather than believed. */
export interface Lineage {
  /** The remote this is about, by the name git gave it. */
  remote: string
  kinship: Kinship
  /** Commits `origin` has that this remote has not, or `null` where nothing was counted. */
  onlyOrigin: number | null
  /** And the other way round. A mirror is the case where both are zero. */
  onlyRemote: number | null
  /** The sentence that stands beside the word, in the reader's language. */
  because: string
}

/**
 * The verdict, from readings already taken. Pure, so the rule can be tested without a repository.
 *
 * `sameUrl` comes first and costs nothing: two remotes on one address are one repository, and
 * `IT4Change/boilerplate-frontend` carries exactly that — a submodule helper added `origin`'s own
 * url a second time. Counting there measured the refspecs of two remotes against each other and
 * reported 30 commits of difference between a repository and itself.
 */
export function judge(reading: {
  sameUrl: boolean
  /** The root of `origin`'s main lineage, following first parents only. `null` if unreadable. */
  lineRoot: string | null
  /** Every root commit the remote's fetched refs reach. */
  remoteRoots: readonly string[]
  onlyOrigin: number | null
  onlyRemote: number | null
}): Pick<Lineage, 'kinship' | 'because'> {
  if (reading.sameUrl) {
    return { kinship: 'mirror', because: 'dieselbe Adresse wie origin' }
  }
  /*
   * Before the lineage root, and the order was a bug the fleet caught.
   *
   * "Both addresses hold exactly the same commits" is a complete answer that needs no context: the
   * root is only wanted to tell an absorbed history from the same line. Asking for the root first
   * threw away two certain mirrors (`wow-toc-parser`, `mangos_zero_script_acid`) because their
   * origin is a Gitea with no `origin/HEAD` symref — a missing *extra* reading had overruled a
   * reading that was already conclusive.
   */
  if (reading.onlyOrigin === 0 && reading.onlyRemote === 0) {
    return { kinship: 'mirror', because: 'beide Adressen halten dieselben Commits' }
  }
  /*
   * Nothing was fetched of origin's own line, so a foreign root cannot be told from a shared one.
   * Measured on `webcraftmedia/jahrweiser`, where the default branch is `main` and no ref for it
   * exists here. Treated as "not measurable" and not as "no shared root": those are different
   * sentences and only one of them is true.
   */
  if (reading.lineRoot === null) {
    return { kinship: 'uncertain', because: 'origins Hauptlinie ist hier nicht gelesen' }
  }
  if (reading.remoteRoots.length === 0) {
    return { kinship: 'uncertain', because: 'von diesem Remote liegt hier nichts' }
  }
  if (!reading.remoteRoots.includes(reading.lineRoot)) {
    return {
      kinship: 'absorbed',
      because: 'fremde Wurzel — diese Geschichte wurde hereingemischt',
    }
  }
  return {
    kinship: 'uncertain',
    because: `dieselbe Linie, ${String(reading.onlyOrigin ?? 0)} davor und ${String(reading.onlyRemote ?? 0)} dahinter — Spiegel oder Herkunft sagt nur die Forge`,
  }
}

/** Every root commit a set of refs reaches, as `rev-list` prints them. */
function roots(stdout: string): readonly string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** A count, or `null` when git had nothing to say. A missing number is not a zero. */
function count(stdout: string): number | null {
  const said = Number.parseInt(stdout.trim(), 10)
  return Number.isNaN(said) ? null : said
}

/**
 * Reads what the remotes are, for one repository.
 *
 * **Only where there is more than one remote.** A repository with just `origin` has nothing to
 * compare against, and on this fleet that is 77 of 92 — paying four git calls each to answer a
 * question nobody asked is the opposite of what `treesWith` was for. Where it does run it costs
 * one call for the lineage root and three per further remote.
 *
 * Nothing is fetched. Every count is over refs this machine already has, which is also why
 * `uncertain` is common: a remote nobody fetched since the fork is a remote nobody can judge.
 */
export async function measureLineage(
  ports: Ports,
  path: string,
  remotes: readonly Remote[],
  /**
   * The branch that leads, as the survey already measured it (`defaultBranchOf`).
   *
   * Handed in rather than guessed here: `refs/remotes/origin/HEAD` is a symref many origins never
   * set — on this fleet the Gitea ones do not — and giving up there cost two mirrors that were
   * plainly measurable. `null` falls back to the symref, which is the better answer where it
   * exists.
   */
  defaultBranch: string | null = null,
): Promise<readonly Lineage[]> {
  const origin = remotes.find((remote) => remote.name === ORIGIN) ?? null
  const others = remotes.filter((remote) => remote.name !== ORIGIN)
  if (origin === null || others.length === 0) {
    return []
  }

  /*
   * The root of the main lineage and not every root this repository has: `Ocelot-Social` reaches
   * fifteen, fourteen of them from subtrees merged in over the years. Following first parents only
   * asks "where did *this* line of work begin", which is the question that tells a fork from an
   * absorbed history.
   */
  const leading =
    defaultBranch === null ? 'refs/remotes/origin/HEAD' : `refs/remotes/origin/${defaultBranch}`
  const line = await ports.proc.run(
    'git',
    ['rev-list', '--max-parents=0', '--first-parent', leading],
    path,
  )
  const lineRoot = line.code === 0 ? (roots(line.stdout)[0] ?? null) : null

  return Promise.all(
    others.map(async (remote) => {
      if (remote.url === origin.url) {
        return {
          remote: remote.name,
          onlyOrigin: null,
          onlyRemote: null,
          ...judge({
            sameUrl: true,
            lineRoot,
            remoteRoots: [],
            onlyOrigin: null,
            onlyRemote: null,
          }),
        }
      }

      const [ahead, behind, theirs] = await Promise.all([
        ports.proc.run(
          'git',
          ['rev-list', '--count', '--remotes=origin', '--not', `--remotes=${remote.name}`],
          path,
        ),
        ports.proc.run(
          'git',
          ['rev-list', '--count', `--remotes=${remote.name}`, '--not', '--remotes=origin'],
          path,
        ),
        ports.proc.run('git', ['rev-list', '--max-parents=0', `--remotes=${remote.name}`], path),
      ])

      const onlyOrigin = ahead.code === 0 ? count(ahead.stdout) : null
      const onlyRemote = behind.code === 0 ? count(behind.stdout) : null
      return {
        remote: remote.name,
        onlyOrigin,
        onlyRemote,
        ...judge({
          sameUrl: false,
          lineRoot,
          remoteRoots: theirs.code === 0 ? roots(theirs.stdout) : [],
          onlyOrigin,
          onlyRemote,
        }),
      }
    }),
  )
}

/** What one remote is, or `null` where it was never judged. */
export function lineageOf(lineage: readonly Lineage[], name: string): Lineage | null {
  return lineage.find((entry) => entry.remote === name) ?? null
}
