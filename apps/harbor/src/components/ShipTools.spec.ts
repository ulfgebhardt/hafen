import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ShipTools from './ShipTools.vue'
import { ship } from './testing'

const current = { name: 'main', upstream: 'origin/main', gone: false, merged: true, current: true }

const branches = [
  current,
  { name: 'feat/gone', upstream: 'origin/feat/gone', gone: true, merged: false, current: false },
  { name: 'feat/merged', upstream: null, gone: false, merged: true, current: false },
]

describe('shipTools', () => {
  /** A button for a tool nobody installed is a button that fails in the click. */
  it('draws only what this machine can run', () => {
    const tools = mount(ShipTools, {
      props: { ship: ship(), available: ['lazygit', 'prune'] },
    })
    const labels = tools.findAll('button').map((one) => one.text())

    expect(labels).toStrictEqual(['lazygit', 'Remote aufräumen'])
  })

  it('shows nothing at all where there is nothing to offer', () => {
    const tools = mount(ShipTools, { props: { ship: ship() } })

    expect(tools.find('section').exists()).toBe(false)
  })

  it('hands the tool up rather than starting it itself', async () => {
    const tools = mount(ShipTools, { props: { ship: ship(), available: ['lazygit'] } })

    await tools.find('button').trigger('click')

    expect(tools.emitted('tool')).toStrictEqual([['lazygit']])
  })

  /**
   * The branch list is a measurement first: every name carries why it is offered, and the command
   * to type stands under it. The button is a convenience on top, never a substitute.
   */
  it('lists the branches git would let go, with the reason for each', () => {
    const tools = mount(ShipTools, { props: { ship: ship({ branches }) } })

    expect(tools.text()).toContain('der Remote hat diesen Branch nicht mehr')
    expect(tools.text()).toContain('bereits in diesem Branch enthalten')
    // Never the one checked out: git will not delete it either.
    expect(tools.text()).not.toContain('main')
  })

  /** The command to type stands under the list; the button beside each name is on top of it. */
  it('writes the command out for the whole set', () => {
    const tools = mount(ShipTools, { props: { ship: ship({ branches }) } })

    expect(tools.find('code').text()).toBe('git branch -d feat/gone feat/merged')
  })

  /** One at a time: forty branches deleted by one click is forty decisions nobody made. */
  it('offers one branch per click and names which', async () => {
    const tools = mount(ShipTools, { props: { ship: ship({ branches }) } })

    await tools.findAll('button')[0]?.trigger('click')

    expect(tools.emitted('prune')).toStrictEqual([['feat/gone']])
  })

  it('says nothing about branches in a tidy repository', () => {
    const tools = mount(ShipTools, {
      props: { ship: ship({ branches: [current] }), available: ['shell'] },
    })

    expect(tools.text()).not.toContain('könnten weg')
    expect(tools.find('code').exists()).toBe(false)
  })
})
