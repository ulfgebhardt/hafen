/**
 * The words a reader sees for what a second remote is, and the one the forge adds.
 *
 * Here and not in the template because the sentence has two sources with two ages: `lineage` is a
 * reading of this repository, `forkedFrom` is a reading of the forge taken seventeen seconds of
 * network later. The template draws one line out of them, and this file is where that join can be
 * tested — the same cut as `fleet.ts` against `scene.ts`.
 */

import type { Kinship, Lineage, ForgeStats } from '@hafen/core'

/** The German word for each verdict. `uncertain` gets a word too — a blank is not an answer. */
const WORD: Record<Kinship, string> = {
  mirror: 'Spiegel',
  absorbed: 'eingebaut',
  uncertain: 'ungewiss',
}

/** Filled, hatched, dashed — the same promise as the segments: never colour alone. */
const MARK: Record<Kinship, string> = {
  mirror: '=',
  absorbed: '+',
  uncertain: '~',
}

export interface Told {
  /** `Spiegel`, `eingebaut`, `ungewiss` — or `Herkunft` where the forge said so. */
  word: string
  mark: string
  /** What was measured, for the reader who does not take a word on trust. */
  because: string
  /** Whether the forge decided this rather than the repository. */
  fromForge: boolean
}

/**
 * Whether a remote url is the `owner/name` the forge named.
 *
 * Compared as a path and not as a whole string, because one repository has several spellings of
 * one address: `git@github.com:Org/Repo.git`, `https://github.com/Org/Repo`, with and without the
 * suffix. Case is ignored — GitHub does not distinguish owners by it, and `Kombuese` against
 * `kombuese` is the same account twice in this fleet's own remotes.
 *
 * Deliberately not just "contains the name": `leuchtturm` would then match
 * `leuchtturm-verbund/leuchtturm-deploy-rebranding`, and the sheet would credit a fork to
 * the wrong parent.
 */
function mentions(url: string, parent: string): boolean {
  const path = url
    .toLowerCase()
    .replace(/\.git$/u, '')
    .replace(/^[a-z+]+:\/\/[^/]+\//u, '')
    .replace(/^[^@]+@[^:]+:/u, '')
  return path === parent.toLowerCase()
}

/**
 * What to write beside one remote.
 *
 * **The forge overrules the local reading, and only in the one direction it can.** `uncertain`
 * means "the same lineage, and git cannot say which way" — exactly the question `isFork { parent }`
 * answers, so a confirmed parent turns it into `Herkunft`. A `mirror` is **not** overruled: two
 * addresses holding identical commits is a complete reading, and GitHub calling one of them a fork
 * does not make the other hold different work.
 *
 * Nothing is invented where the forge was not asked: without a reading the local word stands, and
 * it says `ungewiss` rather than pretending to a direction.
 */
export function tell(lineage: Lineage | null, stats: ForgeStats | null, url: string): Told | null {
  if (lineage === null) {
    return null
  }
  const parent = stats?.forkedFrom ?? null
  if (lineage.kinship === 'uncertain' && parent !== null && mentions(url, parent)) {
    return {
      word: 'Herkunft',
      mark: '^',
      because: `die Forge nennt ${parent} als Original`,
      fromForge: true,
    }
  }
  return {
    word: WORD[lineage.kinship],
    mark: MARK[lineage.kinship],
    because: lineage.because,
    fromForge: false,
  }
}
