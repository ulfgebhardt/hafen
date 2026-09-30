import { localTasks, tasksFor } from '@hafen/core'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TaskList from './TaskList.vue'
import { quest, ship } from './testing'

describe('taskList', () => {
  /** The intended end state, not an empty list. */
  it('says so when a repository asks for nothing', () => {
    const list = mount(TaskList, { props: { tasks: localTasks(ship()) } })

    expect(list.text()).toContain('Nichts offen')
    expect(list.find('ul').exists()).toBe(false)
  })

  it('writes the point value beside every task', () => {
    const list = mount(TaskList, { props: { tasks: localTasks(ship({ stash: 2 })) } })

    expect(list.text()).toContain('Stash')
    // Signed, because it is what the task *would* add rather than what the ship has.
    expect(list.text()).toMatch(/\+\d/u)
  })

  /**
   * The harbour measures and draws. The command is offered so nobody has to remember it; nothing
   * here runs it, and a button would make this a tool that acts on repositories.
   */
  it('offers the command to type and no way to run it', () => {
    const list = mount(TaskList, { props: { tasks: localTasks(ship({ ahead: 2 })) } })

    expect(list.find('code').text()).toContain('git push')
    expect(list.find('button').exists()).toBe(false)
  })

  it('puts what blocks above what is merely untidy', () => {
    const list = mount(TaskList, {
      props: {
        tasks: localTasks(
          ship({
            stash: 1,
            dirty: true,
            working: { staged: 0, unstaged: 0, untracked: 0, conflicted: 1 },
          }),
        ),
      },
    })

    const items = list.findAll('li').map((item) => item.text())

    expect(items[0]).toContain('Konflikt')
  })

  /**
   * It draws whatever it is handed and decides nothing about which tasks those are. Who splits
   * them is a decision about the page — the sheet makes it, because the quests are already down
   * there with their evidence.
   */
  it('draws a contract task too, where the caller hands one in', () => {
    const subject = ship({ quests: [quest('lint', 'violated')] })
    const list = mount(TaskList, { props: { tasks: tasksFor(subject), title: 'Alles' } })

    expect(list.text()).toContain('Alles')
    expect(list.text()).toContain('lint')
    expect(list.text()).toContain('weil es die Flotte fordert')
  })
})
