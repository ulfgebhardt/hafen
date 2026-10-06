/**
 * What every end-to-end check does to get a window in front of it: the invented fleet, no network,
 * a ship held, and the one layout promise every view keeps.
 */

import { expect } from '@playwright/test'

import { FORGE, LEUCHTTURM, SNAPSHOT } from './fleet'

import type { Page } from '@playwright/test'

/**
 * Nothing leaves the machine, and the fleet is the invented one.
 *
 * Every request that is not to the preview server is aborted: a window that asked somebody else's
 * server while being checked would be doing exactly what `CLAUDE.md` forbids. And the snapshot is
 * answered here rather than read from `dist/` — a `public/snapshot.json` on the machine running
 * this is a real measurement, and it is copied into every build.
 */
export async function harbourOnly(page: Page, baseURL: string): Promise<void> {
  await page.route(
    (url) => !url.href.startsWith(baseURL),
    async (route) => route.abort(),
  )
  await page.route('**/snapshot.json', async (route) => route.fulfill({ json: SNAPSHOT }))
  await page.route('**/forge.json', async (route) => route.fulfill({ json: FORGE }))
}

/** The window has read the snapshot and drawn its bar — the state every check starts from. */
export async function opened(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByText(/gemessen \d/)).toBeVisible()
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
export async function pick(page: Page, path: string): Promise<void> {
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
export async function reading(page: Page): Promise<void> {
  await expect(page.locator('aside h2')).toContainText(`${LEUCHTTURM.org}/${LEUCHTTURM.name}`)
  // Held and not merely hovered: a hover is what the pointer passed on its way, a click decides.
  await expect(page.locator('aside').getByText('festgehalten')).toBeVisible()
}

/**
 * The window itself does not scroll: it is a drawing sheet whose panes scroll on their own.
 *
 * Measured rather than prevented. A hidden screen-reader text placed against the viewport once
 * escaped the sheet's scroller and made the whole page scroll; `overflow: hidden` on the body would
 * only have hidden that, and the content it cut off with it.
 */
export async function stillSheet(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement
    return {
      down: root.scrollHeight - root.clientHeight,
      across: root.scrollWidth - root.clientWidth,
    }
  })
  expect(overflow).toStrictEqual({ down: 0, across: 0 })
}
