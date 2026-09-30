/**
 * The place the ships lie in: water, a beach, a quay.
 *
 * Every number here is a shape and none of them is a measurement — this is the one file in the
 * drawing that is decoration outright, and saying so is the point. Everything else on screen
 * stands for something that was read out of a repository; this stands for nothing, and exists so
 * that what does stand for something has somewhere to be.
 *
 * Still generated rather than drawn by hand: a coastline traced once is a coastline that is
 * wrong at every other window size, and a harbour that crops its own beach looks broken rather
 * than austere.
 */

export interface Wave {
  /** Where the crest sits along the line, 0…1. */
  at: number
  /** How far it rises, in drawing units. */
  height: number
  /** How wide, so two waves are not the same wave. */
  width: number
}

/**
 * A deterministic pseudo-random sequence.
 *
 * Seeded and not `Math.random`, for the same reason `drift` is a hash of the path: the scene is
 * looked at repeatedly, and a coastline that reshuffles between two readings of the same harbour
 * makes the whole picture feel untrustworthy — even though nothing it *means* has changed.
 */
function sequence(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

/** The crests along one waterline. */
export function waves(width: number, seed = 7, count = 26): readonly Wave[] {
  const next = sequence(seed)
  return Array.from({ length: count }, (_, index) => ({
    at: (index + next() * 0.6) / count,
    height: 1.2 + next() * 2.4,
    width: 14 + next() * 26,
  })).filter((wave) => wave.at <= 1 && width > 0)
}

export interface Dune {
  x: number
  y: number
}

/**
 * The beach: a soft line the sheet ends on, rather than a hard edge.
 *
 * Built from overlapping cosine humps because a single sine reads as a wave and not as sand, and
 * a straight line reads as a page border. Returned as points so the renderer can both stroke it
 * and fill under it.
 */
export function shoreline(width: number, height: number, seed = 3, steps = 64): readonly Dune[] {
  const next = sequence(seed)
  const humps = Array.from({ length: 5 }, () => ({
    at: next(),
    size: 0.3 + next() * 0.7,
    span: 0.15 + next() * 0.35,
  }))

  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps
    let rise = 0
    for (const hump of humps) {
      const distance = Math.abs(t - hump.at) / hump.span
      if (distance < 1) {
        rise += hump.size * (Math.cos(distance * Math.PI) + 1) * 0.5
      }
    }
    return { x: t * width, y: height - Math.min(rise, 1.4) * height * 0.5 }
  })
}

export interface Crane {
  x: number
  /** Height of the tower. */
  height: number
  /** How far the jib reaches, signed: negative reaches left. */
  reach: number
}

/**
 * Cranes along the quay.
 *
 * Spaced rather than random so they read as installed equipment and not as scattered marks — a
 * harbour's cranes stand in a row because a quay is a straight line.
 */
export function cranes(width: number, count = 4, seed = 11): readonly Crane[] {
  const next = sequence(seed)
  const gap = width / (count + 1)
  return Array.from({ length: count }, (_, index) => ({
    x: gap * (index + 1),
    height: 26 + next() * 16,
    reach: (next() > 0.5 ? 1 : -1) * (14 + next() * 10),
  }))
}
