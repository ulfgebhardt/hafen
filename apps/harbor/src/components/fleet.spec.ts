import { describe, expect, it } from 'vitest'

import {
  ageLabel,
  berths,
  bindingQuests,
  byCondition,
  countVerdicts,
  drift,
  fit,
  orderedQuests,
  PER_LANE,
  shipLabel,
  worstVerdict,
} from './fleet'
import { quest, ship } from './testing'

describe(bindingQuests, () => {
  /** The whole reason the scene has a "no demand" state: not applicable is not a demand. */
  it('leaves out what does not apply to this ship', () => {
    const subject = ship({
      quests: [quest('a', 'met'), quest('b', 'notApplicable'), quest('c', 'violated')],
    })

    expect(bindingQuests(subject).map((entry) => entry.id)).toStrictEqual(['a', 'c'])
  })

  it('comes back empty for a ship nothing reaches', () => {
    expect(bindingQuests(ship({ quests: [quest('a', 'notApplicable')] }))).toStrictEqual([])
  })
})

describe(orderedQuests, () => {
  it('puts what is broken before what is fine', () => {
    const ordered = orderedQuests([
      quest('gut', 'met'),
      quest('unklar', 'unmeasured'),
      quest('kaputt', 'violated'),
      quest('wartet', 'waiting'),
    ])

    expect(ordered.map((entry) => entry.id)).toStrictEqual(['kaputt', 'wartet', 'unklar', 'gut'])
  })

  /** A second key that does not change between snapshots, so nothing swaps places for free. */
  it('breaks a tie on the id', () => {
    const ordered = orderedQuests([quest('zebra', 'met'), quest('adler', 'met')])

    expect(ordered.map((entry) => entry.id)).toStrictEqual(['adler', 'zebra'])
  })
})

describe(countVerdicts, () => {
  it('counts every verdict across the fleet, not applicable included', () => {
    const counts = countVerdicts([
      ship({ quests: [quest('a', 'met'), quest('b', 'violated')] }),
      ship({ quests: [quest('a', 'met'), quest('c', 'notApplicable')] }),
    ])

    expect(counts.get('met')).toBe(2)
    expect(counts.get('violated')).toBe(1)
    expect(counts.get('notApplicable')).toBe(1)
    expect(counts.get('waiting')).toBeUndefined()
  })
})

describe(worstVerdict, () => {
  it('names the worst that binds', () => {
    expect(worstVerdict(ship({ quests: [quest('a', 'met'), quest('b', 'waiting')] }))).toBe(
      'waiting',
    )
  })

  /**
   * `null` and not `notApplicable`: "no demand reaches this repository" and "a demand does not
   * apply here" are different sentences, and the scene bands on the first.
   */
  it('answers null where nothing binds', () => {
    expect(worstVerdict(ship({ quests: [quest('a', 'notApplicable')] }))).toBeNull()
    expect(worstVerdict(ship())).toBeNull()
  })
})

describe(byCondition, () => {
  it('sorts the broken above the sound', () => {
    const broken = ship({ name: 'kaputt', quests: [quest('a', 'violated')] })
    const sound = ship({ name: 'heil', quests: [quest('a', 'met')] })

    expect([sound, broken].sort(byCondition).map((entry) => entry.name)).toStrictEqual([
      'kaputt',
      'heil',
    ])
  })

  /** Not a failure, just not part of this question — so after everything that owes something. */
  it('sorts a ship with no demands last', () => {
    const free = ship({ name: 'frei' })
    const sound = ship({ name: 'heil', quests: [quest('a', 'met')] })

    expect([free, sound].sort(byCondition).map((entry) => entry.name)).toStrictEqual([
      'heil',
      'frei',
    ])
  })

  it('puts more open demands of the same severity first', () => {
    const two = ship({ name: 'zwei', quests: [quest('a', 'violated'), quest('b', 'violated')] })
    const one = ship({ name: 'eins', quests: [quest('a', 'violated'), quest('b', 'met')] })

    expect([one, two].sort(byCondition).map((entry) => entry.name)).toStrictEqual(['zwei', 'eins'])
  })

  /** Fresh is not the same as important: rust decides only once nothing else does. */
  it('uses rust as a second key and never as the first', () => {
    const old = ship({ name: 'alt', rustDays: 900, quests: [quest('a', 'met')] })
    const fresh = ship({ name: 'neu', rustDays: 1, quests: [quest('a', 'violated')] })

    expect([old, fresh].sort(byCondition).map((entry) => entry.name)).toStrictEqual(['neu', 'alt'])
  })

  it('is stable on the name when everything else ties', () => {
    const b = ship({ name: 'b' })
    const a = ship({ name: 'a' })

    expect([b, a].sort(byCondition).map((entry) => entry.name)).toStrictEqual(['a', 'b'])
  })
})

describe(drift, () => {
  /**
   * A function of the path alone, so a hull does not jump between two readings of the same
   * harbour — the scene is looked at repeatedly, and a picture that rearranges itself is one
   * nobody trusts.
   */
  it('gives the same path the same place every time', () => {
    expect(drift('/repos/org/ship')).toBe(drift('/repos/org/ship'))
    expect(drift('/repos/org/other')).not.toBe(drift('/repos/org/ship'))
  })

  it('stays inside the band', () => {
    for (const path of ['/a', '/repos/org/ship', '/x/y/z/very/long/path/indeed']) {
      expect(drift(path)).toBeGreaterThanOrEqual(0)
      expect(drift(path)).toBeLessThan(1)
    }
  })
})

describe(berths, () => {
  it('wraps into lanes and keeps the worst first', () => {
    const ships = Array.from({ length: PER_LANE + 2 }, (_, index) =>
      ship({ name: `s${String(index)}`, path: `/repos/org/s${String(index)}` }),
    )

    const laid = berths(ships)

    expect(laid).toHaveLength(PER_LANE + 2)
    expect(laid[0]?.lane).toBe(0)
    expect(laid[PER_LANE]?.lane).toBe(1)
    expect(laid[PER_LANE]?.x).toBe(0)
  })

  it('gives every hull its own phase, so a fleet does not roll in lockstep', () => {
    const laid = berths([ship({ path: '/repos/org/one' }), ship({ path: '/repos/org/two' })])

    expect(laid[0]?.phase).not.toBe(laid[1]?.phase)
  })

  it('lays out an empty harbor without complaining', () => {
    expect(berths([])).toStrictEqual([])
  })
})

describe(ageLabel, () => {
  it('says a repository has no commits rather than calling it zero days old', () => {
    expect(ageLabel(null)).toBe('ohne Commits')
    expect(ageLabel(0)).toBe('0 Tage')
  })
})

describe(fit, () => {
  it('leaves a caption that fits alone', () => {
    expect(fit('kurz', 10)).toBe('kurz')
    expect(fit('genau-zehn', 10)).toBe('genau-zehn')
  })

  /** Cut *and said so*: a caption that silently ends mid-word claims to be whole. */
  it('marks where it cut', () => {
    expect(fit('viel-zu-lang-für-die-zelle', 10)).toBe('viel-zu-l…')
    expect(fit('viel-zu-lang-für-die-zelle', 10)).toHaveLength(10)
  })

  it('still says something at an absurd width', () => {
    expect(fit('abc', 1)).toBe('a…')
  })
})

describe(shipLabel, () => {
  it('reads as a sentence, for a tooltip and for a screen reader', () => {
    const label = shipLabel(
      ship({ rustDays: 400, quests: [quest('a', 'met'), quest('b', 'violated')] }),
    )

    expect(label).toContain('org/ship')
    expect(label).toContain('Rost')
    expect(label).toContain('400 Tage')
    expect(label).toContain('1 von 2 Quests erfüllt')
  })

  it('says outright when nothing is demanded', () => {
    expect(shipLabel(ship())).toContain('keine Forderung')
  })
})
