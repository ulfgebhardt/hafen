/**
 * Which ships belong together, and what colour they fly.
 *
 * Off `ship.org` — the directory the repository is filed under — and therefore **measured, not
 * decided**. That is the whole reason there is no tag store: a label somebody types would be
 * state that can go stale, and this one is already in the path. It also matches how the fleet is
 * actually kept: 25 groups on this machine, the largest 18 ships.
 *
 * Measured against the alternative before choosing it: grouping by the *forge* owner gives almost
 * the same 26 groups, but leaves 6 repositories with no group at all because they have no
 * `origin`. A grouping that cannot place every ship is not a grouping.
 *
 * The colour comes out of the name itself rather than a table. Two reasons, and the second is the
 * one that matters: a table would need an entry per organisation and would be a decision file
 * again, and a hash means the same name is the same colour in every window, every snapshot and
 * every screenshot without anything being stored or agreed.
 *
 * **But a hash straight onto 360 degrees was wrong, and the fleet said so.** Measured over the 25
 * organisations here, the closest two flags landed **one degree apart** — which is not "similar",
 * it is indistinguishable, and indistinguishable-but-not-equal is the worst of the three states
 * because it reads as a bug. Twenty-five names over 360 slots collide that way by birthday
 * arithmetic, not by bad luck.
 *
 * So the hue is quantised to a ladder of well-separated rungs: two flags are now either the *same*
 * colour or an obviously different one, never almost. And a rung is shared rather than unique, so
 * a flag carries a **shape** as well — the same rule the verdicts follow, for the same reason.
 * Eight percent of men do not separate two of these hues at all, and a shape survives that, a
 * screenshot in greyscale, and a rung shared by two organisations.
 *
 * It does not get every pair apart, and the number is written down rather than rounded off: 24
 * rungs times 4 cuts times 2 brightnesses is 192 flags, and the 25 organisations here land on 22
 * of them — three pairs share. That is the cost of having no table, and it is payable because a
 * flag is never the only thing identifying a ship: the two halves of a shared flag lie in
 * different docks, and a dock carries its organisation's name in writing.
 */

import type { Ship } from '@hafen/core'

/**
 * Hue per organisation, from the name.
 *
 * A 32-bit FNV-style walk rather than a sum of char codes: a sum gives `ab` and `ba` the same
 * answer, and on this fleet that collided `wir-social` with `utopia-os` at four degrees apart.
 * Deliberately not random — the harbour is read repeatedly, and a colour that moved between two
 * readings would make every other colour untrustworthy too.
 */
function hashOf(name: string): number {
  let hash = 2166136261
  for (const char of name) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

/**
 * How many rungs the hue ladder has.
 *
 * Twenty-four, so neighbours are fifteen degrees apart — far enough that nobody reads them as the
 * same flag, and enough rungs that the 25 organisations here do not all pile onto a handful.
 */
export const RUNGS = 24

export function hueOf(name: string): number {
  return (hashOf(name) % RUNGS) * (360 / RUNGS)
}

/**
 * The flag's cut, from a second reading of the same name.
 *
 * The part that survives a shared rung, greyscale, and a reader who does not separate the hues.
 * Four cuts a signal flag actually has; nothing invented.
 */
export const CUTS = ['square', 'pennant', 'swallowtail', 'burgee'] as const

export type Cut = (typeof CUTS)[number]

export function cutOf(name: string): Cut {
  return CUTS[Math.floor(hashOf(name) / RUNGS) % CUTS.length] ?? 'square'
}

/**
 * The flag, as a colour.
 *
 * Saturation and lightness are fixed so no organisation can end up with a flag that disappears
 * against the water or shouts louder than a violated contract. The hue is the only free axis,
 * which is also what makes two flags comparable at a glance: same hue, same owner, full stop.
 */
export const FLAG = { saturation: 62, light: 62, dark: 42 } as const

/** Two brightnesses per rung, so two organisations sharing one are still two flags. */
export function lightnessOf(name: string): number {
  return Math.floor(hashOf(name) / (RUNGS * CUTS.length)) % 2 === 0 ? FLAG.light : FLAG.dark
}

export function flagColor(org: string): string {
  return `hsl(${String(hueOf(org))} ${String(FLAG.saturation)}% ${String(lightnessOf(org))}%)`
}

/** The same, as the number Pixi wants. */
export function flagTint(org: string): number {
  const hue = hueOf(org) / 360
  const sat = FLAG.saturation / 100
  const light = lightnessOf(org) / 100
  const chroma = (1 - Math.abs(2 * light - 1)) * sat
  const second = chroma * (1 - Math.abs(((hue * 6) % 2) - 1))
  const base = light - chroma / 2
  const sextant = Math.floor(hue * 6) % 6
  const [r, g, b] = (
    [
      [chroma, second, 0],
      [second, chroma, 0],
      [0, chroma, second],
      [0, second, chroma],
      [second, 0, chroma],
      [chroma, 0, second],
    ] as const
  )[sextant] ?? [0, 0, 0]

  const byte = (value: number): number => Math.round((value + base) * 255)
  return (byte(r) << 16) | (byte(g) << 8) | byte(b)
}

/** One organisation's ships, in the order they were handed over. */
export interface Fleetlet {
  org: string
  ships: readonly Ship[]
}

/**
 * The fleet split by organisation, biggest group first.
 *
 * Biggest first because the layout hangs the groups off one walkway in this order, and a harbour
 * that put its eighteen-ship organisation at the far end would spend the whole picture getting
 * there. Ties by name, so nothing swaps between two snapshots.
 *
 * A repository filed directly under a root has no organisation, and it gets its own group rather
 * than being spread among the others — "ohne" is an answer about where it lies, not a gap.
 */
export const NO_ORG = 'ohne'

export function fleetlets(ships: readonly Ship[]): readonly Fleetlet[] {
  const byOrg = new Map<string, Ship[]>()
  for (const ship of ships) {
    const org = ship.org === '' ? NO_ORG : ship.org
    byOrg.set(org, [...(byOrg.get(org) ?? []), ship])
  }

  return [...byOrg]
    .map(([org, group]) => ({ org, ships: group }))
    .sort((a, b) => b.ships.length - a.ships.length || a.org.localeCompare(b.org))
}
