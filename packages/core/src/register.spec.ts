import { describe, expect, it } from 'vitest'

import {
  EMPTY_REGISTER,
  forgesOf,
  parseRegister,
  renderRegister,
  rootsFor,
  setArchived,
  setEnlisted,
  setRoot,
} from './register'

describe(parseRegister, () => {
  it('reads every section', () => {
    const text = [
      '# Schiffsregister',
      '',
      '## Wurzeln',
      '',
      '- /home/wer/Projekte',
      '',
      '## Archiviert',
      '',
      '- /repos/org/alt',
      '- /repos/org/tot',
      '',
      '## Aufgenommen',
      '',
      '- /games/wow',
      '',
    ].join('\n')

    expect(parseRegister(text)).toStrictEqual({
      archived: ['/repos/org/alt', '/repos/org/tot'],
      enlisted: ['/games/wow'],
      roots: ['/home/wer/Projekte'],
      forges: [],
    })
  })

  /**
   * An older register has no roots section, and that is **no roots** rather than a broken file.
   *
   * Which is also the honest answer: a machine nobody has asked where its projects are has not
   * said, and an empty harbour saying so beats a full one built out of `~/Projects`.
   */
  it('takes a register written before roots existed as having none', () => {
    const text = ['## Archiviert', '', '- /repos/org/alt', ''].join('\n')

    expect(parseRegister(text).roots).toStrictEqual([])
  })

  it('ignores prose and unknown sections', () => {
    // The file is meant to be read and reviewed, so it carries explanation around the lists.
    const text = [
      'Von Werft gepflegt.',
      '- das ist keine Liste, sondern ein Satz',
      '',
      '## Irgendwas',
      '',
      '- /nicht/uebernehmen',
      '',
      '## Archiviert',
      '',
      '- /repos/org/alt',
    ].join('\n')

    expect(parseRegister(text)).toStrictEqual({
      archived: ['/repos/org/alt'],
      enlisted: [],
      roots: [],
      forges: [],
    })
  })

  it('reads an empty placeholder as an empty list', () => {
    expect(parseRegister('## Archiviert\n\n_leer_\n')).toStrictEqual(EMPTY_REGISTER)
  })

  it('treats a missing file as an empty register', () => {
    expect(parseRegister('')).toStrictEqual(EMPTY_REGISTER)
  })
})

describe('forges in the register', () => {
  /** A Gitea is one machine's fact: named by its human, never shipped in the code. */
  it('reads a host and what runs there', () => {
    const text = '## Forges\n\n- git.example.org gitea\n- code.example.org github\n'

    expect(parseRegister(text).forges).toStrictEqual([
      { host: 'git.example.org', forge: 'gitea' },
      { host: 'code.example.org', forge: 'github' },
    ])
  })

  /** `unknown` is what an unnamed host already is, so a typo costs what no line would. */
  it('drops a line that names no kind it knows, rather than guess', () => {
    const text = '## Forges\n\n- git.example.org gittea\n- bare.example.org\n'

    expect(parseRegister(text).forges).toStrictEqual([])
  })

  it("puts the shipped forge first and the machine's after it", () => {
    const register = {
      ...EMPTY_REGISTER,
      forges: [{ host: 'git.example.org', forge: 'gitea' as const }],
    }

    expect(forgesOf(register).map((one) => one.host)).toStrictEqual([
      'github.com',
      'git.example.org',
    ])
  })
})

describe(rootsFor, () => {
  /** What was typed on purpose leads; a stored decision that could beat it would make it no override. */
  it('takes what was given over what is stored', () => {
    expect(rootsFor(['/given'], { ...EMPTY_REGISTER, roots: ['/stored'] })).toStrictEqual([
      '/given',
    ])
    expect(rootsFor([], { ...EMPTY_REGISTER, roots: ['/stored'] })).toStrictEqual(['/stored'])
  })

  /** Neither, and the answer is nothing — not one person's convention, not a guess list. */
  it('answers nothing when nobody was asked', () => {
    expect(rootsFor([], EMPTY_REGISTER)).toStrictEqual([])
  })
})

describe(renderRegister, () => {
  it('survives a round trip', () => {
    const register = {
      archived: ['/b', '/a'],
      enlisted: ['/games/wow'],
      roots: ['/home/wer/src'],
      forges: [{ host: 'git.example.org', forge: 'gitea' as const }],
    }

    expect(parseRegister(renderRegister(register))).toStrictEqual({
      archived: ['/a', '/b'],
      enlisted: ['/games/wow'],
      roots: ['/home/wer/src'],
      forges: [{ host: 'git.example.org', forge: 'gitea' }],
    })
  })

  it('sorts, so two edits do not fight over line order', () => {
    const text = renderRegister({ archived: ['/z', '/a'], enlisted: [], roots: [], forges: [] })

    expect(text.indexOf('/a')).toBeLessThan(text.indexOf('/z'))
  })

  it('writes a file that is still readable when both lists are empty', () => {
    expect(parseRegister(renderRegister(EMPTY_REGISTER))).toStrictEqual(EMPTY_REGISTER)
  })
})

describe(setArchived, () => {
  it('archives and un-archives without touching the other list', () => {
    const once = setArchived(
      { archived: [], enlisted: ['/games/wow'], roots: [], forges: [] },
      '/repos/org/alt',
      true,
    )

    expect(once).toStrictEqual({
      archived: ['/repos/org/alt'],
      enlisted: ['/games/wow'],
      roots: [],
      forges: [],
    })
    expect(setArchived(once, '/repos/org/alt', false).archived).toStrictEqual([])
  })

  it('does not list the same ship twice', () => {
    const once = setArchived(EMPTY_REGISTER, '/a', true)

    expect(setArchived(once, '/a', true).archived).toStrictEqual(['/a'])
  })
})

describe(setEnlisted, () => {
  it('takes a directory into the fleet and lets it go again', () => {
    const once = setEnlisted(EMPTY_REGISTER, '/games/wow', true)

    expect(once.enlisted).toStrictEqual(['/games/wow'])
    expect(setEnlisted(once, '/games/wow', false).enlisted).toStrictEqual([])
  })
})

describe(setRoot, () => {
  /**
   * Where the projects are is the third thing nothing on a machine says.
   *
   * The CLI took `$HAFEN_ROOT` or two directories of one person's own convention, which is
   * useless to anybody else — and a guess list of `~/Projects`, `~/src`, `~/code` would trade a
   * measurement for a better-looking assumption. Asking once *is* the measurement.
   */
  it('takes a directory on as a place to look, and drops it again', () => {
    const once = setRoot(EMPTY_REGISTER, '/home/wer/Projekte', true)

    expect(once.roots).toStrictEqual(['/home/wer/Projekte'])
    expect(setRoot(once, '/home/wer/Projekte', false).roots).toStrictEqual([])
  })

  it('names a directory once however often it is given', () => {
    const twice = setRoot(setRoot(EMPTY_REGISTER, '/src', true), '/src', true)

    expect(twice.roots).toStrictEqual(['/src'])
  })

  it('leaves the other two lists where they were', () => {
    const register = { archived: ['/alt'], enlisted: ['/games/wow'], roots: [], forges: [] }

    expect(setRoot(register, '/src', true)).toStrictEqual({
      archived: ['/alt'],
      enlisted: ['/games/wow'],
      roots: ['/src'],
      forges: [],
    })
  })
})
