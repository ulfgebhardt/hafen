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

import { LEUCHTTURM } from './fleet'
import { harbourOnly, opened, pick, reading, stillSheet } from './harbour'
import { ANSWERS, installWindow } from './window'

import type { Page } from '@playwright/test'

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>

/** WCAG 2.1 A and AA — the level the text roles are written against. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa']

/** Nothing axe objects to, and the window itself does not scroll (`stillSheet`). */
async function judged(page: Page): Promise<void> {
  const results: AxeResults = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const found = results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id}: ${node.target.join(' ')} — ${(node.failureSummary ?? '').replaceAll('\n', ' ')}`,
    ),
  )
  expect(found).toStrictEqual([])
  await stillSheet(page)
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
    await judged(page)
  })

  test('Verträge', async ({ page }) => {
    await page.getByRole('button', { name: /Verträge/ }).click()
    await expect(page.locator('main canvas')).toHaveCount(0)
    await judged(page)
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
    await judged(page)
  })
})
