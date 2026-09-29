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
 *
 * Kept in the data folder rather than in the projects themselves: many of those repositories
 * are not ours alone, and a marker file would show up as a diff in every clone.
 */

export interface Register {
  /** Ship paths to keep out of the main view. */
  archived: readonly string[]
  /** Directories to treat as ships although the survey would not find them. */
  enlisted: readonly string[]
}

export const EMPTY_REGISTER: Register = { archived: [], enlisted: [] }

const ARCHIVED_HEADING = 'Archiviert'
const ENLISTED_HEADING = 'Aufgenommen'

export function parseRegister(text: string): Register {
  const archived: string[] = []
  const enlisted: string[] = []
  let current: string[] | null = null

  for (const line of text.split('\n')) {
    const heading = /^##\s+(?<name>.+?)\s*$/u.exec(line)?.groups?.name
    if (heading !== undefined) {
      current =
        heading === ARCHIVED_HEADING ? archived : heading === ENLISTED_HEADING ? enlisted : null
      continue
    }

    const item = /^-\s+(?<path>\S.*?)\s*$/u.exec(line)?.groups?.path
    if (item !== undefined && current !== null && !current.includes(item)) {
      current.push(item)
    }
  }

  return { archived, enlisted }
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
    'Von Werft gepflegt. Hier steht nur, was die Musterung nicht selbst sehen kann.',
    '',
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
