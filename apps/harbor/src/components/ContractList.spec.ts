import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ContractList from './ContractList.vue'
import { quest, ship } from './testing'

import type { QuestVerdict } from '@hafen/core'

const fleetOf = (rows: readonly (readonly [string, QuestVerdict])[][]) =>
  rows.map((quests, index) =>
    ship({
      path: `/repos/ship-${String(index)}`,
      quests: quests.map(([id, verdict]) => quest(id, verdict)),
    }),
  )

const rowFor = (page: ReturnType<typeof mount>, id: string) =>
  page.findAll('li').find((one) => one.text().startsWith(id))

describe('the catalog page', () => {
  const fleet = fleetOf([
    [
      ['lint', 'met'],
      ['build', 'unmeasured'],
    ],
    [
      ['lint', 'violated'],
      ['build', 'unmeasured'],
    ],
    [
      ['lint', 'notApplicable'],
      ['build', 'notApplicable'],
    ],
  ])

  /**
   * The words carry the reading, and in the verdicts' own order: worst first.
   *
   * Asserted off the buttons rather than the row's text because the count and the label are two
   * spans, so `.text()` runs them together — the gap is laid out, not written.
   */
  it('draws one row per demand, with its counts in words and worst first', () => {
    const page = mount(ContractList, { props: { ships: fleet } })
    const words = rowFor(page, 'lint')
      ?.findAll('button')
      .slice(1)
      .map((one) => one.text())

    // `nicht anwendbar` is counted and shown last, it is simply not a gap.
    expect(words).toStrictEqual(['1verletzt', '1erfüllt', '1nicht anwendbar'])
  })

  /**
   * The row the page exists for. Per ship this is one grey line among thirteen; per demand it is
   * the whole row, and on this fleet two of thirteen are in that state.
   */
  it('says out loud when a demand decided nothing anywhere', () => {
    const page = mount(ContractList, { props: { ships: fleet } })

    expect(rowFor(page, 'build')?.text()).toContain('misst hier nichts')
    expect(rowFor(page, 'lint')?.text()).not.toContain('misst hier nichts')
  })

  /**
   * The arithmetic that was wrong the first time this page was drawn: `binding - met` reported
   * "44 offen" for a demand that is `nicht messbar` on all 44 ships it reaches — 44 debts invented
   * out of 44 failed measurements.
   */
  it('reports nothing owed where nothing was measured', () => {
    const page = mount(ContractList, { props: { ships: fleet } })

    expect(rowFor(page, 'build')?.text()).toContain('nichts gefunden')
    expect(rowFor(page, 'build')?.text()).not.toContain('2 offen')
    expect(rowFor(page, 'lint')?.text()).toContain('1 offen')
  })

  /** And the row cannot offer a basin it has no ships for. */
  it('does not offer a pick for a demand that found nothing', () => {
    const page = mount(ContractList, { props: { ships: fleet } })

    expect(rowFor(page, 'build')?.find('button').attributes('disabled')).toBeDefined()
    expect(rowFor(page, 'lint')?.find('button').attributes('disabled')).toBeUndefined()
  })

  it('picks what was found wanting from the row, and one verdict from a word', async () => {
    const page = mount(ContractList, { props: { ships: fleet } })

    await rowFor(page, 'lint')?.find('button').trigger('click')

    expect(page.emitted('pick')?.[0]).toStrictEqual([{ id: 'lint', verdict: null }])

    const word = rowFor(page, 'build')
      ?.findAll('button')
      .find((one) => one.text().includes('nicht messbar'))

    // The words still work where the row does not: `nicht messbar` is a set worth looking at,
    // it is just not a set of debtors.
    expect(word).toBeDefined()

    await word?.trigger('click')

    expect(page.emitted('pick')?.[1]).toStrictEqual([{ id: 'build', verdict: 'unmeasured' }])
  })

  /** Same argument as the empty band tab: a heading that vanishes is one nobody finds again. */
  it('keeps a heading for a chain nothing is filed under', () => {
    const page = mount(ContractList, { props: { ships: fleet } })

    expect(page.text()).toContain('fracht')
    expect(page.text()).toContain('fordert heute nichts')
  })

  it('marks the demand that is currently picked', () => {
    const page = mount(ContractList, {
      props: { ships: fleet, picked: { id: 'lint', verdict: 'violated' } },
    })

    expect(rowFor(page, 'lint')?.classes().join(' ')).toContain('bg-slate-900')
    expect(rowFor(page, 'build')?.classes().join(' ')).not.toContain('bg-slate-900')
  })

  /** An empty fleet is a page of headings, not a crash — and `binding === 0` divides the bar. */
  it('draws the chains even with nothing measured at all', () => {
    const page = mount(ContractList, { props: { ships: [] } })

    expect(page.findAll('li')).toStrictEqual([])
    expect(page.text()).toContain('werft')
  })
})
