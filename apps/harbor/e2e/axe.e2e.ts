/**
 * axe against the rendered window: what `style.spec.ts` computes, measured where it is drawn.
 *
 * The unit spec proves the *roles* reach WCAG AA on the page background. It cannot see a role laid
 * over a lighter panel, a colour that never went through a role, or an opacity on a parent — and
 * those are the ways a contrast promise breaks in practice. This reads the computed colours of the
 * built window in Chromium, so it can.
 *
 * The harbour itself is a Pixi canvas and axe judges nothing inside one. It stays in the scan
 * anyway: a canvas without text content is not a finding, and excluding it would only hide one if
 * it ever became one.
 */

import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { FORGE, LEUCHTTURM, SNAPSHOT } from './fleet'
import { ANSWERS, installWindow } from './window'

import type { Page } from '@playwright/test'

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>

/** WCAG 2.1 A and AA — the level the text roles are written against. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa']

/**
 * A finding that is known, open, and waits on a decision this check cannot make.
 *
 * Both are coloured text, and the fix is a colour: mapping either to an `ink-*` role would drop
 * the meaning the colour carries (yours, a warning), and inventing a lighter shade is a design
 * call, not a test's. So they are named here, each by rule **and** class — never a whole rule off
 * and never an element excluded from every rule — and each is *required* to still occur: the day
 * one is fixed, its check goes red and asks for the line to be deleted. A list that only ever
 * grows is a list nobody reads.
 */
interface Open {
  rule: string
  /** A class the offending element carries, as it stands in its template. */
  token: string
  why: string
}

/** ShipSheet, the bill's column head: `#004f3b` on `#0a1023`, 1.96:1 at 11 px against 4.5:1. */
const DEINE_HEAD: Open = {
  rule: 'color-contrast',
  token: 'text-emerald-900',
  why: 'Kopf der Spalte "deine" in der Punkteabrechnung — gedämpftes Grün, braucht eine Farbentscheidung',
}

/** ContractList, a demand that answers nothing: `#b55c05` on `#020618`, 4.31:1 at 11 px. */
const SILENT_NOTE: Open = {
  rule: 'color-contrast',
  token: 'text-amber-600/80',
  why: 'Hinweis "kein Urteil auf dieser Flotte" — Warnfarbe mit Deckkraft, braucht eine Farbentscheidung',
}

interface Scan {
  /** Everything axe found that is not on the open list — the gate. */
  found: readonly string[]
  /** Which of the expected open findings did occur. */
  open: readonly Open[]
}

async function scan(page: Page, expected: readonly Open[] = []): Promise<Scan> {
  const results: AxeResults = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const found: string[] = []
  const open = new Set<Open>()
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      const known = expected.find(
        (one) => one.rule === violation.id && node.html.includes(one.token),
      )
      if (known === undefined) {
        const said = (node.failureSummary ?? '').replaceAll('\n', ' ')
        found.push(`${violation.id}: ${node.target.join(' ')} — ${said}`)
      } else {
        open.add(known)
      }
    }
  }
  return { found, open: expected.filter((one) => open.has(one)) }
}

/** Nothing new, and every open finding still where it was said to be. */
async function judged(page: Page, expected: readonly Open[] = []): Promise<void> {
  const { found, open } = await scan(page, expected)
  expect(found).toStrictEqual([])
  expect(open).toStrictEqual(expected)
}

/**
 * Nothing leaves the machine, and the fleet is the invented one.
 *
 * Every request that is not to the preview server is aborted: a window that asked somebody else's
 * server while being checked would be doing exactly what `CLAUDE.md` forbids. And the snapshot is
 * answered here rather than read from `dist/` — a `public/snapshot.json` on the machine running
 * this is a real measurement, and it is copied into every build.
 */
async function harbourOnly(page: Page, baseURL: string): Promise<void> {
  await page.route(
    (url) => !url.href.startsWith(baseURL),
    async (route) => route.abort(),
  )
  await page.route('**/snapshot.json', async (route) => route.fulfill({ json: SNAPSHOT }))
  await page.route('**/forge.json', async (route) => route.fulfill({ json: FORGE }))
}

/** The window has read the snapshot and drawn its bar — the state every check starts from. */
async function opened(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByText(/vollständig gemessen/)).toBeVisible()
  await expect(page.locator('main canvas')).toBeVisible()
}

/**
 * Clicks a ship, where the drawing itself says she is.
 *
 * The harbour has no path to a ship that is not the canvas — no list, no key, no address — so the
 * click has to land on it. The position is asked of the scene (`where`, the same call a page switch
 * uses to keep her in place) rather than guessed: a guessed pixel is right until the next layout
 * change and then clicks water. Polled, because the scene is built after an `await` on Pixi's
 * renderer and has no position for anybody before that.
 */
async function pick(page: Page, path: string): Promise<void> {
  const spot = async (): Promise<{ x: number; y: number } | null> =>
    page.evaluate((wanted) => {
      interface Hold {
        x: number
        y: number
      }
      interface Instance {
        exposed: { where?: (ship: { path: string }) => Hold | null } | null
        subTree: VNode
      }
      interface VNode {
        component: Instance | null
        children: unknown
      }
      // Vue keeps the root vnode on the container in every build; `exposed` is what
      // `defineExpose` handed out, so this reads the component's public face and nothing private.
      const find = (node: VNode | null | undefined): Hold | null => {
        if (node === null || node === undefined) {
          return null
        }
        const where = node.component?.exposed?.where
        if (where !== undefined) {
          return where({ path: wanted })
        }
        if (node.component !== null) {
          return find(node.component.subTree)
        }
        if (!Array.isArray(node.children)) {
          return null
        }
        for (const child of node.children as VNode[]) {
          const found = find(child)
          if (found !== null) {
            return found
          }
        }
        return null
      }
      const root = document.querySelector<Element & { _vnode?: VNode }>('#app')
      return find(root?._vnode)
    }, path)

  await expect.poll(spot).not.toBeNull()
  const at = await spot()
  const canvas = await page.locator('main canvas').boundingBox()
  if (at === null || canvas === null) {
    throw new Error(`${path} steht nicht im Hafen`)
  }
  await page.mouse.click(canvas.x + at.x, canvas.y + at.y)
}

/** The datasheet is pinned to her: name in the heading, and the sheet says it is held. */
async function reading(page: Page): Promise<void> {
  await expect(page.locator('aside h2')).toContainText(`${LEUCHTTURM.org}/${LEUCHTTURM.name}`)
  // Held and not merely hovered: a hover is what the pointer passed on its way, a click decides.
  await expect(page.locator('aside').getByText('festgehalten')).toBeVisible()
}

test.describe('im Browser', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await harbourOnly(page, baseURL ?? '')
    await opened(page)
  })

  test('Hafen mit Flottenleiste', async ({ page }) => {
    await judged(page)
  })

  test('Datenblatt eines Schiffs', async ({ page }) => {
    await pick(page, LEUCHTTURM.path)
    await reading(page)
    await judged(page, [DEINE_HEAD])
  })

  test('Verträge', async ({ page }) => {
    await page.getByRole('button', { name: /Verträge/ }).click()
    await expect(page.locator('main canvas')).toHaveCount(0)
    await judged(page, [SILENT_NOTE])
  })
})

/**
 * What only the desktop window shows: the roots in the bar and the buttons on a datasheet. See
 * `window.ts` for the Rust half that answers, and for why it answers nothing that writes.
 */
test.describe('im Fenster', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await harbourOnly(page, baseURL ?? '')
    await page.addInitScript(installWindow, ANSWERS)
    await opened(page)
    // The roots are read after the picture, so the button is there before its count is.
    await expect(page.getByRole('button', { name: /Wurzeln \(2\)/ })).toBeVisible()
  })

  test('Wurzeln aufgeklappt', async ({ page }) => {
    await page.getByRole('button', { name: /Wurzeln/ }).click()
    await expect(page.getByText('nicht gefunden')).toBeVisible()
    await judged(page)
  })

  test('Datenblatt mit Werkzeugen', async ({ page }) => {
    await pick(page, LEUCHTTURM.path)
    await reading(page)
    await judged(page, [DEINE_HEAD])
  })
})
