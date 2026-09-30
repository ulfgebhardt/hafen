import { describe, expect, it } from 'vitest'

import { cranes, SHORE_BAND, shoreline, waves } from './coast'

describe('the coast', () => {
  /**
   * The only file in this drawing that stands for nothing, so the only thing to assert about it
   * is that it is *stable*: the scene is read repeatedly, and a coastline that reshuffles between
   * two readings of the same harbour makes the picture feel untrustworthy — even though nothing
   * it means has changed.
   */
  it('draws the same coast for the same harbour every time', () => {
    expect(shoreline(800, 400)).toStrictEqual(shoreline(800, 400))
    expect(waves(800)).toStrictEqual(waves(800))
    expect(cranes(800)).toStrictEqual(cranes(800))
  })

  it('gives a different seed a different coast', () => {
    expect(shoreline(800, 400, 1)).not.toStrictEqual(shoreline(800, 400, 2))
  })

  it('stays inside the sheet it was given', () => {
    const width = 640
    const height = 320

    for (const point of shoreline(width, height)) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(width)
      expect(point.y).toBeGreaterThan(0)
      expect(point.y).toBeLessThanOrEqual(height)
    }
  })

  it('spaces the cranes rather than scattering them', () => {
    const drawn = cranes(900, 4)
    const gaps = drawn.slice(1).map((crane, index) => crane.x - (drawn[index]?.x ?? 0))

    for (const gap of gaps) {
      expect(gap).toBeCloseTo(gaps[0] ?? 0, 6)
    }
  })

  it('puts every wave on the line it belongs to', () => {
    for (const wave of waves(500)) {
      expect(wave.at).toBeGreaterThanOrEqual(0)
      expect(wave.at).toBeLessThanOrEqual(1)
      expect(wave.height).toBeGreaterThan(0)
    }
  })

  /**
   * The first version made the sand a share of the height: at two lanes it took half the drawing
   * and cut diagonally across the hulls. The shore is a margin, not a landscape.
   */
  it('keeps the beach in a band at the bottom, whatever the sheet measures', () => {
    for (const height of [200, 900]) {
      for (const point of shoreline(600, height)) {
        expect(point.y).toBeGreaterThan(height - SHORE_BAND)
        expect(point.y).toBeLessThanOrEqual(height)
      }
    }
  })

  it('draws nothing into a sheet with no width', () => {
    expect(waves(0)).toStrictEqual([])
  })
})
