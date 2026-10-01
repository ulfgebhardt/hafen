import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'

import BandTabs from './BandTabs.vue'
import { ship } from './testing'

describe('filtering a page', () => {
  /**
   * It hands the query up and counts whatever it is given back. Filtering happens above it, so the
   * counts and the points beside each tab describe what is actually on screen.
   */
  it('hands the query up and counts what it was handed', async () => {
    const hafen = ship({ name: 'hafen', path: '/x/hafen' })
    const fleet = [ship({ name: 'werft' }), hafen]
    const tabs = mount(BandTabs, { props: { page: 'active', view: 'dock', ships: fleet } })

    await tabs.find('input').setValue('hafen')

    expect(tabs.emitted('update:query')).toStrictEqual([['hafen']])

    await tabs.setProps({ ships: [hafen] })

    expect(tabs.text()).toContain('Aktiv1')
  })

  it('lets the filter be dropped again', async () => {
    const tabs = mount(BandTabs, {
      props: { page: 'active', view: 'dock', ships: [ship()], query: 'x' },
    })

    await tabs
      .findAll('button')
      .find((one) => one.text() === '×')
      ?.trigger('click')

    expect(tabs.emitted('update:query')?.at(-1)).toStrictEqual([''])
  })
})

describe('the two questions the bar offers pages for', () => {
  /**
   * The question first, the page second. Eight figures and five tabs on one line was a bar nobody
   * could aim at — and the switch itself carries no figures, because it is not a page.
   */
  it('offers the bands in the dock view', () => {
    const dock = mount(BandTabs, { props: { page: 'active', view: 'dock', ships: [ship()] } })

    expect(dock.text()).toContain('Aktiv')
    expect(dock.text()).toContain('Verträge')
    expect(dock.text()).not.toContain('Flotte 1')
  })

  it('offers the whole fleet in the other, and the catalog in both', () => {
    const fleet = mount(BandTabs, { props: { page: 'fleet', view: 'fleet', ships: [ship()] } })

    expect(fleet.text()).toContain('Flotte')
    expect(fleet.text()).toContain('Verträge')
    expect(fleet.text()).not.toContain('Ruhend')
  })

  /** Pressing one only asks: which page that lands on is the parent's to decide. */
  it('asks for a view rather than setting a page', async () => {
    const tabs = mount(BandTabs, { props: { page: 'active', view: 'dock', ships: [ship()] } })

    await tabs
      .findAll('button')
      .find((one) => one.attributes('title')?.startsWith('Flotte'))
      ?.trigger('click')

    expect(tabs.emitted('view')).toStrictEqual([['fleet']])
    expect(tabs.emitted('update:page')).toBeUndefined()
  })

  /** One of the two is always down, so the bar says which question it is answering. */
  it('marks the view it is showing', () => {
    const tabs = mount(BandTabs, { props: { page: 'fleet', view: 'fleet', ships: [ship()] } })
    const pressed = tabs
      .findAll('button')
      .filter((one) => one.attributes('aria-pressed') === 'true')

    expect(pressed).toHaveLength(1)
    expect(pressed[0]?.attributes('title')).toContain('Flotte')
  })
})
