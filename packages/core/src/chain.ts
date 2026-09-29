/**
 * What a ship owes, and how each answer came about.
 *
 * A pure function over the catalog (`quest.ts`) and what was measured (`probe.ts`). Pure because
 * it is the part a human argues with: the same facts have to produce the same verdict in the
 * window, in the CLI and in a test, and a reading that touches the disk halfway through cannot
 * be held to that.
 *
 * **`notApplicable` is a full answer, not a special case of a gap.** That is the whole point of
 * the rebuild. Until 29.09.2026 a repository without a `package.json` fell silently out of the
 * scoring — `kind: 'other'` owed nothing — and a Nuxt mirror was held to the same four scripts
 * as a product. Both are the same imprecision from opposite sides, and both are gone once the
 * demand says who it applies to and the measurement says whether it could look.
 */

import { runCheck } from './probe'
import { questCatalog } from './quest'

import type { ProbeResult, QuestFacts } from './probe'
import type { Quest, QuestChain } from './quest'

/**
 * The five answers a quest can give about one ship.
 *
 * `unmeasured` is the one that would be easiest to leave out and the one the rest of this
 * codebase would miss first: an agent outside tmux is not "waiting", a dock tmux cannot answer
 * about is not "free", and a Rust crate Werft cannot read is not "in violation". Folding it into
 * `violated` invents gaps; folding it into `notApplicable` drops a demand that does apply.
 *
 * `0081` adds a sixth, `exempt` — a human excusing this ship from a demand that does apply. It is
 * a decision and belongs in the register, which is why it is not here.
 */
export type QuestVerdict = 'met' | 'violated' | 'waiting' | 'unmeasured' | 'notApplicable'

export interface QuestResult {
  id: string
  chain: QuestChain
  title: string
  /** The demand's own reason, carried along so a verdict and its purpose are read together. */
  why: string
  verdict: QuestVerdict
  /** Prerequisites not yet met. Only ever filled for `waiting`. */
  waitingOn: readonly string[]
  /** One per check the quest names, in its order. */
  checks: readonly ProbeResult[]
  /** How this verdict came about, in one sentence. */
  reason: string
}

function list(values: readonly string[]): string {
  return values.join(', ')
}

/**
 * The verdict from the checks alone, once the quest is known to apply and to be unblocked.
 *
 * The order of the three tests is the claim this module makes: nothing answerable means nothing
 * was measured, one answered `false` means the demand is unmet, and silence from the rest does
 * not change that. A quest with no checks at all is `unmeasured` and never `met` — a demand
 * nobody can check is not a demand a ship has satisfied.
 */
function fromChecks(checks: readonly ProbeResult[]): Pick<QuestResult, 'verdict' | 'reason'> {
  const answered = checks.filter((check) => check.ok !== null)
  if (answered.length === 0) {
    return {
      verdict: 'unmeasured',
      reason:
        checks.length === 0
          ? 'die Quest nennt keine Prüfung'
          : `nichts davon ist hier messbar: ${list(checks.map((check) => check.evidence.found))}`,
    }
  }

  const failed = answered.filter((check) => check.ok === false)
  const open = checks.length - answered.length
  const unread = open === 0 ? '' : `, ${String(open)} nicht messbar`

  return failed.length === 0
    ? {
        verdict: 'met',
        reason: `${String(answered.length)} von ${String(checks.length)} Prüfungen erfüllt${unread}`,
      }
    : {
        verdict: 'violated',
        reason: `offen: ${list(failed.map((check) => check.evidence.question))}${unread}`,
      }
}

function evaluate(
  quest: Quest,
  facts: QuestFacts,
  prerequisites: readonly QuestResult[],
): QuestResult {
  const base = {
    id: quest.id,
    chain: quest.chain,
    title: quest.title,
    why: quest.why,
    waitingOn: [] as readonly string[],
    checks: [] as readonly ProbeResult[],
  }

  if (
    quest.appliesTo.length > 0 &&
    !quest.appliesTo.some((trait) => facts.traits.includes(trait))
  ) {
    return {
      ...base,
      verdict: 'notApplicable',
      reason: `gilt für ${list(quest.appliesTo)} — dieses Schiff ist ${
        facts.traits.length === 0 ? 'nichts davon' : list(facts.traits)
      }`,
    }
  }

  // A prerequisite that does not apply takes this one with it, and that is not the same as
  // waiting for it: `lint-standard` behind a `lint` a Rust crate does not owe is not a demand
  // that will arrive later, it is one that never applies here. Waiting would leave it in the
  // list forever, looking like work.
  const moot = prerequisites.filter((entry) => entry.verdict === 'notApplicable')
  if (moot.length > 0) {
    return {
      ...base,
      verdict: 'notApplicable',
      reason: `Voraussetzung ${list(moot.map((entry) => entry.id))} gilt hier nicht`,
    }
  }

  const waitingOn = prerequisites
    .filter((entry) => entry.verdict !== 'met')
    .map((entry) => entry.id)
  if (waitingOn.length > 0) {
    return {
      ...base,
      verdict: 'waiting',
      waitingOn,
      reason: `wartet auf ${list(waitingOn)}`,
    }
  }

  const checks = quest.checks.map((check) => runCheck(check, facts))
  return { ...base, checks, ...fromChecks(checks) }
}

/**
 * Every quest of the catalog against one ship, prerequisites first.
 *
 * A prerequisite naming a quest the catalog does not have is ignored rather than treated as
 * unmet — the same direction `openBlockers` takes with a typo in `blocked_by`, and for the same
 * reason: a promise nobody can look up must not freeze work, and loosening is the safe way for a
 * field a human writes by hand. A cycle is held to the opposite rule and comes out as `waiting`,
 * because two quests each waiting for the other are exactly what that word says.
 */
export function evaluateQuests(
  catalog: readonly Quest[],
  facts: QuestFacts,
): readonly QuestResult[] {
  const byId = new Map(catalog.map((quest) => [quest.id, quest]))
  const done = new Map<string, QuestResult>()
  const open = new Set<string>()

  const resolve = (quest: Quest): QuestResult => {
    const cached = done.get(quest.id)
    if (cached !== undefined) {
      return cached
    }
    open.add(quest.id)

    const prerequisites = quest.requires.flatMap((id) => {
      const required = byId.get(id)
      if (required === undefined) {
        return []
      }
      return open.has(id)
        ? [
            {
              ...evaluate(required, facts, []),
              verdict: 'waiting' as const,
              reason: 'Voraussetzungen im Kreis',
            },
          ]
        : [resolve(required)]
    })

    const result = evaluate(quest, facts, prerequisites)
    open.delete(quest.id)
    done.set(quest.id, result)
    return result
  }

  return questCatalog(catalog).map((quest) => resolve(quest))
}

/** The quests this ship owes and does not meet — the ones that are work. */
export function violatedQuests(results: readonly QuestResult[]): readonly QuestResult[] {
  return results.filter((result) => result.verdict === 'violated')
}

/**
 * The quests Werft cannot check itself, so the blind spot is named rather than left to grow.
 *
 * Concept section 4 asks for exactly this beside the manual art, and it is the reason
 * `unmeasured` is a verdict of its own: a list of demands whose unanswerable ones look met is a
 * list that reads better than the fleet it describes.
 */
export function unmeasuredQuests(results: readonly QuestResult[]): readonly QuestResult[] {
  return results.filter((result) => result.verdict === 'unmeasured')
}
