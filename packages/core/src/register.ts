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
 * Kept in the data folder rather than in the projects themselves: many of those repositories
 * are not ours alone, and a marker file would show up as a diff in every clone.
 */

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
}

export const EMPTY_REGISTER: Register = { archived: [], enlisted: [], roots: [] }

const ARCHIVED_HEADING = 'Archiviert'
const ENLISTED_HEADING = 'Aufgenommen'
const ROOTS_HEADING = 'Wurzeln'

export function parseRegister(text: string): Register {
  const archived: string[] = []
  const enlisted: string[] = []
  const roots: string[] = []
  const under: Record<string, string[]> = {
    [ARCHIVED_HEADING]: archived,
    [ENLISTED_HEADING]: enlisted,
    [ROOTS_HEADING]: roots,
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

  return { archived, enlisted, roots }
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
