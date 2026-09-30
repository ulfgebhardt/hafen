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

    // The marks carry the distinction, and the labels say which is which for everything that
    // cannot see them.
    expect(bar.text()).toContain('◆')
    expect(bar.text()).toContain('●')
    expect(bar.html()).toContain('Projektpunkte')
    expect(bar.html()).toContain('deine Punkte')
  })

  it('draws an empty harbor without falling over', () => {
    const bar = mount(FleetBar, { props: { at: AT, source: SOURCE, ships: [] } })

    expect(bar.text()).toContain('0 Schiffe')
  })
})

describe('taking a directory on', () => {
  const bar = () =>
    mount(FleetBar, {
      props: { ships: [ship()], at: '2026-09-30T00:00:00Z', source: '/cache', canMeasure: true },
    })

  /**
   * Closed until asked for. It is the rarest action in the window, and a permanent input beside
   * the fleet's figures reads as something to fill in.
   */
  it('keeps the field away until somebody asks for it', async () => {
    const page = bar()

    expect(page.find('input').exists()).toBe(false)

    await page
      .findAll('button')
      .find((one) => one.text() === 'aufnehmen')
      ?.trigger('click')

    expect(page.find('input').exists()).toBe(true)
  })

  it('hands the path up and puts itself away again', async () => {
    const page = bar()
    await page
      .findAll('button')
      .find((one) => one.text() === 'aufnehmen')
      ?.trigger('click')
    await page.find('input').setValue('  /anderswo/ding  ')
    await page
      .findAll('button')
      .find((one) => one.text() === 'ok')
      ?.trigger('click')

    expect(page.emitted('enlist')).toStrictEqual([['/anderswo/ding']])
    expect(page.find('input').exists()).toBe(false)
  })

  /** An empty field is not a path, and adopting "" would put a line in the register nobody meant. */
  it('does nothing for an empty path', async () => {
    const page = bar()
    await page
      .findAll('button')
      .find((one) => one.text() === 'aufnehmen')
      ?.trigger('click')
    await page
      .findAll('button')
      .find((one) => one.text() === 'ok')
      ?.trigger('click')

    expect(page.emitted('enlist')).toBeUndefined()
  })

  /** Nothing to run, nothing to offer — the same rule the measure button follows. */
  it('offers neither button in a window without a shell', () => {
    const page = mount(FleetBar, {
      props: { ships: [ship()], at: '2026-09-30T00:00:00Z', source: '/cache' },
    })

    expect(page.text()).not.toContain('aufnehmen')
    expect(page.text()).not.toContain('neu messen')
  })
})
