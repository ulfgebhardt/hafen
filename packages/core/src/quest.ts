/**
 * A quest: one demand, written down once and evaluated per ship (concept section 4).
 *
 * The split this file exists for is the one the fixed list of four script names never had:
 * **the demand is a decision, the check is a measurement**. The demand lives in the Ablage as a
 * file a human wrote — `titel`, `warum`, `kette`, and who it applies to. What the check reads
 * lives in code (`probe.ts`), and only its result is ever produced. Nothing here is a status
 * anybody keeps.
 *
 * Why the demand is not in the code beside the check: a norm in a release is a norm nobody can
 * change without cutting one, and "this repository owes no e2e" is then a code change. Why the
 * check is not in the file beside the demand: a check written as prose cannot be run, and a
 * verdict nobody can trace back to what was read is the kept status field all over again.
 *
 * The frontmatter is the schema from concept section 4, verbatim, down to the German keys — this
 * is content in the Ablage and not an interface, `0045` quotes the same block, and a second
 * spelling of it would make the two disagree the first time either is extended.
 */

import type { FsPort } from './ports'

/**
 * The five chains of concept section 4, in the order a project walks them: technique first,
 * money last. `werft` is the technical chain — CI, tests, blueprint, monitoring — and the test
 * contract is its content.
 */
export const QUEST_CHAINS = ['werft', 'auslauf', 'fracht', 'flagge', 'handel'] as const

export type QuestChain = (typeof QUEST_CHAINS)[number]

/**
 * How a check is measured. Only `datei` answers today; the rest are named because concept
 * section 4 names them and `0045` builds them — a catalog that already says `art: http` reads
 * here as "not this Werft's job" rather than as a broken file.
 */
export const PROBE_KINDS = ['datei', 'forge', 'http', 'tls', 'dns', 'metrik', 'manuell'] as const

export type ProbeKind = (typeof PROBE_KINDS)[number]

/**
 * What a ship has to be for a quest to apply to it at all.
 *
 * A closed, measured vocabulary and not a free-text field: "applies to node projects" has to be
 * answerable from the repository, or it is a second kept status. It is deliberately about the
 * ship and not about the check — `lint` is owed by anything that compiles, `lint-standard` only
 * by what can carry an eslint config, and that difference is the whole reason a Rust crate comes
 * out as `notApplicable` instead of as a gap.
 *
 * `tauri` is named for exactly what is measured and not for the broader thing it is a case of. A
 * trait called `binary` would claim to recognise every repository that ships an executable, and
 * what the measurement sees is one bundler's config file — then a Go program with no self-update
 * would carry a gap it was never asked about. The narrow name is the honest one.
 */
export const SHIP_TRAITS = ['node', 'rust', 'tauri'] as const

export type ShipTrait = (typeof SHIP_TRAITS)[number]

/** One thing a quest asks about a ship. */
export interface QuestCheck {
  /**
   * Which measurement answers it, by name. A plain string and not a union of the probes Werft
   * has: an unknown name is answered with "there is no such check", which is a finding a human
   * can act on, while a parse error would take the whole catalog down for one typo.
   */
  probe: string
  /** Where it looks. Inherited from `pruefung.art` unless the check says otherwise. */
  kind: ProbeKind
  /** Everything else the line said, handed to the probe as written. */
  args: Readonly<Record<string, string>>
  /**
   * The demand in the human's own words, or `null` to let the probe describe itself.
   *
   * Optional because the probe's description is the more accurate of the two — it says what was
   * actually read — and a sentence in the file that drifts from it is worse than no sentence.
   * Present where the norm means more than its measurement.
   */
  question: string | null
}

export interface Quest {
  id: string
  chain: QuestChain
  title: string
  /** Quest ids that have to be met before this one is asked. */
  requires: readonly string[]
  /** Which ships owe it. Empty means every ship. */
  appliesTo: readonly ShipTrait[]
  checks: readonly QuestCheck[]
  /** Why the fleet demands this. Shown beside the verdict — a demand without it is an order. */
  why: string
}

/** The keys this reader knows, so a quest file with a typo in one says so instead of going quiet. */
const PRUEFUNG = 'pruefung'
const CHECKS = 'checks'
const ART = 'art'
const PROBE = 'pruef'
const FRAGE = 'frage'

/**
 * One line of the frontmatter, in the four parts this subset needs.
 *
 * Read by hand rather than with a YAML library, for the reason `workspaceDirs` gives one file
 * over: exactly one shape comes out of these files, `core` carries no runtime dependency, and
 * the whole grammar is scalars, string lists, one nested mapping and a list of flat mappings. A
 * file outside that shape is a file nobody here wrote.
 */
interface Line {
  indent: number
  /** `- …`, the start of a list entry. */
  item: boolean
  /** `null` for a bare list entry (`- node`), which carries a value and no key. */
  key: string | null
  value: string
}

function readLine(raw: string): Line | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.startsWith('#')) {
    return null
  }
  const indent = raw.length - raw.trimStart().length
  const item = trimmed.startsWith('- ')
  const rest = item ? trimmed.slice(2).trim() : trimmed

  const separator = rest.indexOf(':')
  if (separator <= 0) {
    return { indent, item, key: null, value: rest }
  }
  return {
    indent,
    item,
    key: rest.slice(0, separator).trim(),
    // `- pruef: rolle` puts the key two characters further right than the dash suggests, and the
    // fields under it line up with the key and not with the dash. Adding the dash back is what
    // makes "belongs to this entry" a plain indentation comparison below.
    value: rest.slice(separator + 1).trim(),
  }
}

/** Where the block under `lines[at]` ends: the first line that is not indented further. */
function blockEnd(lines: readonly Line[], at: number, indent: number): number {
  let end = at + 1
  while (end < lines.length && (lines[end]?.indent ?? 0) > indent) {
    end += 1
  }
  return end
}

function unquote(value: string): string {
  const quote = value.slice(0, 1)
  return (quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1
    ? value.slice(1, -1).replaceAll(`\\${quote}`, quote)
    : value
}

/** A line put back together — prose has colons in it, and `readLine` split on the first one. */
function whole(line: Line): string {
  return line.key === null ? line.value : `${line.key}: ${line.value}`
}

/** `[a, b]` and the block form both occur — a human writes whichever their editor suggests. */
function readList(lines: readonly Line[], at: number, value: string): readonly string[] {
  if (value.startsWith('[')) {
    return value
      .replace(/^\[|\]$/gu, '')
      .split(',')
      .map((entry) => unquote(entry.trim()))
      .filter((entry) => entry !== '')
  }
  const indent = lines[at]?.indent ?? 0
  return lines
    .slice(at + 1, blockEnd(lines, at, indent))
    .filter((line) => line.item)
    .map((line) => unquote(whole(line)))
}

/**
 * A block scalar (`>` or `|`) as one paragraph.
 *
 * Both markers fold, which is narrower than YAML and deliberate: the only block scalar in this
 * schema is `warum`, that is a paragraph, and a line break inside a paragraph is a wrap and not
 * content. Reading `|` as line breaks would make the field round-trip differently depending on
 * which marker a human happened to type.
 */
function readBlockScalar(lines: readonly Line[], at: number): string {
  const indent = lines[at]?.indent ?? 0
  return lines
    .slice(at + 1, blockEnd(lines, at, indent))
    .map(whole)
    .join(' ')
    .trim()
}

/** The checks under `pruefung.checks`, one entry per `- pruef: …` and its indented fields. */
function readChecks(
  lines: readonly Line[],
  at: number,
  fallback: ProbeKind,
): readonly QuestCheck[] {
  const indent = lines[at]?.indent ?? 0
  const end = blockEnd(lines, at, indent)
  const checks: QuestCheck[] = []

  for (let index = at + 1; index < end; index += 1) {
    const line = lines[index]
    if (line?.key == null) {
      continue
    }
    if (line.item) {
      checks.push({ probe: '', kind: fallback, args: {}, question: null })
    }
    const current = checks.at(-1)
    if (current === undefined) {
      continue
    }

    const value = unquote(line.value)
    if (line.key === PROBE) {
      current.probe = value
    } else if (line.key === ART) {
      // A check may name its own art, and that is the one place this reader goes beyond the
      // schema in section 4. It has to: the manual requirement of the lint standard — "every
      // deviation carries its reason" — sits inside a quest whose other checks read files, and a
      // quest that had to be split in two to say so would split the demand as well.
      current.kind = (PROBE_KINDS as readonly string[]).includes(value)
        ? (value as ProbeKind)
        : fallback
    } else if (line.key === FRAGE) {
      current.question = value
    } else {
      current.args = { ...current.args, [line.key]: value }
    }
  }

  return checks.filter((check) => check.probe !== '')
}

/**
 * One quest file, or `null` when it is not one.
 *
 * `null` rather than a throw, and per file rather than per catalog: one unreadable quest must not
 * take the other nine with it. The caller reports it — an absent quest is a demand nobody is
 * held to, and that is exactly the kind of silence this module exists to remove.
 */
export function parseQuest(text: string): Quest | null {
  if (!text.startsWith('---\n')) {
    return null
  }
  const end = text.indexOf('\n---', 4)
  if (end === -1) {
    return null
  }

  const lines = text
    .slice(4, end)
    .split('\n')
    .map(readLine)
    .filter((line): line is Line => line !== null)

  let id = ''
  let chain = ''
  let title = ''
  let why = ''
  let requires: readonly string[] = []
  let appliesTo: readonly string[] = []
  let kind: ProbeKind = 'datei'
  let checksAt = -1

  for (const [index, line] of lines.entries()) {
    if (line.key === null || line.indent > 0) {
      continue
    }
    const value = unquote(line.value)
    switch (line.key) {
      case 'id':
        id = value
        break
      case 'kette':
        chain = value
        break
      case 'titel':
        title = value
        break
      case 'setzt_voraus':
        requires = readList(lines, index, line.value)
        break
      case 'gilt_fuer':
        appliesTo = readList(lines, index, line.value)
        break
      case 'warum':
        why = value === '>' || value === '|' ? readBlockScalar(lines, index) : value
        break
      case PRUEFUNG: {
        // Noted here and read afterwards, because `art` is the default for every check under it
        // and may stand after `checks:` in the file. Reading the checks on sight would make the
        // order of two lines a silent difference in what the catalog demands.
        const block = lines.slice(index + 1, blockEnd(lines, index, line.indent))
        // Only the direct children of `pruefung`. A check may carry its own `art`, and reading
        // that one as the quest's default made every other check inherit the odd one out.
        const childIndent = Math.min(...block.map((entry) => entry.indent))
        for (const nested of block.filter((entry) => entry.indent === childIndent)) {
          const art = unquote(nested.value)
          if (nested.key === ART && (PROBE_KINDS as readonly string[]).includes(art)) {
            kind = art as ProbeKind
          }
          if (nested.key === CHECKS && !nested.item) {
            checksAt = lines.indexOf(nested)
          }
        }
        break
      }
      default:
        break
    }
  }

  if (id === '' || !(QUEST_CHAINS as readonly string[]).includes(chain) || title === '') {
    return null
  }

  return {
    id,
    chain: chain as QuestChain,
    title,
    requires,
    appliesTo: appliesTo.filter((trait): trait is ShipTrait =>
      (SHIP_TRAITS as readonly string[]).includes(trait),
    ),
    checks: checksAt === -1 ? [] : readChecks(lines, checksAt, kind),
    why,
  }
}

/** Quoted only where it has to be, so a file Werft writes reads like one a human wrote. */
function scalar(value: string): string {
  return /^[\w./-][\w./ -]*$/u.test(value) ? value : `'${value.replaceAll("'", "\\'")}'`
}

function inlineList(values: readonly string[]): string {
  return `[${values.join(', ')}]`
}

/** The width the catalog is wrapped to, so a `warum` reads as a paragraph and not as one line. */
const WRAP = 92

/** A paragraph as a folded block scalar — the form `readBlockScalar` folds back into it exactly. */
function folded(key: string, text: string): readonly string[] {
  const lines = [`${key}: >`]
  let current = ''
  for (const word of text.split(' ').filter((entry) => entry !== '')) {
    if (current !== '' && `${current} ${word}`.length > WRAP) {
      lines.push(`  ${current}`)
      current = word
    } else {
      current = current === '' ? word : `${current} ${word}`
    }
  }
  if (current !== '') {
    lines.push(`  ${current}`)
  }
  return lines
}

function count(quest: Quest, kind: ProbeKind): number {
  return quest.checks.filter((check) => check.kind === kind).length
}

/**
 * A quest back as its file.
 *
 * Here so the reader can be held to a round trip: a format read by hand is a format that loses a
 * field the day somebody adds one, and a test that writes and reads back is the only thing that
 * notices. Werft does not write the catalog otherwise — its content is the human's decision
 * (`0045`), and a button that changes a demand turns the demand into a setting.
 */
export function renderQuest(quest: Quest): string {
  const arts = new Set(quest.checks.map((check) => check.kind))
  // The quest's own art is the one its checks share; where they differ, the most common one
  // stays above and the odd check names its own. Anything else would write an `art:` line that
  // is true of no check in the file.
  const common = [...arts].sort((a, b) => count(quest, b) - count(quest, a))[0] ?? 'datei'

  const lines = [
    '---',
    `id: ${scalar(quest.id)}`,
    `kette: ${scalar(quest.chain)}`,
    `titel: ${scalar(quest.title)}`,
  ]
  if (quest.requires.length > 0) {
    lines.push(`setzt_voraus: ${inlineList(quest.requires)}`)
  }
  if (quest.appliesTo.length > 0) {
    lines.push(`gilt_fuer: ${inlineList(quest.appliesTo)}`)
  }
  lines.push(PRUEFUNG + ':', `  ${ART}: ${common}`, `  ${CHECKS}:`)

  for (const check of quest.checks) {
    lines.push(`    - ${PROBE}: ${scalar(check.probe)}`)
    if (check.kind !== common) {
      lines.push(`      ${ART}: ${check.kind}`)
    }
    for (const [key, value] of Object.entries(check.args)) {
      lines.push(`      ${key}: ${scalar(value)}`)
    }
    if (check.question !== null) {
      lines.push(`      ${FRAGE}: ${scalar(check.question)}`)
    }
  }

  lines.push(...folded('warum', quest.why), '---', '', `# ${quest.title}`, '')
  return lines.join('\n')
}

/**
 * The catalog in a fixed order: by chain as section 4 lays them out, then by id.
 *
 * Sorted on read and not on write, because the catalog is a directory of files and a directory
 * has whatever order the filesystem feels like. A list that reads differently twice is a list
 * nobody can diff.
 */
export function questCatalog(quests: readonly Quest[]): readonly Quest[] {
  return [...quests].sort(
    (a, b) =>
      QUEST_CHAINS.indexOf(a.chain) - QUEST_CHAINS.indexOf(b.chain) || a.id.localeCompare(b.id),
  )
}

/** Where the catalog lies in the store, beside `auftraege/` and `register.md`. */
export const QUESTS_DIR = 'quests'

/** What a directory of quest files came to, files that are not quests included. */
export interface QuestCatalog {
  quests: readonly Quest[]
  /**
   * Paths under `quests/` that did not read as a quest, relative to the store.
   *
   * Reported rather than skipped quietly. A quest file with a typo in `kette` is a demand the
   * whole fleet stops being held to, and the only sign of it would be a number going down.
   */
  unreadable: readonly string[]
}

/**
 * The catalog as it lies in the store: `quests/<kette>/<id>.md`.
 *
 * The chain is a directory *and* a field, which looks like two answers to one question and is
 * not: the file is the human's, section 4 writes both, and the field is the one that counts here
 * — the directory is filing. Reading the directory instead would make a quest change its chain
 * by being moved, which is a rename and not a decision.
 */
export async function readQuestCatalog(
  fs: Pick<FsPort, 'readDir' | 'readFile'>,
  store: string,
): Promise<QuestCatalog> {
  const chains = (await fs.readDir(`${store}/${QUESTS_DIR}`))?.map((one) => one.name) ?? null
  if (chains === null) {
    return { quests: [], unreadable: [] }
  }

  const found = await Promise.all(
    chains.map(async (chain) => {
      const entries =
        (await fs.readDir(`${store}/${QUESTS_DIR}/${chain}`))?.map((one) => one.name) ?? null
      return await Promise.all(
        (entries ?? [])
          .filter((entry) => entry.endsWith('.md'))
          .map(async (entry) => {
            const at = `${QUESTS_DIR}/${chain}/${entry}`
            const raw = await fs.readFile(`${store}/${at}`)
            return { at, quest: raw === null ? null : parseQuest(raw) }
          }),
      )
    }),
  )

  const read = found.flat()
  return {
    quests: questCatalog(read.flatMap(({ quest }) => (quest === null ? [] : [quest]))),
    unreadable: read.flatMap(({ at, quest }) => (quest === null ? [at] : [])).sort(),
  }
}
