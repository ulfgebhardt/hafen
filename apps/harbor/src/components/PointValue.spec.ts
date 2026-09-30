import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PointValue from './PointValue.vue'

describe('pointValue', () => {
  /**
   * Two scores written the same way is how a reader ends up adding numbers that must not be
   * added — so the marks differ wherever both appear.
   */
  it('marks the two scores differently', () => {
    const both = mount(PointValue, { props: { project: 10, personal: 5 } })

    expect(both.text()).toContain('◆')
    expect(both.text()).toContain('●')
  })

  /** `+0 Projekt` beside a task is noise that hides the number that matters. */
  it('writes nothing at all for a zero', () => {
    const only = mount(PointValue, { props: { project: 0, personal: 7 } })

    expect(only.text()).not.toContain('◆')
    expect(only.text()).toContain('7')
  })

  it('signs a value only where it is something that would be added', () => {
    expect(mount(PointValue, { props: { personal: 3, signed: true } }).text()).toContain('+3')
    expect(mount(PointValue, { props: { personal: 3 } }).text()).not.toContain('+')
  })

  it('groups a large number so it can be read', () => {
    expect(mount(PointValue, { props: { project: 151703 } }).text()).toContain('151.703')
  })
})
