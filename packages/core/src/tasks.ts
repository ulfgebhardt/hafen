/**
 * What a person could do next, and what it would be worth.
 *
 * Derived, never kept: every task here is the readable form of a measurement that already exists
 * — a stash entry, an unpushed commit, a violated quest. Nothing is stored, nothing is ticked
 * off, and a task disappears the moment its measurement does. That is the whole design: a to-do
 * list has to be maintained and goes stale; this cannot, because it is not a list, it is a
 * reading.
 *
 * **No task offers to do anything.** The harbour measures and draws; the work happens in a
 * terminal, by hand. What is offered is the command to type, so nobody has to remember the
 * incantation — and the number beside it, so "which of these first" has an answer.
 *
 * The numbers are computed from the weights in `points.ts` and never typed in twice. A task that
 * claimed a value the scoring does not actually award would be worse than no number at all.
 */

import { bindingQuests } from './chain'
import { QUEST_POINTS, scoreWork, SHIPSHAPE_POINTS } from './points'
import { NO_WORK } from './work'

import type { Ship } from './ship'

/**
 * What kind of work a task is, which is also what decides its order.
 *
 * `blocked` first: a conflict is not untidiness, it is a stop, and everything else on that
 * repository is waiting behind it.
 */
export type TaskKind = 'blocked' | 'tidy' | 'deliver' | 'contract'

export interface Task {
  kind: TaskKind
  /** What to do, in one line. */
  title: string
  /** Why it is worth doing — the sentence behind the number. */
  why: string
  /** What to type. Never run from here: the harbour does nothing. */
  command: string
  /** Points this would add to the project score. */
  project: number
  /** Points this would add to the personal score. */
  personal: number
  /** The quest this closes, where it closes one. */
  quest?: string
}

/** The order tasks are offered in: what blocks, then what is quick, then what lasts. */
const KIND_ORDER: Record<TaskKind, number> = {
  blocked: 0,
  tidy: 1,
  deliver: 2,
  contract: 3,
}

/**
 * What the repository itself is asking for: a conflict, a stash, uncommitted work, an unpushed
 * commit.
 *
 * Apart from `questTasks` because the two belong in different places on screen, and that is the
 * fix for a real duplication: the sheet listed every violated quest as a task and then listed the
 * same quests again underneath with their evidence. The same sentence twice, and the second time
 * with more behind it.
 *
 * A thing belongs where its evidence is. These have none beyond the measurement in their own
 * title, so they get a list; a quest has checks, sources and findings, so it belongs at its own
 * row — which now carries what it is worth and what to type, rather than having a thinner copy of
 * itself printed above.
 */
export function localTasks(ship: Ship): readonly Task[] {
  const tasks: Task[] = []
  /*
   * What tidying this repository is worth, and it is `SHIPSHAPE_POINTS` because that is exactly
   * what `fleetPoints` awards when a tree comes out clean. A task may not promise what the
   * scoring does not pay — so the number is taken from there and never typed in twice.
   *
   * The same value on each of the untidiness tasks, and that is honest rather than lazy: the
   * award is for the tree *being* clean, so it is paid once however many of these it took.
   */
  const tidy = SHIPSHAPE_POINTS

  if (ship.working.conflicted > 0) {
    tasks.push({
      kind: 'blocked',
      title: `${String(ship.working.conflicted)} Konflikt${ship.working.conflicted === 1 ? '' : 'e'} auflösen`,
      why: 'Hier geht nichts weiter, bis ein Mensch entscheidet — kein Commit, kein Push, kein Lauf.',
      command: 'git status && git mergetool',
      project: 0,
      personal: tidy,
    })
  }

  if (ship.stash > 0) {
    tasks.push({
      kind: 'tidy',
      title: `${String(ship.stash)} Stash-Eintr${ship.stash === 1 ? 'ag' : 'äge'} auflösen`,
      why: 'Diese Arbeit liegt in keinem Commit und in keinem Baum. Geht sie verloren, merkt es niemand.',
      command: "git stash list --format='%H %gs'",
      project: 0,
      personal: tidy,
    })
  }

  if (ship.dirty && ship.working.conflicted === 0) {
    const open = ship.working.staged + ship.working.unstaged + ship.working.untracked
    tasks.push({
      kind: 'tidy',
      title: `${String(open)} offene Änderung${open === 1 ? '' : 'en'} committen`,
      why: 'Ein Baum mit offener Arbeit ist einer, den niemand einfach weglegen kann.',
      command: 'git add -p && git commit',
      project: 0,
      personal: tidy,
    })
  }

  const ahead = ship.ahead ?? 0
  if (ahead > 0) {
    tasks.push({
      kind: 'deliver',
      title: `${String(ahead)} Commit${ahead === 1 ? '' : 's'} pushen`,
      why: 'Fertig, aber nur auf dieser Maschine — und damit für alle anderen nicht vorhanden.',
      command: 'git push',
      project: 0,
      personal: tidy,
    })
  }

  return [...tasks].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.personal - a.personal,
  )
}

/**
 * One task per violated demand of the fleet.
 *
 * Only `violated`. A quest that is waiting has a prerequisite somebody else owes, and one nothing
 * could measure is not a gap — offering either as work to do would invent it.
 */
export function questTasks(ship: Ship): readonly Task[] {
  return bindingQuests(ship.quests)
    .filter((quest) => quest.verdict === 'violated')
    .map((quest) => ({
      kind: 'contract' as const,
      title: quest.title,
      why: quest.why === '' ? quest.reason : quest.why,
      command: `hafen hafen --evidenz  # ${quest.id}`,
      project: 0,
      personal: QUEST_POINTS,
      quest: quest.id,
    }))
}

/**
 * Everything this repository is currently asking for, in one list.
 *
 * Read fresh every time from the ship's own measurements. A repository in good order produces an
 * empty list, and that is the intended end state rather than an error.
 *
 * Both halves, because the fleet-wide reading needs them together — "what should I do next"
 * spans both kinds. The *sheet* is the place that splits them, and only because the quests are
 * already on it with their evidence.
 */
export function tasksFor(ship: Ship): readonly Task[] {
  return [...localTasks(ship), ...questTasks(ship)].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.personal - a.personal,
  )
}

/** What one quest's task is worth, for the row that offers it. */
export function taskForQuest(ship: Ship, id: string): Task | null {
  return questTasks(ship).find((task) => task.quest === id) ?? null
}

/**
 * The whole fleet's tasks, worth first.
 *
 * With the ship each belongs to, because a task without its repository is an instruction nobody
 * can carry out.
 */
export interface FleetTask extends Task {
  ship: Ship
}

export function tasksAcross(ships: readonly Ship[]): readonly FleetTask[] {
  return ships
    .flatMap((ship) => tasksFor(ship).map((task) => ({ ...task, ship })))
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        b.personal - a.personal ||
        `${a.ship.org}/${a.ship.name}`.localeCompare(`${b.ship.org}/${b.ship.name}`),
    )
}

/** What the open tasks of a fleet would be worth if every one of them were done. */
export function tasksValue(ships: readonly Ship[]): { project: number; personal: number } {
  return tasksAcross(ships).reduce(
    (sum, task) => ({
      project: sum.project + task.project,
      personal: sum.personal + task.personal,
    }),
    { project: 0, personal: 0 },
  )
}

/**
 * What one more conventional commit here would be worth to the project score.
 *
 * Offered as a number rather than a task, because "write a commit" is not something a tool gets
 * to suggest — but seeing what a `feat:` is worth is the thing that makes the weighting legible
 * at all.
 */
export function commitValue(): { feat: number; fix: number; unscored: number } {
  return {
    feat: scoreWork({ ...NO_WORK, byKind: { feat: 1 } }),
    fix: scoreWork({ ...NO_WORK, byKind: { fix: 1 } }),
    unscored: scoreWork({ ...NO_WORK, unscored: 1 }),
  }
}
