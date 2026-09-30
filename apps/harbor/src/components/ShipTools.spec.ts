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

describe('the boats she carries', () => {
  const tenders = [
    { path: 'lib/bootstrap3', state: 'aboard' as const, at: '1a2b3c4d' },
    { path: 'api', state: 'adrift' as const, at: '2b3c4d5e' },
    { path: 'inspector', state: 'missing' as const, at: '3c4d5e6f' },
  ]

  /**
   * Listed whole and not only the strays: a Beiboot is a fact about the ship worth seeing, and a
   * list that appeared only when something was broken would teach nobody that they exist.
   */
  it('lists every carried repository with what is wrong with it', () => {
    const tools = mount(ShipTools, { props: { ship: ship({ submodules: tenders }) } })

    expect(tools.text()).toContain('3 mitgeführt')
    expect(tools.text()).toContain('2 nicht an Bord')
    expect(tools.text()).toContain('nie ausgecheckt')
  })

  it('offers the command for the ones that are not where they should be', () => {
    const tools = mount(ShipTools, { props: { ship: ship({ submodules: tenders }) } })

    expect(tools.find('code').text()).toBe('git submodule update --init api inspector')
  })

  it('says nothing about boats where none are carried', () => {
    const tools = mount(ShipTools, { props: { ship: ship(), available: ['shell'] } })

    expect(tools.text()).not.toContain('mitgeführt')
  })
})
