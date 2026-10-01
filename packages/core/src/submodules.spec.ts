import { describe, expect, it } from 'vitest'

import { parseSubmodules, strayTenders } from './submodules'

/** Three real lines, taken from this machine: in sync, out of sync, never initialised. */
const STATUS = [
  ' 1a2b3c4d0d6bc033827d95b8bbca275c58fddfc8 lib/bootstrap3 (heads/v3)',
  '+2b3c4d5e253bf52d1b055cc2591ff912f329f2a2 api (1.0.3-3-g5b2c04c)',
  '-3c4d5e6fb4aa5411d7ec9ce4d629257ba2373d82 inspector',
].join('\n')

describe(parseSubmodules, () => {
  /** The leading character is the whole reading, and all three of them occur out there. */
  it('reads the state off the first character of each line', () => {
    expect(parseSubmodules(STATUS)).toStrictEqual([
      { path: 'lib/bootstrap3', state: 'aboard', at: '1a2b3c4d', url: null },
      { path: 'api', state: 'adrift', at: '2b3c4d5e', url: null },
      { path: 'inspector', state: 'missing', at: '3c4d5e6f', url: null },
    ])
  })

  /**
   * `U` is what git prints for a merge conflict inside a submodule. Read as adrift rather than
   * dropped: it is certainly not in sync, and a carried repository that vanished from the reading
   * because of an unexpected first byte would be the worse answer.
   */
  it('calls a state it does not know adrift rather than losing the boat', () => {
    const [one] = parseSubmodules('U1111111111111111111111111111111111111111 konflikt')

    expect(one?.state).toBe('adrift')
    expect(one?.path).toBe('konflikt')
  })

  /** A repository git could not answer about is not a repository carrying nothing. */
  it('says nothing where git said nothing', () => {
    expect(parseSubmodules(null)).toStrictEqual([])
    expect(parseSubmodules('')).toStrictEqual([])
  })

  it('drops a line with no path rather than inventing one', () => {
    expect(parseSubmodules(' 1a2b3c4d\n\n')).toStrictEqual([])
  })
})

describe(strayTenders, () => {
  /**
   * The two states worth acting on: a `-` looks present in `.gitmodules` and is not there at all,
   * a `+` is how a submodule bump gets lost on the way to a commit.
   */
  it('offers what is not where the parent says it is', () => {
    expect(strayTenders(parseSubmodules(STATUS)).map((one) => one.path)).toStrictEqual([
      'api',
      'inspector',
    ])
  })

  it('offers nothing where everything is aboard', () => {
    expect(strayTenders(parseSubmodules(' aaaaaaaa lib (v1)'))).toStrictEqual([])
  })
})
