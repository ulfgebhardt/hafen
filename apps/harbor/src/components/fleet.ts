/**
 * What the scene needs to know about a ship, worked out once.
 *
 * Here and not in the components, because a template cannot be argued with: "worst first" is a
 * decision about what a human sees at the top of ninety-one hulls, and it belongs somewhere a
 * test can point at.
 */

import { rustLevel } from '@hafen/core'

import { VERDICT_ORDER } from './theme'

import type { QuestResult, QuestVerdict, Ship } from '@hafen/core'

/** The quests that say something about this ship — `notApplicable` does not. */
export function bindingQuests(ship: Ship): readonly QuestResult[] {
  return ship.quests.filter((quest) => quest.verdict !== 'notApplicable')
}

/**
 * The quests in reading order: worst first, then by id.
 *
 * By id and not by chain, because within one chain the id is the only stable second key — two
 * quests with the same verdict would otherwise swap places between two snapshots.
 */
export function orderedQuests(quests: readonly QuestResult[]): readonly QuestResult[] {
  return [...quests].sort(
    (a, b) =>
      VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) ||
      a.id.localeCompare(b.id),
  )
}

/** How many of each verdict, over any set of ships. */
export function countVerdicts(ships: readonly Ship[]): ReadonlyMap<QuestVerdict, number> {
  const counts = new Map<QuestVerdict, number>()
  for (const ship of ships) {
    for (const quest of ship.quests) {
      counts.set(quest.verdict, (counts.get(quest.verdict) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * The worst verdict this ship carries, or `null` for one nothing applies to.
 *
 * `null` rather than `notApplicable`: "no demand reaches this repository" and "a demand does not
 * apply" are different sentences, and the scene bands on the first one.
 */
export function worstVerdict(ship: Ship): QuestVerdict | null {
  const binding = bindingQuests(ship)
  if (binding.length === 0) {
    return null
  }
  return orderedQuests(binding)[0]?.verdict ?? null
}

/**
 * Where a ship sorts in the harbor: by what is wrong with it, worst first.
 *
 * The chosen order is "alle, nach Zustand sortiert" — every ship drawn once. A ship nothing is
 * demanded of sorts after every ship that owes something, and before nothing: it is not a
 * failure, it is simply not part of this question.
 *
 * Rust is the second key and never the first. Fresh is not the same as important — a repository
 * touched today with a violated contract belongs above one from last year that meets everything.
 */
export function byCondition(a: Ship, b: Ship): number {
  const rank = (ship: Ship): number => {
    const worst = worstVerdict(ship)
    return worst === null ? VERDICT_ORDER.length : VERDICT_ORDER.indexOf(worst)
  }

  const byWorst = rank(a) - rank(b)
  if (byWorst !== 0) {
    return byWorst
  }

  // More violations of the same severity is worse than fewer.
  const open = (ship: Ship): number =>
    bindingQuests(ship).filter((quest) => quest.verdict !== 'met').length
  const byOpen = open(b) - open(a)
  if (byOpen !== 0) {
    return byOpen
  }

  const rust = (ship: Ship): number => ship.rustDays ?? Number.MAX_SAFE_INTEGER
  return rust(b) - rust(a) || `${a.org}/${a.name}`.localeCompare(`${b.org}/${b.name}`)
}

/**
 * How far along the quay a hull lies, in the band of its own rust level.
 *
 * A function of the path and nothing else, so a ship does not jump between two snapshots: the
 * scene is read repeatedly, and a hull that moved because a neighbour changed would make the
 * whole picture untrustworthy. Deliberately not random for the same reason.
 */
export function drift(path: string): number {
  let hash = 0
  for (const char of path) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997
  }
  return hash / 997
}

export interface Berth {
  ship: Ship
  /** 0 … 1 across the scene, left to right. */
  x: number
  /** Which depth band, 0 nearest the open sea. */
  lane: number
  /** Seconds of offset, so a fleet does not roll in lockstep. */
  phase: number
}

/** How many hulls stand in one row before the next one starts. */
export const PER_LANE = 10

/**
 * The fleet laid out over the water: worst first, left to right, wrapping into lanes.
 *
 * Lanes rather than one long row, because ninety-one hulls in a line is a horizontal scroll —
 * and the thing worth seeing is the *shape of the fleet*, which needs them all at once.
 */
export function berths(ships: readonly Ship[]): readonly Berth[] {
  const sorted = [...ships].sort(byCondition)
  return sorted.map((ship, index) => ({
    ship,
    x: (index % PER_LANE) / PER_LANE,
    lane: Math.floor(index / PER_LANE),
    phase: drift(ship.path) * 7,
  }))
}

/** Days as a phrase, or the honest absence for a repository with no commits. */
export function ageLabel(rustDays: number | null): string {
  return rustDays === null ? 'ohne Commits' : `${String(rustDays)} Tage`
}

/**
 * A caption cut to the width it has, with an ellipsis where it was cut.
 *
 * Needed because Pixi has no text overflow: the first drawing ran ninety-one full paths into
 * cells 128 px wide and the fleet came out as one illegible band. Cutting *and saying so* is
 * the same rule the issue bodies follow — a caption that silently ends mid-word is a caption
 * that claims to be whole.
 */
export function fit(text: string, chars: number): string {
  return text.length <= chars ? text : `${text.slice(0, Math.max(1, chars - 1))}…`
}

/** Kept beside `shipLabel` so the label does not reach into the theme for one word. */
const RUST_TEXT: Record<ReturnType<typeof rustLevel>, string> = {
  none: 'in Fahrt gehalten',
  growth: 'leichter Bewuchs',
  rust: 'Rost',
  scrap: 'Abwrackkandidat',
}

/** The one-line description a hull answers to, for a tooltip and for a screen reader. */
export function shipLabel(ship: Ship): string {
  const worst = worstVerdict(ship)
  const binding = bindingQuests(ship)
  const quests =
    worst === null
      ? 'keine Forderung'
      : `${String(binding.filter((quest) => quest.verdict === 'met').length)} von ${String(binding.length)} Quests erfüllt`
  return `${ship.org}/${ship.name} — ${RUST_TEXT[rustLevel(ship.rustDays)]}, ${ageLabel(ship.rustDays)}, ${quests}`
}
