import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UpdateBanner from './UpdateBanner.vue'

describe('updateBanner', () => {
  /**
   * Beide Fassungen: „Version 1.3.0 verfuegbar" allein laesst offen, ob das ein Sprung oder ein
   * Patch ist — und ob man schon aktuell ist.
   */
  it('nennt die neue Fassung und die laufende', () => {
    const page = mount(UpdateBanner, { props: { version: '1.3.0', current: '1.2.1' } })

    expect(page.text()).toContain('1.3.0')
    expect(page.text()).toContain('1.2.1')
  })

  it('reicht den Wunsch nach oben, statt selbst zu laden', async () => {
    const page = mount(UpdateBanner, { props: { version: '1.3.0', current: '1.2.1' } })

    await page.findAll('button')[0]?.trigger('click')

    expect(page.emitted('install')).toHaveLength(1)
  })

  /** Ein Knopf, der sich zweimal druecken laesst, laedt zweimal. */
  it('bietet waehrend des Ladens nichts zum Druecken an', () => {
    const page = mount(UpdateBanner, { props: { version: '1.3.0', current: '1.2.1', busy: true } })

    expect(page.text()).toContain('wird geladen')
    expect(page.findAll('button')).toHaveLength(1)
  })

  /**
   * Hier wird nicht geschluckt: wer gedrueckt hat, hat etwas erwartet. Ein Knopf, der still
   * nichts tut, ist schlimmer als keiner.
   */
  it('sagt, woran es scheiterte, und bietet es nochmal an', () => {
    const page = mount(UpdateBanner, {
      props: { version: '1.3.0', current: '1.2.1', trouble: 'Signatur passt nicht' },
    })

    expect(page.text()).toContain('Signatur passt nicht')
    expect(page.findAll('button')[0]?.text()).toBe('nochmal')
  })

  /** Wegklickbar, weil ein Hinweis, den man nicht loswird, ein Melder ist. */
  it('laesst sich wegklicken', async () => {
    const page = mount(UpdateBanner, { props: { version: '1.3.0', current: '1.2.1' } })

    await page.findAll('button').at(-1)?.trigger('click')

    expect(page.emitted('dismiss')).toHaveLength(1)
  })
})
