/**
 * Which repositories are the **same project**, measured.
 *
 * The harbour grouped by the directory an organisation happens to live in, which is a filing
 * decision and not a fact about the code. Measured over this fleet, that reading is right 89 times
 * out of 92 — and it misses every case worth seeing: eight repositories in six organisations that
 * share a root commit, a boilerplate mirrored into a product under a different owner, a submodule
 * carrying a repository that lies two directories away.
 *
 * Three ties, and each is something already written down rather than inferred:
 *
 * - **A shared root commit.** The strongest of the three: a fork, a rebranding, a deploy
 *   repository split off from its template all keep the commit their history begins at. Nothing
 *   survives a rename, a new owner and a new remote the way that hash does.
 * - **A remote that points at another ship.** Ocelot's `frontend_boilerplate_frontend` names
 *   `IT4Change/boilerplate-frontend`, which is a repository on this machine. Twenty such edges.
 * - **A submodule that points at another ship.** A hard dependency rather than a kinship, and it
 *   belongs here for the same reason: two repositories that have to move together should be drawn
 *   together.
 *
 * Shared *authors* was considered and left out. One person with ninety repositories is one
 * component — the signal says "I worked on both", which the whole fleet already has in common.
 *
 * No network, no forge, no guess list. `kin.ts` decides nothing about where a ship is drawn; it
 * answers which ships belong with which, and the layout asks.
 */

import { slugOf } from './stats'

import type { Ship } from './ship'

/** A repository as a key two spellings of one URL compare equal under. */
function addressOf(url: string): string | null {
  const slug = slugOf(url)
  return slug === null ? null : `${slug.host}/${slug.owner}/${slug.repo}`.toLowerCase()
}

/**
 * Every address this ship answers to.
 *
 * All her remotes and not only the origin: a mirror is still a name this repository has, and it
 * is the name the *other* side of an edge is likely to use. That asymmetry is the whole of the
 * boilerplate case — the product names the template, never the other way round.
 */
export function addressesOf(ship: Ship): readonly string[] {
  return ship.remotes.flatMap((remote) => {
    const address = addressOf(remote.url)
    return address === null ? [] : [address]
  })
}

/**
 * Disjoint sets over a fixed list, so the grouping cannot depend on the order edges arrive in.
 *
 * Union by the smaller index rather than by rank: the representative of a component is then
 * always its earliest member, which makes the output a function of the input and nothing else.
 * A layout that redrew itself because two edges were discovered in the other order would be a
 * layout nobody could trust to mean anything.
 */
function join(parent: number[], a: number, b: number): void {
  const find = (one: number): number => {
    let at = one
    while (parent[at] !== at) {
      at = parent[at] ?? at
    }
    return at
  }
  const one = find(a)
  const other = find(b)
  if (one === other) {
    return
  }
  const [low, high] = one < other ? [one, other] : [other, one]
  parent[high] = low
}

/** One family: the ships that belong together, and why they were put there. */
export interface Family {
  /** A stable name for the group — the lowest `org/name` in it, so two runs agree. */
  id: string
  ships: readonly Ship[]
}

/**
 * The fleet, split into families.
 *
 * Every ship is in exactly one, and a ship nothing ties to anything else is a family of her own —
 * which is the common case and must not be a special one: ninety-two ships come out as however
 * many families there are, not as "the related ones plus a leftover pile".
 *
 * Sorted, and the ships inside each family sorted too, because the harbour draws them in this
 * order and a drawing that reshuffles between two identical readings is a drawing that says
 * something it did not measure.
 */
export function familiesOf(ships: readonly Ship[]): readonly Family[] {
  const parent = ships.map((_, index) => index)

  const tieAll = (keys: ReadonlyMap<string, number[]>): void => {
    for (const members of keys.values()) {
      const first = members[0]
      if (first === undefined) {
        continue
      }
      for (const other of members) {
        join(parent, first, other)
      }
    }
  }

  // A root commit each ship begins at, and whoever else begins at the same one.
  const byRoot = new Map<string, number[]>()
  ships.forEach((ship, index) => {
    for (const root of ship.roots) {
      byRoot.set(root, [...(byRoot.get(root) ?? []), index])
    }
  })
  tieAll(byRoot)

  // And the two kinds of pointer: a remote or a submodule url that names a ship in this fleet.
  const owner = new Map<string, number>()
  ships.forEach((ship, index) => {
    for (const address of addressesOf(ship)) {
      // First wins, so an address two repositories both claim ties them rather than flipping.
      if (!owner.has(address)) {
        owner.set(address, index)
      }
    }
  })
  ships.forEach((ship, index) => {
    const pointers = [
      ...ship.remotes.map((remote) => remote.url),
      ...ship.submodules.map((tender) => tender.url),
    ]
    for (const url of pointers) {
      const address = url === null ? null : addressOf(url)
      const other = address === null ? undefined : owner.get(address)
      if (other !== undefined && other !== index) {
        join(parent, index, other)
      }
    }
  })

  const grouped = new Map<number, Ship[]>()
  ships.forEach((ship, index) => {
    let at = index
    while (parent[at] !== at) {
      at = parent[at] ?? at
    }
    grouped.set(at, [...(grouped.get(at) ?? []), ship])
  })

  const label = (ship: Ship): string => `${ship.org}/${ship.name}`
  return [...grouped.values()]
    .flatMap((members): readonly Family[] => {
      const ordered = [...members].sort((a, b) => label(a).localeCompare(label(b)))
      const first = ordered[0]
      // A component with nothing in it cannot happen — every one was built from a ship — and an
      // empty family would be a group the harbour reserves space for and draws nothing in.
      return first === undefined ? [] : [{ id: label(first), ships: ordered }]
    })
    .sort((a, b) => b.ships.length - a.ships.length || a.id.localeCompare(b.id))
}
