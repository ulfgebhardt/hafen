import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ShipPlan from './ShipPlan.vue'
import { quest, ship } from './testing'

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

  it('marks the chosen box and no other', () => {
    const plan = mount(ShipPlan, {
      props: { ship: subject, chosen: { kind: 'quest' as const, id: 'offen' } },
    })
    const marked = plan.findAll('rect').filter((one) => one.attributes('stroke-width') === '0.45')

    expect(marked).toHaveLength(1)
    expect(marked[0]?.find('title').text()).toContain('offen')
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
