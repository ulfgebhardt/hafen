import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import NoGit from './NoGit.vue'

describe('noGit', () => {
  /**
   * The failure this view exists for: without git every reading comes back empty, and a harbour
   * of nothing looks exactly like a machine with no repositories on it. Two different sentences,
   * and ninety-two silent failures are not a measurement.
   */
  it('says which program is missing and what it costs', () => {
    const page = mount(NoGit, { props: { gh: true, curl: true } })

    expect(page.text()).toContain('git fehlt')
    expect(page.text()).toContain('leere Flotte')
  })

  /** A remedy per platform, because macOS is the first machine this will meet that is not ours. */
  it('gives the remedy for every platform it is built for', () => {
    const page = mount(NoGit, { props: { gh: false, curl: false } })

    for (const where of ['macOS', 'Debian', 'Arch', 'Windows']) {
      expect(page.text()).toContain(where)
    }
  })

  /** Saying what still works is half the answer; "nothing works" is the easier, wronger one. */
  it('names what is still there', () => {
    expect(mount(NoGit, { props: { gh: true, curl: false } }).text()).toContain('gh')
    expect(mount(NoGit, { props: { gh: false, curl: false } }).text()).toContain(
      'Auch gh und curl fehlen',
    )
  })
})
