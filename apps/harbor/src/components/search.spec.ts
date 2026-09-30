import { describe, expect, it } from 'vitest'

import { filterShips, matches } from './search'
import { ship } from './testing'

const ocelot = ship({
  org: 'Ocelot-Social-Community',
  name: 'Ocelot-Social-Deploy-Aufbau',
  path: '/home/x/.data/sources/Ocelot-Social-Community/Ocelot-Social-Deploy-Aufbau',
})
const addons = ship({
  org: 'mojotrollz',
  name: 'AddOns',
  path: '/home/x/.data/sources/mojotrollz/addons/AddOns',
})

describe(matches, () => {
  /**
   * Three fields and not one: all three are how somebody names a repository from memory, and only
   * one of `ocelot`, `mojotrollz` and `sources` is a repository name.
   */
  it('finds a ship by name, by org and by path', () => {
    expect(matches(ocelot, 'deploy')).toBe(true)
    expect(matches(ocelot, 'community')).toBe(true)
    expect(matches(addons, 'addons')).toBe(true)
  })

  it('ignores case, the way somebody types from memory', () => {
    expect(matches(ocelot, 'OCELOT')).toBe(true)
    expect(matches(addons, 'AddOns')).toBe(true)
  })

  /**
   * Every word has to land somewhere, and not the whole phrase in one field: `ocelot deploy` is
   * what a person types, and it is not a substring of anything.
   */
  it('takes each word on its own', () => {
    expect(matches(ocelot, 'ocelot deploy')).toBe(true)
    expect(matches(ocelot, 'ocelot gradido')).toBe(false)
  })

  it('matches everything when nothing was typed', () => {
    expect(matches(ocelot, '')).toBe(true)
    expect(matches(ocelot, '   ')).toBe(true)
  })

  /** A substring is a rule a reader can predict, and predictability is the value of a filter. */
  it('does not match on a near miss', () => {
    expect(matches(ocelot, 'oclot')).toBe(false)
  })
})

describe(filterShips, () => {
  it('takes things away and never rearranges what is left', () => {
    const fleet = [ocelot, addons, ship({ name: 'werft', path: '/x/werft' })]

    expect(filterShips(fleet, '').map((one) => one.name)).toStrictEqual(
      fleet.map((one) => one.name),
    )
    expect(filterShips(fleet, 'a').map((one) => one.name)).toStrictEqual([ocelot.name, addons.name])
  })

  it('answers with nothing rather than everything when nothing matches', () => {
    expect(filterShips([ocelot, addons], 'gibtesnicht')).toStrictEqual([])
  })
})
