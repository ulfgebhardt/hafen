import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'

import BandTabs from './BandTabs.vue'
import { ship } from './testing'

describe('filtering a page', () => {
  /**
   * The counts beside each tab go on counting the whole fleet: a tab that said "Aktiv 2" because
   * somebody typed a letter would answer a different question from the one the tab asks.
   */
  it('hands the query up and leaves the counts alone', async () => {
    const fleet = [ship({ name: 'werft' }), ship({ name: 'hafen', path: '/x/hafen' })]
    const tabs = mount(BandTabs, { props: { band: 'active', ships: fleet } })

    await tabs.find('input').setValue('hafen')

    expect(tabs.emitted('update:query')).toStrictEqual([['hafen']])
    expect(tabs.text()).toContain('2')
  })

  it('lets the filter be dropped again', async () => {
    const tabs = mount(BandTabs, { props: { band: 'active', ships: [ship()], query: 'x' } })

    await tabs
      .findAll('button')
      .find((one) => one.text() === '×')
      ?.trigger('click')

    expect(tabs.emitted('update:query')?.at(-1)).toStrictEqual([''])
  })
})
