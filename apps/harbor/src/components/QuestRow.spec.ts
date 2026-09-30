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

describe('what a quest is worth', () => {
  const owed = quest('lint', 'violated')
  const task = {
    kind: 'contract' as const,
    title: 'lint',
    why: 'weil es die Flotte fordert',
    command: 'hafen hafen --evidenz  # lint',
    project: 0,
    personal: 8,
    quest: 'lint',
  }

  /**
   * The value and the command came down to the row from a list above it, which printed a thinner
   * copy of every violated quest. A thing belongs where its evidence is.
   */
  it('writes the value on the row and the command under the proof', async () => {
    const row = mount(QuestRow, { props: { quest: owed, task } })

    expect(row.text()).toContain('+8')
    expect(row.find('code').exists()).toBe(false)

    await row.find('button').trigger('click')

    expect(row.find('code').text()).toContain('hafen hafen --evidenz')
  })

  /** Nothing to close, nothing to offer: a met quest is a record and not a call to action. */
  it('offers nothing where there is nothing to do', () => {
    const row = mount(QuestRow, { props: { quest: quest('lint', 'met') } })

    expect(row.text()).not.toMatch(/\+\d/u)
  })

  /**
   * Clicking a container in the harbour asks about *that* demand. Opened and not only marked: a
   * highlighted row somebody then has to click again is a step that answers nothing.
   */
  it('opens itself when its box was clicked in the harbour', () => {
    const row = mount(QuestRow, { props: { quest: owed, task, chosen: true } })

    expect(row.find('[aria-expanded="true"]').exists()).toBe(true)
    expect(row.find('code').exists()).toBe(true)
  })
})
