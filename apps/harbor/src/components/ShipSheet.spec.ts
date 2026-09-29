import { mockContract, mockRemote, NO_WORK } from '@hafen/core'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ShipSheet from './ShipSheet.vue'
import { quest, ship } from './testing'

describe('shipSheet', () => {
  it('heads the sheet with the full path, which the scene caption cannot carry', () => {
    const sheet = mount(ShipSheet, { props: { ship: ship() } })

    expect(sheet.text()).toContain('org/ship')
    expect(sheet.text()).toContain('/repos/org/ship')
  })

  it('says what put the ship in its stage, not just the stage', () => {
    const sheet = mount(ShipSheet, { props: { ship: ship({ stage: 'drydock' }) } })

    expect(sheet.text()).toContain('Trockendock')
    expect(sheet.text()).toContain('über 90 Tage unberührt')
  })

  /** No upstream is an answer, and not the same as being level with one. */
  it('separates having no upstream from being level with it', () => {
    const none = mount(ShipSheet, { props: { ship: ship({ ahead: null, behind: null }) } })
    const level = mount(ShipSheet, { props: { ship: ship({ ahead: 0, behind: 0 }) } })

    expect(none.text()).toContain('kein Upstream')
    expect(level.text()).toContain('0 voraus, 0 zurück')
  })

  it('marks a dirty tree', () => {
    expect(mount(ShipSheet, { props: { ship: ship({ dirty: true }) } }).text()).toContain('*')
  })

  /** Mirrors are shown and never asked: they hold the same work. */
  it('names the leading remote and marks the rest as mirrors', () => {
    const sheet = mount(ShipSheet, {
      props: {
        ship: ship({
          remotes: [
            mockRemote('git@github.com:org/ship.git'),
            mockRemote('https://git.seefahrt.example/org/ship.git', 'mirror'),
          ],
        }),
      },
    })

    expect(sheet.text()).toContain('github')
    expect(sheet.text()).toContain('Spiegel')
  })

  it('says a ship has no origin rather than leaving the row blank', () => {
    expect(mount(ShipSheet, { props: { ship: ship() } }).text()).toContain('kein origin')
  })

  /** "Nothing to run" stands above everything, because every gap hides behind it. */
  it('says nothing measures here rather than listing four gaps', () => {
    const sheet = mount(ShipSheet, { props: { ship: ship({ contract: mockContract() }) } })

    expect(sheet.text()).toContain('keine Prüfung gefunden')
    expect(sheet.text()).not.toContain('fehlt:')
  })

  it('names the missing roles where something does measure', () => {
    const sheet = mount(ShipSheet, {
      props: {
        ship: ship({
          contract: mockContract({
            scripts: { lint: true, typecheck: true, unit: true, e2e: false },
          }),
        }),
      },
    })

    expect(sheet.text()).toContain('fehlt: e2e')
    expect(sheet.text()).toContain('test:lint')
  })

  it('lists the binding quests and counts the rest instead of listing them', () => {
    const sheet = mount(ShipSheet, {
      props: {
        ship: ship({
          quests: [
            quest('lint', 'violated'),
            quest('rust-only', 'notApplicable'),
            quest('build', 'notApplicable'),
          ],
        }),
      },
    })

    expect(sheet.text()).toContain('1 bindend')
    expect(sheet.text()).toContain('2 weitere gelten hier nicht')
  })

  it('says outright when no demand reaches this ship', () => {
    const sheet = mount(ShipSheet, { props: { ship: ship() } })

    expect(sheet.text()).toContain('Keine Forderung der Flotte gilt für dieses Schiff')
  })

  /** Counts beside the score, so a weighting can be argued with rather than believed. */
  it('shows what was done here, with the numbers behind the score', () => {
    const sheet = mount(ShipSheet, {
      props: {
        ship: ship({
          ledger: {
            total: { ...NO_WORK, commits: 40, pulls: 7, authors: 3, byKind: { feat: 40 } },
            own: { ...NO_WORK, commits: 10, byKind: { feat: 10 } },
          },
        }),
      },
    })

    expect(sheet.text()).toContain('Projektpunkte')
    expect(sheet.text()).toContain('40 Commits')
    expect(sheet.text()).toContain('7 PRs')
    expect(sheet.text()).toContain('davon deine')
  })

  /** A zero share is not a row worth drawing — it is the normal case on a foreign repository. */
  it('leaves the own share out where there is none', () => {
    const sheet = mount(ShipSheet, {
      props: { ship: ship({ ledger: { total: { ...NO_WORK, commits: 5 }, own: NO_WORK } }) },
    })

    expect(sheet.text()).not.toContain('davon deine')
  })

  /** The one time the catalog's lead bites has to be visible, or it is not a rule. */
  it('reports an own quest the catalog overruled', () => {
    const sheet = mount(ShipSheet, { props: { ship: ship({ overriddenQuests: ['lint'] }) } })

    expect(sheet.text()).toContain('verworfen')
    expect(sheet.text()).toContain('lint')
  })

  it('reports a quest file that did not read as one', () => {
    const sheet = mount(ShipSheet, {
      props: { ship: ship({ unreadableQuests: ['.hafen/quests/werft/kaputt.md'] }) },
    })

    expect(sheet.text()).toContain('Nicht lesbar')
    expect(sheet.text()).toContain('kaputt.md')
  })
})
