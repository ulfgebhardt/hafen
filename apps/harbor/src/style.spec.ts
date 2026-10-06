// The stylesheets are read as text, so the extension is the point of the import.
// eslint-disable-next-line import-x/extensions
import tailwind from 'tailwindcss/theme.css?raw'
import { describe, expect, it } from 'vitest'

import { contrast, declarations, over, parseColor } from './contrast'
// eslint-disable-next-line n/file-extension-in-import
import style from './style.css?raw'

/**
 * The text roles hold WCAG AA on every surface text is drawn on.
 *
 * The surfaces are read from Tailwind's own theme, not copied: a palette change upstream moves
 * the measurement with it instead of leaving a stale number here.
 */

const ours = declarations(style)
const theirs = declarations(tailwind)

const colour = (name: string, from: ReadonlyMap<string, string>) => {
  const value = from.get(name)
  if (value === undefined) {
    throw new Error(`${name} fehlt`)
  }
  return parseColor(value)
}

const slate = (step: string) => colour(`--color-slate-${step}`, theirs)

/** Where text sits. The sheet is slate-900 at 60 % over the page, a hovered row adds 800 at 30 %. */
const SURFACES = {
  page: slate('950'),
  sheet: over(slate('900'), 0.6, slate('950')),
  header: slate('900'),
  hovered: over(slate('800'), 0.3, slate('900')),
}

/** AA for body text. The chrome is 10–12 px, so the large-text allowance of 3 never applies. */
const AA = 4.5

const ROLES = [...ours.keys()].filter((name) => name.startsWith('--color-ink'))

describe('text roles', () => {
  it('are declared', () => {
    expect(ROLES).toStrictEqual([
      '--color-ink-strong',
      '--color-ink',
      '--color-ink-muted',
      '--color-ink-faint',
      '--color-ink-off',
    ])
  })

  const pairs = ROLES.filter((name) => name !== '--color-ink-off').flatMap((role) =>
    Object.entries(SURFACES).map(([surface, ground]) => ({ role, surface, ground })),
  )

  it.each(pairs)('$role holds AA on $surface', ({ role, ground }) => {
    expect(contrast(colour(role, ours), ground)).toBeGreaterThanOrEqual(AA)
  })

  it('keeps disabled visibly apart from the faintest enabled text', () => {
    // Exempt from AA (WCAG 1.4.3, inactive components), but it must still read as "off".
    const off = colour('--color-ink-off', ours)

    expect(contrast(off, colour('--color-ink-faint', ours))).toBeGreaterThanOrEqual(1.5)
  })
})
