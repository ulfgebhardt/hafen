/**
 * The ship register: the handful of facts about the fleet that cannot be derived.
 *
 * Everything else Werft knows it reads from git, tmux, `/proc` or the transcripts — a
 * derived answer cannot go stale. These two cannot be read anywhere:
 *
 * - **archived**: "this project is finished" is a decision, not a measurement. Age comes
 *   close but gets it wrong in both directions — a dead experiment from last month and a
 *   stable tool untouched for two years.
 * - **enlisted**: a directory that is not a git repository, or lies outside the fleet root,
 *   is only a project because somebody says so.
 * - **roots**: *where* the projects are. Nothing on a machine says it. The CLI took
 *   `$HAFEN_ROOT` or two directories of one person's own convention, which is useless to anybody
 *   else — and a guess list of `~/Projects`, `~/src`, `~/code` would be exactly what this tool
 *   does not do: trade a measurement for a better-looking assumption. There is a measurement
 *   here, and it is asking the human once.
 *
 * - **forges**: which self-hosted host runs which forge. `github.com` is the same everywhere and
 *   ships with the tool; a Gitea is one machine's fact, and shipping one person's server in the
 *   code told everybody which one it was. Whether a host runs Gitea would be a question to its API,
 *   and the survey asks no network — so it is asked of the human, like the roots.
 *
 * Kept in the data folder rather than in the projects themselves: many of those repositories
 * are not ours alone, and a marker file would show up as a diff in every clone.
 */

import { BUILTIN_FORGES } from './forge'

import type { ForgeHost } from './forge'

export interface Register {
  /** Ship paths to keep out of the main view. */
  archived: readonly string[]
  /** Directories to treat as ships although the survey would not find them. */
  enlisted: readonly string[]
  /**
   * Where to look for repositories at all.
   *
   * Empty is an answer and not a default: a machine nobody has asked has no roots, and an empty
   * harbour that says so is better than a full one built out of a guess.
   */
  roots: readonly string[]
  /** Self-hosted forges this machine knows, beyond the one every machine has. */
  forges: readonly ForgeHost[]
}

export const EMPTY_REGISTER: Register = { archived: [], enlisted: [], roots: [], forges: [] }

const ARCHIVED_HEADING = 'Archiviert'
const ENLISTED_HEADING = 'Aufgenommen'
const ROOTS_HEADING = 'Wurzeln'
const FORGES_HEADING = 'Forges'
const FORGE_KINDS: readonly ForgeHost['forge'][] = ['github', 'gitea']

/**
 * `- git.example.org gitea`: a host, then what runs there.
 *
 * A line that says neither of the two kinds is dropped, not guessed at — `unknown` is already what
 * an unnamed host is, so a typo here costs exactly what not writing the line would.
 */
function forgeFrom(line: string): readonly ForgeHost[] {
  const [host, kind] = line.split(/\s+/u)
  const forge = FORGE_KINDS.find((one) => one === kind)
  return host === undefined || forge === undefined ? [] : [{ host, forge }]
}

export function parseRegister(text: string): Register {
  const archived: string[] = []
  const enlisted: string[] = []
  const roots: string[] = []
  const forgeLines: string[] = []
  const under: Record<string, string[]> = {
    [ARCHIVED_HEADING]: archived,
    [ENLISTED_HEADING]: enlisted,
    [ROOTS_HEADING]: roots,
    [FORGES_HEADING]: forgeLines,
  }
  let current: string[] | null = null

  for (const line of text.split('\n')) {
    const heading = /^##\s+(?<name>.+?)\s*$/u.exec(line)?.groups?.name
    if (heading !== undefined) {
      current = under[heading] ?? null
      continue
    }

    const item = /^-\s+(?<path>\S.*?)\s*$/u.exec(line)?.groups?.path
    if (item !== undefined && current !== null && !current.includes(item)) {
      current.push(item)
    }
  }

  return { archived, enlisted, roots, forges: forgeLines.flatMap(forgeFrom) }
}

/** Every forge this machine knows: the shipped one, then whatever its register adds. */
export function forgesOf(register: Register): readonly ForgeHost[] {
  return [...BUILTIN_FORGES, ...register.forges]
}

/**
 * Where to look, and in which order the two sources count.
 *
 * What was given — an argument, `$HAFEN_ROOT` — **leads**: it is an override somebody typed on
 * purpose, and an override a stored decision could beat would not be one. Otherwise the register,
 * which is where the answer to the first-run question goes.
 *
 * Neither, and the answer is **nothing** — not `~/Projects`, not `~/src`, not `$HOME`, and not the
 * two directories of one person's own convention the CLI used to fall back on. A guess list is
 * what this tool does not do; an empty answer the caller has to say out loud is a true one.
 */
export function rootsFor(given: readonly string[], register: Register): readonly string[] {
  return given.length > 0 ? given : register.roots
}

/** Sorted on write so two machines editing the register do not fight over line order. */
function section(heading: string, paths: readonly string[]): string {
  const body =
    paths.length === 0
      ? '_leer_'
      : [...paths]
          .sort()
          .map((path) => `- ${path}`)
          .join('\n')
  return `## ${heading}\n\n${body}\n`
}

export function renderRegister(register: Register): string {
  return [
    '# Schiffsregister',
    '',
    'Vom Hafen gepflegt. Hier steht nur, was die Messung nicht selbst sehen kann.',
    '',
    section(ROOTS_HEADING, register.roots),
    section(ARCHIVED_HEADING, register.archived),
    section(ENLISTED_HEADING, register.enlisted),
    section(
      FORGES_HEADING,
      register.forges.map((one) => `${one.host} ${one.forge}`),
    ),
  ].join('\n')
}

function withPath(paths: readonly string[], path: string, present: boolean): readonly string[] {
  const without = paths.filter((entry) => entry !== path)
  return present ? [...without, path] : without
}

export function setArchived(register: Register, path: string, archived: boolean): Register {
  return { ...register, archived: withPath(register.archived, path, archived) }
}

export function setEnlisted(register: Register, path: string, enlisted: boolean): Register {
  return { ...register, enlisted: withPath(register.enlisted, path, enlisted) }
}

/** Take a directory on as a place to look, or drop it again. */
export function setRoot(register: Register, path: string, searched: boolean): Register {
  return { ...register, roots: withPath(register.roots, path, searched) }
}
