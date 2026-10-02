import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FirstRun from './FirstRun.vue'

describe('firstRun', () => {
  /**
   * An empty harbour and an unasked machine look alike, and only one of them has a remedy. A
   * drawing of nothing beside a bar saying "0 Schiffe" is a tool that appears broken while being
   * correct.
   */
  it('says why it is empty and what would fill it', () => {
    const page = mount(FirstRun, { props: { store: '/store' } })

    expect(page.text()).toContain('Der Hafen ist noch leer')
    expect(page.text()).toContain('raten')
  })

  /** Where the answer goes, before it is given: a setting somebody can read beats a black box. */
  it('names the file the answer lands in', () => {
    const page = mount(FirstRun, { props: { store: '/wohin' } })

    expect(page.text()).toContain('/wohin/register.md')
    expect(page.text()).toContain('$HAFEN_ROOT')
  })

  it('asks the window to open the picker rather than opening one itself', async () => {
    const page = mount(FirstRun, { props: { store: '/store' } })

    await page.find('button').trigger('click')

    expect(page.emitted('choose')).toHaveLength(1)
  })

  /** A measurement is running: the button says so and cannot be pressed twice. */
  it('does not let the question be asked twice at once', () => {
    const page = mount(FirstRun, { props: { store: '/store', busy: true } })

    expect(page.find('button').attributes('disabled')).toBeDefined()
    expect(page.text()).toContain('misst')
  })
})
