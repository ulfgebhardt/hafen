import { describe, expect, it } from 'vitest'

import { NO_ROOTS, rootRows } from './roots'
import { ship } from './testing'

const FLEET = [
  ship({ path: '/home/wer/src/a' }),
  ship({ path: '/home/wer/src/org/b' }),
  ship({ path: '/home/wer/srcalt/c' }),
  ship({ path: '/mnt/kunden/d' }),
]

describe(rootRows, () => {
  it('counts the ships under each root', () => {
    const rows = rootRows(
      {
        readings: [
          { path: '/home/wer/src', real: '/home/wer/src' },
          { path: '/mnt/kunden', real: '/mnt/kunden' },
        ],
        fixed: false,
      },
      FLEET,
    )

    expect(rows).toStrictEqual([
      { path: '/home/wer/src', ships: 2 },
      { path: '/mnt/kunden', ships: 1 },
    ])
  })

  /** A sibling that merely begins with the same letters is not under it. */
  it('counts by directory, not by prefix', () => {
    const [row] = rootRows(
      { readings: [{ path: '/home/wer/src', real: '/home/wer/src' }], fixed: false },
      [ship({ path: '/home/wer/srcalt/c' })],
    )

    expect(row?.ships).toBe(0)
  })

  /** A repository picked by itself is its own root, and the ship under it is itself. */
  it('counts a root that is a repository', () => {
    const [row] = rootRows(
      { readings: [{ path: '/mnt/kunden/d', real: '/mnt/kunden/d' }], fixed: false },
      FLEET,
    )

    expect(row?.ships).toBe(1)
  })

  /** The survey resolves the ships' paths, so the root has to be compared resolved too. */
  it('counts under the resolved path of a linked root', () => {
    const [row] = rootRows(
      { readings: [{ path: '/home/wer/projekte', real: '/home/wer/src' }], fixed: false },
      FLEET,
    )

    expect(row).toStrictEqual({ path: '/home/wer/projekte', ships: 2 })
  })

  /** No directory is not "no ships": the one is a fault with a remedy, the other a fact. */
  it('says a dead root is not there instead of counting nothing', () => {
    const [row] = rootRows({ readings: [{ path: '/mnt/alt', real: null }], fixed: false }, FLEET)

    expect(row?.ships).toBeNull()
  })

  it('lists nothing where no root is known', () => {
    expect(rootRows(NO_ROOTS, FLEET)).toStrictEqual([])
  })
})
