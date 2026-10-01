import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ShipPlan from './ShipPlan.vue'
import { quest, ship } from './testing'

import type { ForgeStats } from '@hafen/core'

/** Only the two counts the heaps read; the rest of a forge reading is not drawn. */
const forge = (issues: number, pulls: number): ForgeStats => ({
  slug: { host: 'github.com', owner: 'o', repo: 'r' },
  stars: 0,
  watchers: 0,
  forks: 0,
  issues,
  pulls,
  language: null,
  guard: null,
})

const subject = ship({
  quests: [quest('erfuellt', 'met'), quest('offen', 'violated'), quest('wartet', 'waiting')],
})

describe('shipPlan', () => {
  /**
   * The same shapes the harbour strokes, from the same functions. A panel that drew a ship of its
   * own would be a second opinion about what this repository looks like.
   */
  it('draws a box per binding demand, aboard or ashore', () => {
    const plan = mount(ShipPlan, { props: { ship: subject } })
    const boxes = plan.findAll('rect').filter((one) => one.find('title').exists())

    expect(boxes.length).toBeGreaterThanOrEqual(3)
    expect(plan.text()).toContain('erfuellt')
    expect(plan.text()).toContain('offen')
  })

  /** SVG and not a canvas, and this is what that buys: every box is a real, clickable element. */
  it('hands up the demand whose box was clicked', async () => {
    const plan = mount(ShipPlan, { props: { ship: subject } })
    const box = plan
      .findAll('rect')
      .find((one) => one.find('title').exists() && one.find('title').text().startsWith('offen'))

    await box?.trigger('click')

    expect(plan.emitted('pick')).toStrictEqual([[{ kind: 'quest', id: 'offen' }]])
  })

  /** A click on open water clears the choice — the same answer the harbour gives. */
  it('clears the choice on a click that hit no box', async () => {
    const plan = mount(ShipPlan, { props: { ship: subject } })

    await plan.find('svg').trigger('click')

    expect(plan.emitted('pick')).toStrictEqual([[null]])
  })

  /**
   * A ring of its own and not a thicker border: a stroke is centred on the edge, so thickening it
   * ate a third of a box and the corners came out as blunt wedges.
   */
  it('rings the chosen box, once, and lets the click through to it', () => {
    const plan = mount(ShipPlan, {
      props: { ship: subject, chosen: { kind: 'quest' as const, id: 'offen' } },
    })
    const rings = plan.findAll('rect').filter((one) => one.attributes('fill') === 'none')

    expect(rings).toHaveLength(1)
    expect(rings[0]?.classes()).toContain('pointer-events-none')
  })

  it('rings nothing when nothing is chosen', () => {
    const plan = mount(ShipPlan, { props: { ship: subject } })

    expect(plan.findAll('rect').filter((one) => one.attributes('fill') === 'none')).toHaveLength(0)
  })

  /** The ring stands *around* the box, so the box keeps its own shape and size. */
  it('draws the ring outside the box it marks', () => {
    const plan = mount(ShipPlan, {
      props: { ship: subject, chosen: { kind: 'quest' as const, id: 'offen' } },
    })
    const box = plan
      .findAll('rect')
      .find((one) => one.find('title').exists() && one.find('title').text().startsWith('offen'))
    const ring = plan.findAll('rect').find((one) => one.attributes('fill') === 'none')

    expect(Number(ring?.attributes('width'))).toBeGreaterThan(Number(box?.attributes('width')))
    expect(Number(ring?.attributes('x'))).toBeLessThan(Number(box?.attributes('x')))
  })

  /**
   * The heaps were measured, drawn in the harbour and missing here, so clicking a crate of open
   * issues in the harbour led to a panel that did not show one.
   */
  it('draws what the forge has open, and hands it up when a heap is clicked', async () => {
    const plan = mount(ShipPlan, { props: { ship: subject, stats: forge(300, 2) } })
    const heaps = plan
      .findAll('rect')
      .filter((one) => one.find('title').exists() && one.find('title').text().includes('Offene'))

    expect(heaps.length).toBeGreaterThanOrEqual(6)

    const issue = heaps.find((one) => one.find('title').text().includes('Issues'))
    await issue?.trigger('click')

    expect(plan.emitted('pick')).toStrictEqual([[{ kind: 'forge', open: 'issue' }]])
  })

  /** Unasked is not "none open": a forge nobody questioned heaps nothing at all. */
  it('heaps nothing where the forge was not asked', () => {
    const plan = mount(ShipPlan, { props: { ship: subject } })

    expect(plan.findAll('title').filter((one) => one.text().includes('Offene'))).toHaveLength(0)
  })

  /**
   * The plank is her remote and not her tidiness — a repository nobody can reach from anywhere
   * else has no way aboard, however clean or dirty her tree happens to be.
   */
  it('draws the plank for a ship with a remote and leaves it off one without', () => {
    const planks = (one: ReturnType<typeof mount>) =>
      one.findAll('line').filter((line) => line.attributes('stroke-width') === '3')

    const moored = mount(ShipPlan, {
      props: {
        ship: ship({
          remotes: [{ name: 'origin', url: 'git@github.com:o/r.git', forge: 'github' }],
        }),
      },
    })
    const adrift = mount(ShipPlan, {
      props: { ship: ship({ remotes: [], stash: 4, dirty: true }) },
    })

    expect(planks(moored).length).toBeGreaterThan(0)
    expect(planks(adrift)).toHaveLength(0)
  })

  /** A ship nothing is demanded of still has a hull, and the frame still holds it. */
  it('draws a ship that owes nothing without collapsing', () => {
    const plan = mount(ShipPlan, { props: { ship: ship() } })
    const view = plan.find('svg').attributes('viewBox')?.split(' ').map(Number) ?? []

    expect(plan.find('polygon').exists()).toBe(true)
    expect(view[2]).toBeGreaterThan(0)
    expect(view[3]).toBeGreaterThan(0)
  })
})
