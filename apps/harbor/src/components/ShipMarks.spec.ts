import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ShipMarks from './ShipMarks.vue'
import { ship } from './testing'

const busy = ship({
  stash: 2,
  ahead: 3,
  dirty: true,
  working: { staged: 1, unstaged: 0, untracked: 200, conflicted: 0 },
})

describe('shipMarks', () => {
  /**
   * The counterpart every drawn mark needed. A crate on the planking used to answer "this ship",
   * which the sheet had already said before anybody clicked.
   */
  it('names every kind the harbour draws on her', () => {
    const marks = mount(ShipMarks, { props: { ship: busy } })

    expect(marks.text()).toContain('vorgemerkt')
    expect(marks.text()).toContain('unverzeichnet')
    expect(marks.text()).toContain('Stash')
    expect(marks.text()).toContain('nicht gepusht')
  })

  /**
   * The honest count and not the drawn one: the harbour draws at most four of a kind because two
   * hundred untracked files would bury the ship, and a panel that repeated the cap would make the
   * cap look like the measurement.
   */
  it('writes the measured count, not the one that fitted', () => {
    const marks = mount(ShipMarks, { props: { ship: busy } })

    expect(marks.text()).toContain('200')
  })

  it('says nothing at all about a repository in good order', () => {
    expect(
      mount(ShipMarks, { props: { ship: ship() } })
        .find('section')
        .exists(),
    ).toBe(false)
  })

  it('hands a chosen kind up, and lets go when it was already chosen', async () => {
    const marks = mount(ShipMarks, { props: { ship: busy } })
    const row = marks.findAll('button').find((one) => one.text().includes('Stash'))

    await row?.trigger('click')

    expect(marks.emitted('pick')).toStrictEqual([[{ kind: 'mark', mark: 'stash' }]])

    await marks.setProps({ chosen: { kind: 'mark', mark: 'stash' } })
    await row?.trigger('click')

    expect(marks.emitted('pick')?.at(-1)).toStrictEqual([null])
  })

  it('marks the chosen kind and no other', () => {
    const marks = mount(ShipMarks, {
      props: { ship: busy, chosen: { kind: 'mark', mark: 'stash' } },
    })
    const lit = marks.findAll('button').filter((one) => one.classes().includes('bg-orange-500/10'))

    expect(lit).toHaveLength(1)
    expect(lit[0]?.text()).toContain('Stash')
  })
})
