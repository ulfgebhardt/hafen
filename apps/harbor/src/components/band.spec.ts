import { describe, expect, it } from 'vitest'

import {
  bandOf,
  BANDS,
  byBand,
  CONTRACTS,
  draws,
  firstBand,
  FLEET,
  FLEET_ARCHIVE,
  fleetPageFor,
  isBand,
  isFleet,
  PAGE_LABEL,
  PAGE_MEANING,
  PAGES,
  pageFor,
  pagesOf,
  shipsOn,
  VIEWS,
  viewOf,
} from './band'
import { ship } from './testing'

describe(bandOf, () => {
  it('reads the register for what was put away', () => {
    expect(bandOf(ship({ archived: true, rustDays: 1 }))).toBe('archived')
  })

  it('calls a recently touched repository active', () => {
    expect(bandOf(ship({ rustDays: 3 }))).toBe('active')
    expect(bandOf(ship({ rustDays: 400 }))).toBe('dormant')
  })

  /** The commit date says when something landed, not whether somebody is on it right now. */
  it('lets an open worktree beat the calendar', () => {
    expect(bandOf(ship({ rustDays: 400, docks: ['/d/one'] }))).toBe('active')
  })

  /** Archived wins over everything, including a worktree somebody forgot. */
  it('puts the archive above the rest', () => {
    expect(bandOf(ship({ archived: true, docks: ['/d/one'] }))).toBe('archived')
  })
})

describe(byBand, () => {
  it('sorts every ship into exactly one band', () => {
    const ships = [ship({ rustDays: 1 }), ship({ rustDays: 900 }), ship({ archived: true })]
    const grouped = byBand(ships)

    expect(grouped.active).toHaveLength(1)
    expect(grouped.dormant).toHaveLength(1)
    expect(grouped.archived).toHaveLength(1)
  })

  /** A tab that disappears when it is empty is a tab nobody finds again. */
  it('offers every band, even the empty ones', () => {
    const grouped = byBand([])

    for (const band of BANDS) {
      expect(grouped[band]).toStrictEqual([])
    }
  })
})

describe(firstBand, () => {
  it('opens on the active page, which is what somebody came for', () => {
    expect(firstBand([ship({ rustDays: 1 }), ship({ rustDays: 900 })])).toBe('active')
  })

  /** An empty first page that has to be clicked away is what a tool does once. */
  it('skips to the first band that has anything in it', () => {
    expect(firstBand([ship({ rustDays: 900 })])).toBe('dormant')
    expect(firstBand([ship({ archived: true })])).toBe('archived')
  })

  it('answers something usable for an empty fleet', () => {
    expect(firstBand([])).toBe('active')
  })
})

describe('the fleet page', () => {
  /**
   * Its own page and not a switch on the band pages, because it deliberately ignores the bands:
   * the question is "what does this organisation own", and an answer split across three tabs by
   * how recently each repository was touched is not that answer.
   */
  it('is a page that draws ships but is not a band', () => {
    expect(isBand(FLEET)).toBe(false)
    expect(draws(FLEET)).toBe(true)
    expect(draws(CONTRACTS)).toBe(false)
  })

  it('is offered between the bands and the catalog', () => {
    expect(PAGES).toContain(FLEET)
    expect(PAGES.indexOf(FLEET)).toBeGreaterThan(PAGES.indexOf('archived'))
    expect(PAGES.indexOf(FLEET)).toBeLessThan(PAGES.indexOf(CONTRACTS))
  })

  it('has a label and a sentence of its own', () => {
    for (const page of PAGES) {
      expect(PAGE_LABEL[page]).not.toBe('')
      expect(PAGE_MEANING[page]).not.toBe('')
    }
  })
})

describe(pagesOf, () => {
  /** The question first, the page second: five tabs on one line was a bar nobody could aim at. */
  it('offers the bands in the dock view and the fleet in the other', () => {
    expect(pagesOf('dock')).toStrictEqual(['active', 'dormant', 'archived'])
    expect(pagesOf('fleet')).toStrictEqual([FLEET, FLEET_ARCHIVE])
  })

  /**
   * The catalog is not among them: it counts demands and not hulls, so it is a third question
   * rather than a tab beside pages it has nothing in common with.
   */
  it('offers the catalog as a view of its own and never as a tab beside the bands', () => {
    expect(pagesOf('dock')).not.toContain(CONTRACTS)
    expect(pagesOf('fleet')).not.toContain(CONTRACTS)
    expect(pagesOf('contracts')).toStrictEqual([CONTRACTS])
  })

  it('offers every page in exactly one view', () => {
    const offered = VIEWS.flatMap((view) => pagesOf(view))

    expect([...new Set(offered)]).toHaveLength(offered.length)
    expect(offered).toHaveLength(PAGES.length)
  })
})

describe(viewOf, () => {
  it('puts the buttons right for a page picked somewhere else', () => {
    expect(viewOf(FLEET)).toBe('fleet')

    for (const band of BANDS) {
      expect(viewOf(band)).toBe('dock')
    }

    expect(viewOf(CONTRACTS)).toBe('contracts')
  })

  /** Both ways round: whatever a view offers, it is the view that page says it belongs to. */
  it('agrees with what each view offers', () => {
    for (const view of VIEWS) {
      for (const page of pagesOf(view)) {
        expect(viewOf(page)).toBe(view)
      }
    }
  })
})

describe(shipsOn, () => {
  const active = ship({ name: 'active', rustDays: 1 })
  const dormant = ship({ name: 'dormant', rustDays: 400 })
  const archived = ship({ name: 'archived', archived: true, rustDays: 900 })
  const fleet = [active, dormant, archived]

  /** The default fleet sheet: everything but what the register put away. */
  it('leaves the archive off the fleet sheet', () => {
    expect(shipsOn(FLEET, fleet)).toStrictEqual([active, dormant])
  })

  it('puts every ship on the sheet with the archive', () => {
    expect(shipsOn(FLEET_ARCHIVE, fleet)).toStrictEqual(fleet)
  })

  it('gives a band its own ships and the catalog none', () => {
    expect(shipsOn('archived', fleet)).toStrictEqual([archived])
    expect(shipsOn(CONTRACTS, fleet)).toStrictEqual([])
  })
})

describe(isFleet, () => {
  it('knows both fleet sheets and nothing else', () => {
    expect(PAGES.filter((page) => isFleet(page))).toStrictEqual([FLEET, FLEET_ARCHIVE])
  })

  /** The sheet with the archive is a fleet sheet and not a band, so it belongs to the fleet button. */
  it('puts the full sheet in the fleet view', () => {
    expect(viewOf(FLEET_ARCHIVE)).toBe('fleet')
    expect(isBand(FLEET_ARCHIVE)).toBe(false)
  })
})

describe(fleetPageFor, () => {
  /** The sheet last open, as long as the ship being read is on it. */
  it('comes back to the sheet that was open', () => {
    expect(fleetPageFor(null, FLEET_ARCHIVE)).toBe(FLEET_ARCHIVE)
    expect(fleetPageFor(ship({ rustDays: 1 }), FLEET)).toBe(FLEET)
  })

  /** An archived ship is only on the full sheet, and a switch that lost her would have lost the reader. */
  it('opens the full sheet for an archived ship', () => {
    expect(fleetPageFor(ship({ archived: true, rustDays: 900 }), FLEET)).toBe(FLEET_ARCHIVE)
  })
})

describe(pageFor, () => {
  const active = ship({ rustDays: 1 })
  const archived = ship({ archived: true, rustDays: 900 })

  /** A measurement moved her to another band, and the band page goes with her. */
  it('moves a band page to the band she is in now', () => {
    expect(pageFor('dormant', active)).toBe('active')
    expect(pageFor('active', archived)).toBe('archived')
    expect(pageFor('active', active)).toBe('active')
  })

  /** Put away while the fleet sheet was open: only the full sheet still carries her. */
  it('moves the fleet sheet onto the full one when she is archived', () => {
    expect(pageFor(FLEET, archived)).toBe(FLEET_ARCHIVE)
    expect(pageFor(FLEET, active)).toBe(FLEET)
  })

  /** The full sheet and the catalog carry everybody, so there is nowhere to follow her to. */
  it('leaves the pages that carry every ship where they are', () => {
    expect(pageFor(FLEET_ARCHIVE, active)).toBe(FLEET_ARCHIVE)
    expect(pageFor(CONTRACTS, archived)).toBe(CONTRACTS)
  })
})
