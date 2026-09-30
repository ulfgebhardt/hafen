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
    const tabs = mount(BandTabs, { props: { page: 'active', ships: fleet } })

    await tabs.find('input').setValue('hafen')

    expect(tabs.emitted('update:query')).toStrictEqual([['hafen']])

    await tabs.setProps({ ships: [hafen] })

    expect(tabs.text()).toContain('Aktiv1')
  })

  it('lets the filter be dropped again', async () => {
    const tabs = mount(BandTabs, { props: { page: 'active', ships: [ship()], query: 'x' } })

    await tabs
      .findAll('button')
      .find((one) => one.text() === '×')
      ?.trigger('click')

    expect(tabs.emitted('update:query')?.at(-1)).toStrictEqual([''])
  })
})
