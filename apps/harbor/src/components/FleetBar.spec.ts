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

  /**
   * The personal figure is the band tabs plus what only a fleet has, and the header says so:
   * 23 779 above three tabs adding up to 20 767 looked wrong while being right.
   */
  it('works out the personal figure where it is shown', () => {
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
    const title =
      bar
        .findAll('p')
        .find((one) => one.attributes('title')?.includes('deine Punkte'))
        ?.attributes('title') ?? ''

    expect(title.split('\n').map((line) => line.split(':')[0])).toStrictEqual([
      'Arbeit',
      'Breite',
      'Ordnung',
      'Forderungen',
      'deine Punkte',
    ])
    expect(title).toContain('die Summe der Reiter')
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

  /** Picked, not typed: the bar only asks for the dialog, the window opens it. */
  it('asks for the folder dialog', async () => {
    const page = bar()

    await page
      .findAll('button')
      .find((one) => one.text() === 'hinzufügen')
      ?.trigger('click')

    expect(page.emitted('add')).toStrictEqual([[]])
    expect(page.find('input').exists()).toBe(false)
  })

  it('holds the button back while something runs', () => {
    const page = mount(FleetBar, {
      props: {
        ships: [ship()],
        at: '2026-09-30T00:00:00Z',
        source: '/cache',
        canMeasure: true,
        busy: true,
      },
    })

    const add = page.findAll('button').find((one) => one.text() === 'hinzufügen')

    expect(add?.attributes('disabled')).toBeDefined()
  })

  /** Nothing to run, nothing to offer — the same rule the measure button follows. */
  it('offers neither button in a window without a shell', () => {
    const page = mount(FleetBar, {
      props: { ships: [ship()], at: '2026-09-30T00:00:00Z', source: '/cache' },
    })

    expect(page.text()).not.toContain('hinzufügen')
    expect(page.text()).not.toContain('neu messen')
  })
})

describe('while a survey runs', () => {
  const RUNNING = { at: 23, of: 92, path: '/repos/org/ship', running: true, stopped: false }

  /**
   * It said "misst …" for six seconds and froze the window while it did. Now it says how far, on
   * what, and offers the way out — the count from the survey itself, not from the last snapshot.
   */
  it('shows how far it has got and what it is reading', () => {
    const bar = mount(FleetBar, {
      props: {
        ships: [ship()],
        at: AT,
        source: '/cache',
        canMeasure: true,
        busy: true,
        progress: RUNNING,
      },
    })

    expect(bar.text()).toContain('23/92')
    expect(bar.text()).toContain('org/ship')
    expect(bar.text()).not.toContain('neu messen')
  })

  it('offers a way out, and hands the decision up', async () => {
    const bar = mount(FleetBar, {
      props: {
        ships: [ship()],
        at: AT,
        source: '/cache',
        canMeasure: true,
        busy: true,
        progress: RUNNING,
      },
    })

    await bar
      .findAll('button')
      .find((one) => one.text() === 'abbrechen')
      ?.trigger('click')

    expect(bar.emitted('stop')).toStrictEqual([[]])
  })

  /** Before the count arrives there is nought out of nought, and a full bar would be a lie. */
  it('says it is counting before it can say a share', () => {
    const bar = mount(FleetBar, {
      props: {
        ships: [ship()],
        at: AT,
        source: '/cache',
        canMeasure: true,
        busy: true,
        progress: { ...RUNNING, at: 0, of: 0 },
      },
    })

    expect(bar.text()).toContain('zählt')
  })

  /**
   * The header carries one age and it is the fleet's: measuring one repository used to stamp the
   * other ninety-one with a minute they were not read in. When *one* ship was read is her own
   * business and stands on her sheet, beside the button that reads her again.
   */
  it('carries the age of the whole fleet and nothing else', () => {
    const bar = mount(FleetBar, { props: { ships: [ship()], at: AT, source: '/cache' } })

    expect(bar.text()).toContain('vollständig gemessen')
    expect(bar.text()).not.toContain('einzeln')
  })
})
