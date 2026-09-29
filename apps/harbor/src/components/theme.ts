import type { MarkKind } from './marks'
import type { Activity, QuestVerdict, RustLevel, Stage } from '@hafen/core'

/** User-facing strings are German — the shipyard vocabulary (see CLAUDE.md). */

export const STAGE_LABEL: Record<Stage, string> = {
  sailing: 'In Fahrt',
  berthed: 'Am Kai',
  dock: 'Im Dock',
  drydock: 'Trockendock',
}

/**
 * What each stage is actually derived from.
 *
 * Shown beside the label because the label alone invites a wrong reading: "In Fahrt" does not
 * mean deployed — nothing here asks a forge, so it cannot.
 */
export const STAGE_MEANING: Record<Stage, string> = {
  sailing: 'im Dienst, nichts offen',
  berthed: 'ungesichert oder ungepusht',
  dock: 'weiterer Worktree offen',
  drydock: 'über 90 Tage unberührt',
}

export const ACTIVITY_LABEL: Record<Activity, string> = {
  active: 'Aktiv',
  dormant: 'Ruhend',
  archived: 'Archiviert',
}

export const RUST_LABEL: Record<RustLevel, string> = {
  none: 'in Fahrt gehalten',
  growth: 'leichter Bewuchs',
  rust: 'Rost',
  scrap: 'Abwrackkandidat',
}

export const VERDICT_LABEL: Record<QuestVerdict, string> = {
  met: 'erfüllt',
  violated: 'verletzt',
  waiting: 'Voraussetzung offen',
  unmeasured: 'nicht messbar',
  notApplicable: 'nicht anwendbar',
}

/**
 * Why each verdict exists, in one sentence.
 *
 * `unmeasured` carries the load here: it is the one people read as a failure, and the whole
 * reason there are five verdicts rather than three is that an unsuccessful measurement is not
 * a finding.
 */
export const VERDICT_MEANING: Record<QuestVerdict, string> = {
  met: 'jede Prüfung dieser Forderung hat geantwortet, und positiv',
  violated: 'mindestens eine Prüfung hat geantwortet, und negativ',
  waiting: 'eine Voraussetzung ist selbst noch nicht erfüllt',
  unmeasured: 'hier lässt sich nichts davon messen — das ist keine Lücke',
  notApplicable: 'diese Forderung gilt für dieses Schiff nicht',
}

/**
 * The order a reader wants: what is broken first, what does not apply last.
 *
 * Also the order of the hull segments, so a ship is read left to right from worst to best and
 * two ships beside each other can be compared without counting.
 */
export const VERDICT_ORDER: readonly QuestVerdict[] = [
  'violated',
  'waiting',
  'unmeasured',
  'met',
  'notApplicable',
]

/**
 * Colour per verdict — and never colour alone.
 *
 * Every verdict also carries a *form* in the hull (`SEGMENT`): fill, hatch, or a dashed
 * outline. Eight percent of men cannot separate the red from the green here, and a screen
 * reader gets neither — the shape and the label are what actually carry the reading.
 */
export const VERDICT_COLOR: Record<QuestVerdict, string> = {
  met: '#5f9e7a',
  violated: '#c2634f',
  waiting: '#c9a24a',
  unmeasured: '#6f7d8c',
  notApplicable: '#3c4652',
}

/** How a hull segment is drawn per verdict: the reading that survives greyscale. */
export const SEGMENT: Record<QuestVerdict, { opacity: number; hatch: boolean; dashed: boolean }> = {
  met: { opacity: 0.92, hatch: false, dashed: false },
  violated: { opacity: 0.34, hatch: true, dashed: false },
  waiting: { opacity: 0.3, hatch: false, dashed: false },
  unmeasured: { opacity: 0.12, hatch: false, dashed: true },
  notApplicable: { opacity: 0, hatch: false, dashed: false },
}

export const HULL_COLOR: Record<RustLevel, string> = {
  none: '#a8c0d6',
  growth: '#9aa8ae',
  rust: '#b08a68',
  scrap: '#9a7660',
}

/**
 * Scene palette. Steel blue and grey, with rust as the only warm tone in the hulls.
 *
 * Lifted off black: the bands still darken from open water down to the quay, so a ship's place
 * reads without a legend, but the ladder starts high enough that a thin stroke and a small
 * label have something to stand against.
 */
export const SCENE = {
  skyTop: '#0e1722',
  skyLow: '#1b2c40',
  seaFar: '#1a3247',
  seaNear: '#14273a',
  seaLine: '#2c4257',
  quay: '#222d3a',
  land: '#1b232d',
  crane: '#8a9db0',
  accent: '#e08a4f',
} as const

/**
 * Colour per local mark — the repository's own state, not the fleet's demands.
 *
 * Deliberately a quieter range than `VERDICT_COLOR`: a dirty tree is normal and a violated quest
 * is not, so local marks read as detail on the ship while the deck keeps the loud colours.
 * `damage` is the exception and shares the violated red, because a conflict is the one local
 * state that has stopped rather than progressed.
 */
export const MARK_COLOR: Record<MarkKind, string> = {
  staged: '#7fa8c9',
  unstaged: '#c9a24a',
  untracked: '#8d8d8d',
  damage: '#c2634f',
  pennant: '#e08a4f',
  drag: '#6f7d8c',
  stash: '#9a7fc9',
  boat: '#7f9a8d',
}
