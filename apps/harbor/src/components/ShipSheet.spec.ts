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

    expect(sheet.html()).toContain('Projektpunkte')
    expect(sheet.text()).toContain('40 Commits')
    expect(sheet.text()).toContain('7 PRs')
    expect(sheet.html()).toContain('deine Punkte')
  })

  /** A zero share is not a row worth drawing — it is the normal case on a foreign repository. */
  it('leaves the own share out where there is none', () => {
    const sheet = mount(ShipSheet, {
      props: { ship: ship({ ledger: { total: { ...NO_WORK, commits: 5 }, own: NO_WORK } }) },
    })

    expect(sheet.html()).not.toContain('deine Punkte')
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

describe('one list, not two', () => {
  /**
   * The sheet listed every violated quest as a task and then listed the same quests again
   * underneath with their checks, sources and findings — the same sentence twice, the second time
   * with more behind it. "Zu tun" is now what the repository itself asks for, and a demand is
   * offered at its own row.
   */
  it('names a violated quest once, at the row that carries its evidence', () => {
    const owed = quest('lint', 'violated', { reason: 'kein Linter gefunden' })
    const sheet = mount(ShipSheet, { props: { ship: ship({ quests: [owed], stash: 1 }) } })
    const text = sheet.text()

    // Once, and at the row: `split` counts occurrences, so two parts means one occurrence.
    expect(text.split('kein Linter gefunden')).toHaveLength(2)
    // What closing it is worth is on that row too, rather than on a copy of it above.
    expect(text).toContain('+8')
    // The local half is still a list, and still above the quests.
    expect(text).toContain('Stash')
  })

  it('says what a clean tree means rather than claiming every demand is met', () => {
    const sheet = mount(ShipSheet, {
      props: { ship: ship({ quests: [quest('lint', 'violated')] }) },
    })

    expect(sheet.text()).toContain('Nichts offen')
    expect(sheet.text()).toContain('nichts wartet auf einen Push')
  })
})

describe('the register, from the sheet', () => {
  /**
   * Only where the register actually holds this directory. On a repository the survey found by
   * itself there is nothing to take out, and a button that did nothing on most ships would be a
   * button that lies — which is why `enlisted` travels on the ship at all.
   */
  it('offers to stop holding a directory only where one is held', () => {
    const found = mount(ShipSheet, { props: { ship: ship(), canAct: true } })

    expect(found.text()).not.toContain('nicht mehr führen')

    const adopted = mount(ShipSheet, {
      props: { ship: ship({ enlisted: true }), canAct: true },
    })

    expect(adopted.text()).toContain('nicht mehr führen')
  })

  it('hands the decision up rather than acting on it', async () => {
    const sheet = mount(ShipSheet, { props: { ship: ship({ enlisted: true }), canAct: true } })

    await sheet
      .findAll('button')
      .find((one) => one.text() === 'nicht mehr führen')
      ?.trigger('click')

    expect(sheet.emitted('enlist')).toStrictEqual([[false]])
  })
})

describe('the plan in the sheet', () => {
  /**
   * The same ship again, and every box on her is a target. The harbour answers "which of ninety",
   * this answers "which part of this one" — and at this size the boxes are big enough to hit.
   */
  it('draws the ship and hands a clicked box up', async () => {
    const sheet = mount(ShipSheet, {
      props: { ship: ship({ quests: [quest('lint', 'violated')] }) },
    })
    const box = sheet
      .findAll('rect')
      .find((one) => one.find('title').exists() && one.find('title').text().startsWith('lint'))

    expect(sheet.find('svg').exists()).toBe(true)

    await box?.trigger('click')

    expect(sheet.emitted('pick')).toStrictEqual([['lint']])
  })

  /** Opening a quest row is the same choice, so it travels the same way. */
  it('hands a row that was opened up as a choice too', async () => {
    const sheet = mount(ShipSheet, {
      props: { ship: ship({ quests: [quest('lint', 'violated')] }) },
    })

    await sheet
      .findAll('button')
      .find((one) => one.text().includes('lint'))
      ?.trigger('click')

    expect(sheet.emitted('pick')).toStrictEqual([['lint']])
  })
})
