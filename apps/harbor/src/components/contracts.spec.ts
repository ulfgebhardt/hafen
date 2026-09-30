import { describe, expect, it } from 'vitest'

import { contractCount, filterByContract, matchesContract, tallyContracts } from './contracts'
import { quest, ship } from './testing'

import type { QuestVerdict } from '@hafen/core'

/** A fleet spelled out by verdict, because that is the only thing these rows are about. */
const fleetOf = (rows: readonly (readonly [string, QuestVerdict, string?])[][]) =>
  rows.map((quests, index) =>
    ship({
      path: `/repos/ship-${String(index)}`,
      quests: quests.map(([id, verdict, chain]) =>
        quest(id, verdict, chain === undefined ? {} : { chain: chain as 'werft' }),
      ),
    }),
  )

const rowOf = (chains: ReturnType<typeof tallyContracts>, id: string) =>
  chains.flatMap((chain) => chain.contracts).find((one) => one.id === id)

describe(tallyContracts, () => {
  it('counts one demand across every ship it reaches', () => {
    const chains = tallyContracts(
      fleetOf([
        [['lint', 'met']],
        [['lint', 'violated']],
        [['lint', 'violated']],
        [['lint', 'notApplicable']],
      ]),
    )
    const lint = rowOf(chains, 'lint')

    expect(lint?.counts.get('violated')).toBe(2)
    // Four ships carry the quest, three are reached by it: `notApplicable` is not a gap.
    expect(lint?.binding).toBe(3)
    expect(lint?.outstanding).toBe(2)
    expect(lint?.silent).toBe(false)
  })

  /**
   * The row this page exists for. `werft/build` is `nicht messbar` on all 44 repositories it
   * reaches and `auslauf/geschuetzter-hauptzweig` is `Voraussetzung offen` on 38 of 44 — read per
   * ship each is one grey line among thirteen, and nothing in the window said so before.
   */
  it('names a demand that settled nothing anywhere', () => {
    const chains = tallyContracts(
      fleetOf([
        [
          ['build', 'unmeasured'],
          ['haupt', 'waiting', 'auslauf'],
        ],
        [
          ['build', 'unmeasured'],
          ['haupt', 'waiting', 'auslauf'],
        ],
      ]),
    )

    expect(rowOf(chains, 'build')?.silent).toBe(true)
    expect(rowOf(chains, 'haupt')?.silent).toBe(true)

    // And the two are not the same row. `build` measured nothing, so it found nothing and the
    // row offers no basin; `haupt` is blocked on 2 ships, which is a finding and does.
    expect(rowOf(chains, 'build')?.outstanding).toBe(0)
    expect(rowOf(chains, 'haupt')?.outstanding).toBe(2)
  })

  /** One judgement anywhere is enough — silence is about the fleet, not about a ship. */
  it('is not silent once anything was decided', () => {
    const chains = tallyContracts(fleetOf([[['build', 'unmeasured']], [['build', 'met']]]))

    expect(rowOf(chains, 'build')?.silent).toBe(false)
  })

  /**
   * Every chain, including the ones nothing is filed under — the same argument as the empty band
   * tab: a heading that vanishes when it is empty is one nobody finds again to ask why.
   */
  it('offers every chain in the chains own order', () => {
    const chains = tallyContracts(fleetOf([[['lint', 'met']]]))

    expect(chains.map((one) => one.chain)).toStrictEqual([
      'werft',
      'auslauf',
      'fracht',
      'flagge',
      'handel',
    ])
    expect(chains.find((one) => one.chain === 'fracht')?.contracts).toStrictEqual([])
  })

  /** Distinct ships, so two demands reaching the same repository do not count it twice. */
  it('counts the ships a chain reaches once each', () => {
    const chains = tallyContracts(
      fleetOf([
        [
          ['lint', 'met'],
          ['unit', 'violated'],
        ],
        [
          ['lint', 'notApplicable'],
          ['unit', 'notApplicable'],
        ],
      ]),
    )

    expect(chains.find((one) => one.chain === 'werft')?.binding).toBe(1)
  })

  /** A demand nobody carries has no row, rather than a row of zeroes it never earned. */
  it('has no row for a demand that reached nothing', () => {
    expect(tallyContracts([ship({ quests: [] })]).flatMap((one) => one.contracts)).toStrictEqual([])
  })

  it('sorts inside a chain by id, so nothing swaps between two snapshots', () => {
    const chains = tallyContracts(
      fleetOf([
        [
          ['unit', 'met'],
          ['lint', 'met'],
          ['e2e', 'met'],
        ],
      ]),
    )

    expect(chains[0]?.contracts.map((one) => one.id)).toStrictEqual(['e2e', 'lint', 'unit'])
  })
})

describe(matchesContract, () => {
  const fleet = fleetOf([
    [['lint', 'met']],
    [['lint', 'violated']],
    [['lint', 'waiting']],
    [['lint', 'unmeasured']],
    [['lint', 'notApplicable']],
    [['unit', 'violated']],
  ])

  /**
   * The row asks what the demand found wanting, which is neither "who breaks it" nor "everything
   * not met". `geschuetzter-hauptzweig` has no `verletzt` at all and 38 ships waiting on it, so
   * the first would answer an empty basin; `werft/build` is `nicht messbar` on all 44 it reaches,
   * so the second would report 44 debts off 44 failed measurements.
   */
  it('takes what was found wanting when no verdict was named', () => {
    const left = filterByContract(fleet, { id: 'lint', verdict: null })

    expect(left.map((one) => one.path)).toStrictEqual(['/repos/ship-1', '/repos/ship-2'])
    expect(left.every((one) => matchesContract(one, { id: 'lint', verdict: null }))).toBe(true)
  })

  /** The rule that keeps a failed measurement out of the debts, asserted on its own. */
  it('never counts nicht messbar as something owed', () => {
    expect(contractCount(fleet, { id: 'lint', verdict: null })).toBe(2)
    expect(contractCount(fleet, { id: 'lint', verdict: 'unmeasured' })).toBe(1)
  })

  it('takes exactly one verdict when one was named', () => {
    expect(contractCount(fleet, { id: 'lint', verdict: 'waiting' })).toBe(1)
    expect(contractCount(fleet, { id: 'lint', verdict: 'notApplicable' })).toBe(1)
  })

  /** A ship the demand never reached is not a ship that failed it. */
  it('leaves out a ship that does not carry the demand at all', () => {
    expect(contractCount(fleet, { id: 'liesmich', verdict: null })).toBe(0)
  })

  /** The same rule the search filter follows: taking away, never rearranging. */
  it('keeps the order it was given, and gives everything back when nothing is picked', () => {
    expect(filterByContract(fleet, null)).toStrictEqual(fleet)
    expect(
      filterByContract(fleet, { id: 'lint', verdict: null }).map((one) => one.path),
    ).toStrictEqual(['/repos/ship-1', '/repos/ship-2'])
  })
})
