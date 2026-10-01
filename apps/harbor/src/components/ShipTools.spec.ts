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
    expect(tools.text()).toContain('bereits in main enthalten')
    // Never the one checked out: git will not delete it either, so only the two others are listed.
    expect(tools.text()).toContain('2 könnten weg')
  })

  /**
   * One line per row and never one for the set: a single `git branch -d a b c` under the list read
   * as what the buttons beside each name would do, so a button that takes one branch looked like
   * it would take all of them.
   */
  it('writes out the command each button runs, on its own row', () => {
    const tools = mount(ShipTools, { props: { ship: ship({ branches }) } })

    expect(tools.findAll('code').map((one) => one.text())).toStrictEqual([
      'git branch -d feat/gone',
      'git branch -d feat/merged',
    ])
  })

  /** One at a time: forty branches deleted by one click is forty decisions nobody made. */
  it('offers one branch per click and names which', async () => {
    const tools = mount(ShipTools, { props: { ship: ship({ branches }) } })

    await tools
      .findAll('button')
      .find((one) => one.text() === 'löschen')
      ?.trigger('click')

    expect(tools.emitted('prune')).toStrictEqual([['feat/gone']])
  })

  it('says nothing about branches in a tidy repository', () => {
    const tools = mount(ShipTools, {
      props: { ship: ship({ branches: [current] }), available: ['shell'] },
    })

    expect(tools.text()).not.toContain('könnten weg')
    expect(tools.findAll('code')).toHaveLength(0)
  })
})

describe('the boats she carries', () => {
  const tenders = [
    { path: 'lib/bootstrap3', state: 'aboard' as const, at: '9a78818a' },
    { path: 'api', state: 'adrift' as const, at: '5b2c04ca' },
    { path: 'inspector', state: 'missing' as const, at: '2451664c' },
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

describe('what containment was measured against', () => {
  /**
   * A verdict without the thing it was compared to is one a reader has to take on faith — and this
   * one used to compare against `HEAD`, which on a feature branch is the wrong question entirely.
   */
  it('names the branch a merged one was compared to', () => {
    const tools = mount(ShipTools, {
      props: { ship: ship({ branches, defaultBranch: 'master' }) },
    })

    expect(tools.text()).toContain('verglichen mit')
    expect(tools.text()).toContain('bereits in master enthalten')
  })

  /** Unmeasurable is not deletable: with no leading branch, only what the remote dropped is left. */
  it('says so where no leading branch could be found', () => {
    const tools = mount(ShipTools, {
      props: {
        ship: ship({
          defaultBranch: null,
          branches: branches.map((one) => ({ ...one, merged: false })),
        }),
      },
    })

    expect(tools.text()).toContain('Kein Default-Branch')
    expect(tools.text()).not.toContain('feat/merged')
  })
})
