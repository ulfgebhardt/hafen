import { hasChecks, RUST_THRESHOLD_DAYS } from '@hafen/core'

import type { QuestResult, QuestVerdict, Ship, Stage } from '@hafen/core'

/** User-facing strings are German — the shipyard vocabulary (see CLAUDE.md). */
const STAGE_LABEL: Record<Stage, string> = {
  drydock: 'Trockendock',
  dock: 'im Dock',
  berthed: 'am Kai',
  sailing: 'in Fahrt',
}

/**
 * A mark per verdict, and five of them.
 *
 * `unmeasured` gets its own `?` rather than sharing `!` with `violated`, because that is the whole
 * decision behind the five verdicts: an unsuccessful measurement is not a finding. A Rust crate
 * with no readable check says so instead of being reported as a gap.
 */
const VERDICT_MARK: Record<QuestVerdict, string> = {
  met: '+',
  violated: '!',
  waiting: '~',
  unmeasured: '?',
  notApplicable: '·',
}

const VERDICT_LABEL: Record<QuestVerdict, string> = {
  met: 'erfüllt',
  violated: 'verletzt',
  waiting: 'Voraussetzung offen',
  unmeasured: 'nicht messbar',
  notApplicable: 'nicht anwendbar',
}

/** How wide the id column is. Longer ids push the reason right rather than colliding with it. */
const ID_COLUMN = 16

/** The order a reader wants: what is broken first, what does not apply last. */
const VERDICT_ORDER: readonly QuestVerdict[] = [
  'violated',
  'waiting',
  'unmeasured',
  'met',
  'notApplicable',
]

function rustMark(ship: Ship): string {
  if (ship.rustDays === null) {
    return ''
  }
  return ship.rustDays > RUST_THRESHOLD_DAYS
    ? `  Rost ${String(ship.rustDays)}d`
    : `  ${String(ship.rustDays)}d`
}

/**
 * The roles nothing in this ship measures, or the one sentence for a ship that measures none.
 *
 * The role and not the house script name: the gap is a missing measurement, and any linter closes
 * it. `! fehlt: test:lint` told a foreign repo that a file of that name was missing, which stopped
 * being true the moment the role was read off the command.
 */
function gapNote(ship: Ship): string {
  if (ship.contract.kind === 'other' || ship.contract.gaps.length === 0) {
    return ''
  }
  return hasChecks(ship.contract)
    ? `      ! fehlt: ${ship.contract.gaps.join(', ')}`
    : '      ! keine Prüfung gefunden'
}

/** What a probe read, one line each. `?` for a question this ship cannot answer at all. */
function evidenceLines(quest: QuestResult): readonly string[] {
  return quest.checks.map((check) => {
    const mark = check.ok === null ? '?' : check.ok ? '+' : '!'
    return `          ${mark} ${check.evidence.question} — ${check.evidence.where}: ${check.evidence.found}`
  })
}

/**
 * The quests of one ship, worst first — and `notApplicable` left out.
 *
 * Left out here and counted in the summary: "gilt hier nicht" is the right answer and it is noise
 * in a list of 89 ships, while the number of them is the one figure that says how much of the
 * catalog this fleet is actually held to.
 */
function questLines(ship: Ship, verbose: boolean): readonly string[] {
  const shown = ship.quests.filter((quest) => quest.verdict !== 'notApplicable')
  if (shown.length === 0) {
    return []
  }

  const sorted = [...shown].sort(
    (a, b) =>
      VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) ||
      a.id.localeCompare(b.id),
  )

  return sorted.flatMap((quest) => {
    const own = ship.ownQuests.includes(quest.id) ? ' (eigene)' : ''
    // `padEnd` alone runs the id into the reason as soon as one is longer than the column —
    // `geschuetzter-hauptzweigwartet auf …`. The separating space has to be its own.
    const head = `      ${VERDICT_MARK[quest.verdict]} ${quest.id.padEnd(ID_COLUMN)} ${quest.reason}${own}`
    // The evidence, only when asked for: a verdict has to be arguable, and a list that always
    // carries its proof is a list nobody scrolls through.
    return verbose ? [head, ...evidenceLines(quest)] : [head]
  })
}

/** Nothing swallowed: a quest file with a typo is a demand the fleet stopped being held to. */
function unreadableLines(ships: readonly Ship[]): readonly string[] {
  const broken = ships.flatMap((ship) =>
    ship.unreadableQuests.map((path) => `  ! keine lesbare Quest: ${ship.name}/${path}`),
  )
  const dropped = ships.flatMap((ship) =>
    ship.overriddenQuests.map(
      (id) => `  ! ${ship.name}: eigene Quest ${id} verworfen — der Katalog fordert sie schon`,
    ),
  )
  return broken.length + dropped.length === 0 ? [] : ['', 'KATALOG', ...broken, ...dropped]
}

function countVerdicts(ships: readonly Ship[]): ReadonlyMap<QuestVerdict, number> {
  const counts = new Map<QuestVerdict, number>()
  for (const ship of ships) {
    for (const quest of ship.quests) {
      counts.set(quest.verdict, (counts.get(quest.verdict) ?? 0) + 1)
    }
  }
  return counts
}

export interface HarborOptions {
  /** Show the evidence behind every verdict. */
  verbose?: boolean
}

export function renderHarbor(ships: readonly Ship[], options: HarborOptions = {}): string {
  if (ships.length === 0) {
    return 'HAFEN\n\n  (keine Schiffe gefunden)'
  }
  const verbose = options.verbose ?? false

  /** Sailing first: the axis runs from achieved to neglected. */
  const order: readonly Stage[] = ['sailing', 'berthed', 'dock', 'drydock']
  const lines = [`HAFEN  ${String(ships.length)} Schiffe`, '']

  for (const stage of order) {
    const inStage = ships.filter((ship) => ship.stage === stage)
    if (inStage.length === 0) {
      continue
    }

    lines.push(`${STAGE_LABEL[stage]}  (${String(inStage.length)})`)
    for (const ship of inStage) {
      const label = `${ship.org}/${ship.name}`
      const dirty = ship.dirty ? ' *' : ''
      lines.push(`  ${label.padEnd(44)}${ship.branch ?? '?'}${dirty}${rustMark(ship)}`)
      const gaps = gapNote(ship)
      if (gaps !== '') {
        lines.push(gaps)
      }
      lines.push(...questLines(ship, verbose))
    }
    lines.push('')
  }

  const counts = countVerdicts(ships)
  const bound = ships.filter((ship) =>
    ship.quests.some((quest) => quest.verdict !== 'notApplicable'),
  ).length

  lines.push('QUESTS')
  for (const verdict of VERDICT_ORDER) {
    const n = counts.get(verdict) ?? 0
    if (n > 0) {
      lines.push(`  ${VERDICT_MARK[verdict]} ${String(n).padStart(4)}  ${VERDICT_LABEL[verdict]}`)
    }
  }
  lines.push(`  ${String(bound)} von ${String(ships.length)} Schiffen sind an eine Quest gebunden`)
  lines.push(...unreadableLines(ships))

  return lines.join('\n')
}
