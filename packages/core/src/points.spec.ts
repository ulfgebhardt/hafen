import { describe, expect, it } from 'vitest'

import { mockChecks, mockContract } from './mock'
import {
  ACTIVE_WINDOW_DAYS,
  AUTHOR_POINTS,
  BREADTH_POINTS,
  byProjectPoints,
  CHECK_POINTS,
  CI_POINTS,
  coveredChecks,
  fleetPoints,
  isActive,
  isClean,
  isKept,
  KEPT_POINTS,
  KIND_POINTS,
  pointLines,
  projectPoints,
  PULL_POINTS,
  QUEST_POINTS,
  questValue,
  scoreWork,
  SHIPSHAPE_POINTS,
  shipPoints,
  SPAN_CEILING,
  spanOf,
  spanWeight,
  UNSCORED_POINTS,
} from './points'
import { NO_LEDGER, NO_WORK } from './work'
import { NOTHING_OPEN } from './working'

import type { QuestResult } from './chain'
import type { Ship } from './ship'
import type { Ledger, Work } from './work'

function work(overrides: Partial<Work> = {}): Work {
  return { ...NO_WORK, ...overrides }
}

function ledger(total: Partial<Work> = {}, own: Partial<Work> = {}): Ledger {
  return { total: work(total), own: work(own) }
}

function ship(overrides: Partial<Ship> = {}): Ship {
  return {
    name: 'ship',
    org: 'org',
    path: '/repos/org/ship',
    remotes: [],
    branch: 'main',
    dirty: false,
    working: NOTHING_OPEN,
    stash: 0,
    ledger: NO_LEDGER,
    lines: null,
    roots: [],
    rustDays: 1,
    docks: [],
    ahead: 0,
    behind: 0,
    contract: mockContract(),
    quests: [],
    ownQuests: [],
    overriddenQuests: [],
    unreadableQuests: [],
    stage: 'sailing',
    archived: false,
    branches: [],
    defaultBranch: 'main',
    submodules: [],
    enlisted: false,
    hasGit: true,
    ...overrides,
  }
}

describe(scoreWork, () => {
  it('scores nothing for nothing', () => {
    expect(scoreWork(NO_WORK)).toBe(0)
  })

  it('weights a feature above a chore', () => {
    expect(scoreWork(work({ byKind: { feat: 1 } }))).toBeGreaterThan(
      scoreWork(work({ byKind: { chore: 1 } })),
    )
    expect(scoreWork(work({ byKind: { feat: 2, fix: 1 } }))).toBe(
      KIND_POINTS.feat * 2 + KIND_POINTS.fix,
    )
  })

  /**
   * A zero beside two thousand commits would read as idleness, and that is the one way these
   * numbers could lie outright: the convention is missing, the work is not.
   */
  it('scores a commit that said nothing about itself', () => {
    expect(scoreWork(work({ unscored: 7 }))).toBe(7 * UNSCORED_POINTS)
    expect(UNSCORED_POINTS).toBeGreaterThan(0)
  })

  it('adds the pull requests on top of the commits in them', () => {
    expect(scoreWork(work({ byKind: { feat: 1 }, pulls: 2 }))).toBe(
      KIND_POINTS.feat + 2 * PULL_POINTS,
    )
  })

  /** Nothing is worth zero: a year spent on documentation and CI was still a year of work. */
  it('gives every kind some weight', () => {
    for (const points of Object.values(KIND_POINTS)) {
      expect(points).toBeGreaterThan(0)
    }
  })
})

describe(shipPoints, () => {
  it('reports the project total and the own share apart', () => {
    const subject = ship({ ledger: ledger({ byKind: { feat: 10 } }, { byKind: { feat: 2 } }) })

    expect(shipPoints(subject)).toMatchObject({
      project: 10 * KIND_POINTS.feat,
      own: 2 * KIND_POINTS.feat,
    })
  })

  /**
   * The whole number looked like a commit counter, and mostly was: 107 491 commits against 206
   * checks, so no weight a check could honestly carry would show up in one figure. What fixes that
   * is saying what went in.
   */
  it('says what the project score was made of', () => {
    const subject = ship({
      ledger: ledger({ byKind: { feat: 1 }, authors: 3 }),
      contract: mockContract({
        scripts: { lint: true, typecheck: false, unit: false, e2e: false },
        inCi: ['lint'],
      }),
    })
    const points = shipPoints(subject)

    expect(points.from).toStrictEqual({
      work: KIND_POINTS.feat,
      authors: 3 * AUTHOR_POINTS,
      checks: CHECK_POINTS,
      ci: CI_POINTS,
    })
    expect(points.project).toBe(
      points.from.work + points.from.authors + points.from.checks + points.from.ci,
    )
  })

  /**
   * The authors, the checks and the CI belong to the *project*. Handing them to whoever happens to
   * have the checkout is the conflation the two scores exist to prevent.
   */
  it('keeps the share of the reader to commits and pull requests', () => {
    const subject = ship({
      ledger: ledger({ byKind: { feat: 9 }, authors: 40 }, { byKind: { feat: 1 } }),
      contract: mockContract({ scripts: { lint: true, typecheck: true, unit: true, e2e: true } }),
    })

    expect(shipPoints(subject).own).toBe(KIND_POINTS.feat)
  })

  /** Per member and role, never per script name: a repository does not run twice the engineering
   * because somebody split `test` into `test:unit` and `test:integration`. */
  it('counts a check once per member and role', () => {
    const twice = ship({
      contract: mockContract({
        members: [
          {
            dir: '.',
            checks: [
              { script: 'test:unit', role: 'unit', delegates: false },
              { script: 'test:integration', role: 'unit', delegates: false },
            ],
          },
        ],
      }),
    })

    expect(coveredChecks(twice)).toBe(1)
  })

  /**
   * Quests deliberately do not enter the score: a demand met is a state the ship is supposed to
   * be in, not an achievement to bank — and adding them would let commit volume buy a ship out of
   * a violated contract.
   */
  it('is unchanged by whether the ship meets its quests', () => {
    const base = ledger({ byKind: { feat: 4 } })
    const met = ship({
      ledger: base,
      quests: [
        {
          id: 'lint',
          chain: 'werft',
          title: 'lint',
          why: '',
          verdict: 'met',
          waitingOn: [],
          checks: [],
          reason: '',
        },
      ],
    })
    const violated = ship({
      ledger: base,
      quests: [
        {
          id: 'lint',
          chain: 'werft',
          title: 'lint',
          why: '',
          verdict: 'violated',
          waitingOn: [],
          checks: [],
          reason: '',
        },
      ],
    })

    expect(shipPoints(met)).toStrictEqual(shipPoints(violated))
  })
})

describe(isClean, () => {
  it('is true only for a tree somebody could walk away from', () => {
    expect(isClean(ship())).toBe(true)
  })

  it.each([
    ['offene Arbeit', ship({ dirty: true })],
    ['ein Stash', ship({ stash: 1 })],
    ['nicht gepusht', ship({ ahead: 3 })],
    [
      'ein Konflikt',
      ship({ working: { staged: 0, unstaged: 0, untracked: 0, conflicted: 1 }, dirty: true }),
    ],
  ])('is false with %s', (_reason, subject) => {
    expect(isClean(subject)).toBe(false)
  })

  /** No upstream is not "unpushed": there was nothing to be ahead of. */
  it('does not punish a repository with no upstream', () => {
    expect(isClean(ship({ ahead: null, behind: null }))).toBe(true)
  })
})

describe(isActive, () => {
  it('counts a repository touched inside the window', () => {
    expect(isActive(ship({ rustDays: ACTIVE_WINDOW_DAYS }))).toBe(true)
    expect(isActive(ship({ rustDays: ACTIVE_WINDOW_DAYS + 1 }))).toBe(false)
  })

  /** A directory with no history was not "just touched" — nothing is known about it. */
  it('does not count a repository without commits', () => {
    expect(isActive(ship({ rustDays: null }))).toBe(false)
  })
})

describe(fleetPoints, () => {
  /**
   * Beside `tidy` and measured separately: a merged branch and a submodule that was never checked
   * out are both work lying about, and they cost nothing visible for years. Of 92 repositories, 44
   * are clean and 29 of those also carry nothing stale.
   */
  it('rewards a repository tidy beyond its working tree', () => {
    const kept = ship()
    const trailing = ship({
      branches: [{ name: 'feat', upstream: null, gone: true, merged: false, current: false }],
    })

    expect(isKept(kept)).toBe(true)
    expect(isKept(trailing)).toBe(false)
    expect(fleetPoints([kept]).tidy).toBe(fleetPoints([trailing]).tidy + KEPT_POINTS)
  })

  it('adds work, breadth and tidiness', () => {
    const ships = [
      ship({ rustDays: 2, ledger: ledger({ byKind: { feat: 5 } }, { byKind: { feat: 2 } }) }),
      ship({ rustDays: 900, dirty: true, ledger: ledger({}, { byKind: { fix: 1 } }) }),
    ]

    const points = fleetPoints(ships)

    // One active, one clean — so each of the three parts is a single unit of its own weight.
    expect(points).toMatchObject({
      work: 2 * KIND_POINTS.feat + KIND_POINTS.fix,
      active: 1,
      clean: 1,
      breadth: BREADTH_POINTS,
      // Both carry nothing stale, so the kept award lands on each of them.
      tidy: SHIPSHAPE_POINTS + 2 * KEPT_POINTS,
    })
    expect(points.total).toBe(points.work + points.breadth + points.tidy)
  })

  /**
   * The counterweight to `work`: commits alone reward motion, and a fleet optimised for motion is
   * one where ninety trees are half-finished.
   */
  it('scores lower for the same work left lying about', () => {
    const done = fleetPoints([ship({ ledger: ledger({}, { byKind: { feat: 3 } }) })])
    const strewn = fleetPoints([
      ship({ stash: 2, dirty: true, ledger: ledger({}, { byKind: { feat: 3 } }) }),
    ])

    expect(strewn.total).toBeLessThan(done.total)
    expect(strewn.work).toBe(done.work)
  })

  it('carries the counts so the score can be read as a ratio', () => {
    const points = fleetPoints([ship(), ship({ dirty: true }), ship({ rustDays: 900 })])

    expect(points.fleet).toBe(3)
    expect(points.clean).toBe(2)
    expect(points.active).toBe(2)
  })

  it('scores an empty fleet at zero rather than failing', () => {
    expect(fleetPoints([]).total).toBe(0)
  })
})

describe(projectPoints, () => {
  it('sums what the repositories accumulated, every author', () => {
    const ships = [
      ship({ ledger: ledger({ byKind: { feat: 2 } }) }),
      ship({ ledger: ledger({ byKind: { fix: 3 } }) }),
    ]

    expect(projectPoints(ships)).toBe(2 * KIND_POINTS.feat + 3 * KIND_POINTS.fix)
  })
})

describe(byProjectPoints, () => {
  it('puts the busiest repository first', () => {
    const small = ship({ name: 'klein', ledger: ledger({ byKind: { feat: 1 } }) })
    const big = ship({ name: 'gross', ledger: ledger({ byKind: { feat: 100 } }) })

    expect([small, big].sort(byProjectPoints).map((entry) => entry.name)).toStrictEqual([
      'gross',
      'klein',
    ])
  })

  it('is stable on the name where the scores tie', () => {
    const b = ship({ name: 'b' })
    const a = ship({ name: 'a' })

    expect([b, a].sort(byProjectPoints).map((entry) => entry.name)).toStrictEqual(['a', 'b'])
  })
})

describe('how wide a repository is', () => {
  const wide = (carrying: number, declared = carrying): Ship =>
    ship({
      contract: mockContract({
        members: Array.from({ length: declared }, (_, index) => ({
          dir: `packages/${String(index)}`,
          checks:
            index < carrying
              ? mockChecks({ lint: true, typecheck: false, unit: false, e2e: false })
              : [],
        })),
      }),
    })

  /**
   * Carrying and not merely declared, and that distinction is the whole measurement: `vike` has
   * sixty-seven `package.json` files and three of them run anything. Counting manifests would have
   * made an examples directory the widest repository in the fleet.
   */
  it('counts the members that run something, not the manifests', () => {
    expect(spanOf(wide(3, 67))).toBe(3)
    expect(spanOf(wide(11))).toBe(11)
  })

  /** A repository with no members at all is still one repository, and a demand on it still binds. */
  it('is one for a repository with nothing in it', () => {
    expect(spanOf(ship({ contract: mockContract({ members: [] }) }))).toBe(1)
    expect(spanWeight(ship({ contract: mockContract({ members: [] }) }))).toBe(1)
  })

  it('stops learning past the ceiling', () => {
    expect(spanOf(wide(SPAN_CEILING + 20))).toBe(SPAN_CEILING)
  })

  /**
   * More, but diminishing. Meeting `lint` in eleven packages is not eleven times meeting it in
   * one — the config is shared and the fix is copied — but it is plainly more than once.
   */
  it('pays more for a wider repository, and less than proportionally', () => {
    const one = questValue(wide(1))
    const eleven = questValue(wide(11))

    expect(one).toBe(QUEST_POINTS)
    expect(eleven).toBeGreaterThan(one * 2)
    expect(eleven).toBeLessThan(one * 11)
  })

  /** Whole points only: nothing in the window ever prints a fraction. */
  it('never offers a fraction of a point', () => {
    for (let carrying = 1; carrying <= SPAN_CEILING; carrying += 1) {
      expect(Number.isInteger(questValue(wide(carrying)))).toBe(true)
    }
  })

  /** The fleet total has to agree with what each ship's tasks promised. */
  it('adds the contract points per ship, at the rate of that ship', () => {
    const met: QuestResult = {
      id: 'lint',
      chain: 'werft',
      title: 'lint',
      why: '',
      verdict: 'met',
      waitingOn: [],
      checks: [],
      reason: 'erfuellt',
    }
    const narrow = ship({ quests: [met] })
    const broad = { ...wide(9), quests: [met] }

    expect(fleetPoints([broad]).contracts).toBe(questValue(broad))
    expect(fleetPoints([broad]).contracts).toBeGreaterThan(fleetPoints([narrow]).contracts)
  })
})

describe(pointLines, () => {
  const billed = (over: Partial<Ship> = {}) => pointLines(ship(over))

  /**
   * Commit kinds in their own lines, because that is where nearly all of it comes from — and
   * because 96 % of this fleet's commits carry no convention, which one "Commits" line would hide.
   */
  it('bills each kind of commit on its own line', () => {
    const lines = billed({
      ledger: {
        total: { ...NO_WORK, byKind: { feat: 10, fix: 5 }, unscored: 100 },
        own: NO_WORK,
      },
    })

    expect(lines.find((line) => line.name === 'feat')).toStrictEqual({
      name: 'feat',
      count: 10,
      rate: KIND_POINTS.feat,
      points: 10 * KIND_POINTS.feat,
      own: { count: 0, points: 0 },
    })
    expect(lines.find((line) => line.name === 'ohne Convention')?.points).toBe(100)
  })

  /** The sum of the bill is the score: a bill that does not add up is worse than none. */
  it('adds up to the project score', () => {
    const subject = ship({
      ledger: {
        total: { ...NO_WORK, byKind: { feat: 7, chore: 3 }, unscored: 40, pulls: 12, authors: 4 },
        own: NO_WORK,
      },
    })
    const total = pointLines(subject).reduce((sum, line) => sum + line.points, 0)

    expect(total).toBe(shipPoints(subject).project)
  })

  /** Nothing counted is no line: a column of zeroes says nothing and costs a reader a line each. */
  it('leaves out what there is none of', () => {
    expect(billed().every((line) => line.count > 0)).toBe(true)
  })

  /**
   * Which lines a person can hold a share of, and which belong to the repository.
   *
   * The sheet said "davon deine" under a sum whose three largest terms nobody can earn — so the
   * difference read as work still outstanding rather than as a different kind of thing. `null`
   * is nobody's; a nought would be "none of yours yet", and those are not the same sentence.
   */
  it('says which lines nobody can hold a share of', () => {
    const lines = billed({
      ledger: {
        total: { ...NO_WORK, byKind: { feat: 10 }, pulls: 4, authors: 3 },
        own: { ...NO_WORK, byKind: { feat: 4 }, pulls: 1 },
      },
      contract: mockContract({
        scripts: { lint: true, typecheck: false, unit: false, e2e: false },
        inCi: ['lint'],
      }),
    })
    const line = (name: string) => lines.find((one) => one.name === name)

    expect(line('feat')?.own).toStrictEqual({ count: 4, points: 4 * KIND_POINTS.feat })
    expect(line('PRs')?.own).toStrictEqual({ count: 1, points: PULL_POINTS })

    for (const name of ['Autoren', 'Prüfungen', 'in CI']) {
      expect(line(name)?.own).toBeNull()
    }
  })

  /** And what can be held adds up to the figure the sheet prints beside the project's. */
  it("adds what can be held up to the reader's score", () => {
    const subject = ship({
      ledger: {
        total: { ...NO_WORK, byKind: { feat: 9, fix: 2 }, unscored: 30, pulls: 6, authors: 5 },
        own: { ...NO_WORK, byKind: { feat: 3, fix: 1 }, unscored: 7, pulls: 2 },
      },
    })
    const mine = pointLines(subject).reduce((sum, line) => sum + (line.own?.points ?? 0), 0)

    expect(mine).toBe(shipPoints(subject).own)
  })
})
