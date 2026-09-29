import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import QuestRow from './QuestRow.vue'
import { check, quest } from './testing'

describe('questRow', () => {
  it('shows the id and the reason without being asked', () => {
    const row = mount(QuestRow, { props: { quest: quest('lint', 'violated') } })

    expect(row.text()).toContain('lint')
    expect(row.text()).toContain('verletzt')
    expect(row.text()).toContain('Urteil: violated')
  })

  /**
   * The evidence is one click away and never absent: a verdict has to be arguable rather than
   * believed, but a panel that shows every proof at once is a panel nobody reads.
   */
  it('keeps the evidence folded until it is asked for', async () => {
    const row = mount(QuestRow, {
      props: { quest: quest('lint', 'violated', { checks: [check(false)] }) },
    })

    expect(row.text()).not.toContain('package.json')

    await row.get('button').trigger('click')

    expect(row.text()).toContain('package.json')
    expect(row.text()).toContain('lintet etwas')
    expect(row.text()).toContain('eslint .')
  })

  it('says why the fleet demands this, once opened', async () => {
    const row = mount(QuestRow, { props: { quest: quest('lint', 'met') } })
    await row.get('button').trigger('click')

    expect(row.text()).toContain('weil es die Flotte fordert')
  })

  /** The one people read as a failure — so the panel says outright that it is not one. */
  it('explains that unmeasured is not a gap', async () => {
    const row = mount(QuestRow, { props: { quest: quest('build', 'unmeasured') } })
    await row.get('button').trigger('click')

    expect(row.text()).toContain('das ist keine Lücke')
  })

  it('names what a waiting quest waits on', async () => {
    const row = mount(QuestRow, {
      props: { quest: quest('lint-standard', 'waiting', { waitingOn: ['lint'] }) },
    })
    await row.get('button').trigger('click')

    expect(row.text()).toContain('wartet auf lint')
  })

  it('says a quest names no check rather than showing an empty table', async () => {
    const row = mount(QuestRow, { props: { quest: quest('build', 'unmeasured') } })
    await row.get('button').trigger('click')

    expect(row.text()).toContain('nennt keine Prüfung')
    expect(row.find('ul').exists()).toBe(false)
  })

  /** An unanswerable check is marked apart from a failed one, here as everywhere. */
  it('separates a check that could not answer from one that answered no', async () => {
    const row = mount(QuestRow, {
      props: {
        quest: quest('lint', 'violated', {
          checks: [check(false, 'antwortet nein'), check(null, 'kann nicht antworten')],
        }),
      },
    })
    await row.get('button').trigger('click')

    const marks = row.findAll('li > span:first-child').map((cell) => cell.text())

    expect(marks).toStrictEqual(['!', '?'])
  })

  it('marks a demand the ship makes of itself', () => {
    const own = mount(QuestRow, { props: { quest: quest('dav', 'met'), own: true } })
    const fleet = mount(QuestRow, { props: { quest: quest('dav', 'met') } })

    expect(own.text()).toContain('eigene Forderung')
    expect(fleet.text()).not.toContain('eigene Forderung')
  })
})
