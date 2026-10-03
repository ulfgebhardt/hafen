import { describe, expect, it } from 'vitest'

import { filterShips, matches } from './search'
import { ship } from './testing'

const leuchtturm = ship({
  org: 'Leuchtturm-Verbund',
  name: 'Leuchtturm-Deploy-Aufbau',
  path: '/home/x/code/src/Leuchtturm-Verbund/Leuchtturm-Deploy-Aufbau',
})
const addons = ship({
  org: 'kombuese',
  name: 'AddOns',
  path: '/home/x/code/src/kombuese/addons/AddOns',
})

describe(matches, () => {
  /**
   * Three fields and not one: all three are how somebody names a repository from memory, and only
   * one of `leuchtturm`, `kombuese` and `sources` is a repository name.
   */
  it('finds a ship by name, by org and by path', () => {
    expect(matches(leuchtturm, 'deploy')).toBe(true)
    expect(matches(leuchtturm, 'verbund')).toBe(true)
    expect(matches(addons, 'addons')).toBe(true)
  })

  it('ignores case, the way somebody types from memory', () => {
    expect(matches(leuchtturm, 'LEUCHTTURM')).toBe(true)
    expect(matches(addons, 'AddOns')).toBe(true)
  })

  /**
   * Every word has to land somewhere, and not the whole phrase in one field: `leuchtturm deploy` is
   * what a person types, and it is not a substring of anything.
   */
  it('takes each word on its own', () => {
    expect(matches(leuchtturm, 'leuchtturm deploy')).toBe(true)
    expect(matches(leuchtturm, 'leuchtturm takel')).toBe(false)
  })

  it('matches everything when nothing was typed', () => {
    expect(matches(leuchtturm, '')).toBe(true)
    expect(matches(leuchtturm, '   ')).toBe(true)
  })

  /** A substring is a rule a reader can predict, and predictability is the value of a filter. */
  it('does not match on a near miss', () => {
    expect(matches(leuchtturm, 'leuchturm')).toBe(false)
  })
})

describe(filterShips, () => {
  it('takes things away and never rearranges what is left', () => {
    const fleet = [leuchtturm, addons, ship({ name: 'werft', path: '/x/werft' })]

    expect(filterShips(fleet, '').map((one) => one.name)).toStrictEqual(
      fleet.map((one) => one.name),
    )
    expect(filterShips(fleet, 'a').map((one) => one.name)).toStrictEqual([
      leuchtturm.name,
      addons.name,
    ])
  })

  it('answers with nothing rather than everything when nothing matches', () => {
    expect(filterShips([leuchtturm, addons], 'gibtesnicht')).toStrictEqual([])
  })
})
