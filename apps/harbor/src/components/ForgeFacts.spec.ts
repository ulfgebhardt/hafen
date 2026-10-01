import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ForgeFacts from './ForgeFacts.vue'

import type { ForgeStats } from '@hafen/core'

const STATS: ForgeStats = {
  slug: { host: 'github.com', owner: 'Leuchtturm-Verbund', repo: 'Leuchtturm' },
  stars: 1743,
  watchers: 64,
  forks: 210,
  issues: 442,
  pulls: 53,
  language: 'JavaScript',
}

describe('the forge panel in the datasheet', () => {
  /**
   * The two apart, and both visible: GitHub's REST `open_issues_count` would report 495 here, and
   * a figure that is sometimes the sum of two things is worse than no figure.
   */
  it('shows issues and pull requests as two numbers', () => {
    const panel = mount(ForgeFacts, { props: { stats: STATS } })

    expect(panel.text()).toContain('442')
    expect(panel.text()).toContain('53')
    expect(panel.text()).not.toContain('495')
  })

  /**
   * Its own age beside its own figures. The survey is six seconds of disk and this is seventeen of
   * network, so one timestamp for both would carry the older reading under the younger time.
   */
  it('says when it asked, and says nothing rather than now', () => {
    const asked = mount(ForgeFacts, { props: { stats: STATS, at: '2026-09-30T08:00:00Z' } })

    expect(asked.text()).toContain('gefragt')

    expect(mount(ForgeFacts, { props: { stats: STATS } }).text()).not.toContain('gefragt')
  })

  /** Every figure is a way to the page it came from — nothing here is a number to take on faith. */
  it('asks for the page each figure was read from', async () => {
    const panel = mount(ForgeFacts, { props: { stats: STATS } })
    const base = 'https://github.com/Leuchtturm-Verbund/Leuchtturm'

    await panel
      .findAll('button')
      .find((one) => one.text().includes('Issues'))
      ?.trigger('click')

    expect(panel.emitted('open')).toStrictEqual([[`${base}/issues`]])

    await panel
      .findAll('button')
      .find((one) => one.text().includes('Leuchtturm-Verbund/'))
      ?.trigger('click')

    expect(panel.emitted('open')?.[1]).toStrictEqual([base])
  })

  /** A language the forge could not name is left out, not drawn as an empty word. */
  it('leaves out a language the forge did not name', () => {
    const panel = mount(ForgeFacts, { props: { stats: { ...STATS, language: null } } })

    expect(panel.text()).not.toContain('JavaScript')
    expect(panel.text()).toContain('Sterne')
  })
})

describe('what is open, drawn', () => {
  /** An amount before the eye reaches the number — the same promise the crates on a hull make. */
  it('draws a capped row of marks and keeps the true count beside it', () => {
    const panel = mount(ForgeFacts, { props: { stats: STATS } })
    const marks = panel.findAll('li')[0]?.findAll('span.inline-block') ?? []

    expect(marks).toHaveLength(12)
    expect(panel.findAll('li')[0]?.text()).toContain('+')
    expect(panel.findAll('li')[0]?.text()).toContain('442')
  })

  it('draws one mark per request where they fit', () => {
    const panel = mount(ForgeFacts, { props: { stats: { ...STATS, pulls: 3 } } })
    const row = panel.findAll('li')[1]

    expect(row?.findAll('span.inline-block')).toHaveLength(3)
    expect(row?.text()).not.toContain('+')
  })

  /** Nothing open is an answer, and it must not look like a row that was never drawn. */
  it('says so where nothing is open at all', () => {
    const panel = mount(ForgeFacts, { props: { stats: { ...STATS, issues: 0 } } })

    expect(panel.findAll('li')[0]?.text()).toContain('keine')
  })
})
