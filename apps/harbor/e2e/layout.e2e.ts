/**
 * The window keeps its shape at the sizes it is actually opened at.
 *
 * Measured on a Mac on 06.10.2026: the bar wrapped differently there, the roots popup opened past
 * the left edge of the window, and the window scrolled. The fonts are the cause that cannot be
 * reproduced here — SF is wider than what a Linux runner has — so the narrower windows stand in
 * for the wider text: a bar that holds at 1024 px with these fonts holds at 1440 px with those.
 */

import { expect, test } from '@playwright/test'

import { LEUCHTTURM } from './fleet'
import { harbourOnly, opened, pick, reading, stillSheet } from './harbour'
import { ANSWERS, installWindow } from './window'

import type { Page } from '@playwright/test'

/** The window's own default, a 13-inch MacBook's usual window, and a narrow one. */
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 700 },
]

/** Every edge of the element inside the window — not merely its middle, which is what a click needs. */
async function inside(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox()
  const view = page.viewportSize()
  expect(box).not.toBeNull()
  expect(view).not.toBeNull()
  if (box === null || view === null) {
    return
  }
  expect({
    left: box.x >= 0,
    top: box.y >= 0,
    right: box.x + box.width <= view.width,
    bottom: box.y + box.height <= view.height,
  }).toStrictEqual({ left: true, top: true, right: true, bottom: true })
}

/**
 * Nothing is drawn over the element: at a grid of points across it, the topmost element is it or
 * inside it. Inside the window is not the same as visible — the roots popup once sat in the window
 * and under the datasheet's sticky head.
 */
async function onTop(page: Page, selector: string): Promise<void> {
  const covered = await page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect()
    const misses: string[] = []
    for (const fx of [0.05, 0.5, 0.95]) {
      for (const fy of [0.1, 0.5, 0.9]) {
        const x = box.left + box.width * fx
        const y = box.top + box.height * fy
        const top = document.elementFromPoint(x, y)
        if (top === null || !element.contains(top)) {
          misses.push(
            `${String(Math.round(x))},${String(Math.round(y))}: ${top?.tagName ?? 'nichts'}`,
          )
        }
      }
    }
    return misses
  })
  expect(covered).toStrictEqual([])
}

/** How many lines the bar takes. Items within 10 px of each other share one: baselines differ. */
async function barLines(page: Page): Promise<number> {
  const tops = await page
    .locator('header > *')
    .evaluateAll((all) => all.map((one) => one.getBoundingClientRect().top))
  let lines = 0
  let last = Number.NEGATIVE_INFINITY
  for (const top of tops.toSorted((a, b) => a - b)) {
    if (top - last > 10) {
      lines += 1
      last = top
    }
  }
  return lines
}

/**
 * One line where the window allows it, two where it does not — never three.
 *
 * Three was the price of splitting the bar into two groups: a group that no longer fits takes the
 * whole width. Measured with this fleet: one line from about 1500 px, so 1600 holds it with room.
 */
test.describe('Kopfzeile', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await harbourOnly(page, baseURL ?? '')
    await page.addInitScript(installWindow, ANSWERS)
  })

  test('eine Zeile, wo das Fenster breit genug ist', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await opened(page)
    await expect(page.getByRole('button', { name: /Wurzeln \(2\)/ })).toBeVisible()
    expect(await barLines(page)).toBe(1)
  })

  test('höchstens zwei Zeilen im schmalen Fenster', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 })
    await opened(page)
    await expect(page.getByRole('button', { name: /Wurzeln \(2\)/ })).toBeVisible()
    expect(await barLines(page)).toBeLessThanOrEqual(2)
  })
})

for (const size of SIZES) {
  test.describe(`${String(size.width)}×${String(size.height)}`, () => {
    test.use({ viewport: size })

    test.beforeEach(async ({ page, baseURL }) => {
      await harbourOnly(page, baseURL ?? '')
      await page.addInitScript(installWindow, ANSWERS)
      await opened(page)
      await expect(page.getByRole('button', { name: /Wurzeln \(2\)/ })).toBeVisible()
    })

    test('Kopfzeile ganz im Fenster', async ({ page }) => {
      for (const one of await page.locator('header > *').all()) {
        const box = await one.boundingBox()
        expect(box === null || box.x + box.width <= size.width).toBe(true)
      }
      await stillSheet(page)
    })

    test('Wurzeln öffnen sich ins Fenster', async ({ page }) => {
      await page.getByRole('button', { name: /Wurzeln/ }).click()
      await expect(page.locator('#wurzeln')).toBeVisible()
      await inside(page, '#wurzeln')
      await stillSheet(page)
    })

    // With a sheet open, because its sticky head is what covered the popup.
    test('Wurzeln liegen über dem Datenblatt', async ({ page }) => {
      await pick(page, LEUCHTTURM.path)
      await reading(page)
      await page.getByRole('button', { name: /Wurzeln/ }).click()
      await expect(page.locator('#wurzeln')).toBeVisible()
      await onTop(page, '#wurzeln')
    })

    test('Datenblatt scrollt in sich, nicht das Fenster', async ({ page }) => {
      await pick(page, LEUCHTTURM.path)
      await reading(page)
      await stillSheet(page)
    })
  })
}
