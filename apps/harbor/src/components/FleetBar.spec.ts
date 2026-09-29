import { NO_WORK } from '@hafen/core'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FleetBar from './FleetBar.vue'
import { quest, ship } from './testing'

const AT = '2026-09-29T21:42:18.126Z'
const SOURCE = '/cache/hafen/snapshot.json'

describe('fleetBar', () => {
  it('counts the fleet and every verdict in it', () => {
    const bar = mount(FleetBar, {
      props: {
        at: AT,
        source: SOURCE,
        ships: [
          ship({ quests: [quest('a', 'violated'), quest('b', 'met')] }),
          ship({ quests: [quest('a', 'met')] }),
        ],
      },
    })

    expect(bar.text()).toContain('2 Schiffe')
    expect(bar.text()).toContain('verletzt')
    expect(bar.text()).toContain('erfüllt')
  })

  /** Bound, not "has quests": a ship every demand skips is not part of this question. */
  it('counts only the ships something actually binds', () => {
    const bar = mount(FleetBar, {
      props: {
        at: AT,
        source: SOURCE,
        ships: [
          ship({ quests: [quest('a', 'met')] }),
          ship({ quests: [quest('a', 'notApplicable')] }),
          ship(),
        ],
      },
    })

    expect(bar.text()).toContain('1 gebunden')
  })

  /**
   * The app reads a snapshot and measures nothing, so the picture is exactly as old as the last
   * `schnappschuss`. A view without its timestamp claims to be current.
   */
  it('says when the measurement was taken', () => {
    const bar = mount(FleetBar, { props: { at: AT, source: SOURCE, ships: [ship()] } })

    expect(bar.text()).toContain('gemessen')
    expect(bar.text()).toContain('2026')
  })

  /**
   * Side by side and never added: a project total describes the repositories, the personal one
   * describes what this person did with them.
   */
  it('shows the fleet score and the personal one apart', () => {
    const bar = mount(FleetBar, {
      props: {
        at: AT,
        source: SOURCE,
        ships: [
          ship({
            rustDays: 2,
            ledger: {
              total: { ...NO_WORK, commits: 10, byKind: { feat: 10 } },
              own: { ...NO_WORK, commits: 2, byKind: { feat: 2 } },
            },
          }),
        ],
      },
    })

    expect(bar.text()).toContain('Flotte')
    expect(bar.text()).toContain('30')
    expect(bar.text()).toContain('du')
  })

  it('draws an empty harbor without falling over', () => {
    const bar = mount(FleetBar, { props: { at: AT, source: SOURCE, ships: [] } })

    expect(bar.text()).toContain('0 Schiffe')
  })
})
