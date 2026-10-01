/**
 * How far a running survey has got — the shape of it, and the two readings the bar makes of it.
 *
 * Beside the components rather than in `snapshot.ts`, where the rest of the shell talk lives: the
 * bar is a component and a component may not reach up out of its own directory. The shell fills
 * this in, the bar reads it, and the two arithmetic decisions in between are here where a test can
 * hold them.
 */

export interface Progress {
  /** How many are done, and how many there are. `of` is 0 until the survey has counted. */
  at: number
  of: number
  /** The repository that just landed. */
  path: string
  running: boolean
  /** Whether somebody asked it to stop. */
  stopped: boolean
}

export const NOTHING_RUNNING: Progress = {
  at: 0,
  of: 0,
  path: '',
  running: false,
  stopped: false,
}

/**
 * How full the bar is, or `null` while that cannot honestly be said.
 *
 * The survey counts the fleet before it reads the first repository, so there is a moment with
 * nought out of nought — and a bar at 100 % for a third of a second is a lie told in the one
 * place somebody is watching. A share over one cannot happen and is clamped anyway: the count
 * comes from another process, and a drawing that trusts a foreign number without a bound is a
 * drawing that can run off its own track.
 */
export function shareOf(progress: Progress | null): number | null {
  if (progress === null || progress.of <= 0) {
    return null
  }
  return Math.min(1, Math.max(0, progress.at / progress.of))
}

/**
 * The repository being read, short enough to stand in a bar.
 *
 * The last two parts of its path, which is `org/name` for everything under a root and still says
 * something for anything else. The whole path stays in the title — shortening is for the glance,
 * not for the record.
 */
export function readingOf(progress: Progress | null): string {
  const path = progress?.path ?? ''
  return path.split('/').filter(Boolean).slice(-2).join('/')
}
