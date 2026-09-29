import { describe, expect, it } from 'vitest'

import { EMPTY_REGISTER, parseRegister, renderRegister, setArchived, setEnlisted } from './register'

describe(parseRegister, () => {
  it('reads both sections', () => {
    const text = [
      '# Schiffsregister',
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
    })
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

    expect(parseRegister(text)).toStrictEqual({ archived: ['/repos/org/alt'], enlisted: [] })
  })

  it('reads an empty placeholder as an empty list', () => {
    expect(parseRegister('## Archiviert\n\n_leer_\n')).toStrictEqual(EMPTY_REGISTER)
  })

  it('treats a missing file as an empty register', () => {
    expect(parseRegister('')).toStrictEqual(EMPTY_REGISTER)
  })
})

describe(renderRegister, () => {
  it('survives a round trip', () => {
    const register = { archived: ['/b', '/a'], enlisted: ['/games/wow'] }

    expect(parseRegister(renderRegister(register))).toStrictEqual({
      archived: ['/a', '/b'],
      enlisted: ['/games/wow'],
    })
  })

  it('sorts, so two edits do not fight over line order', () => {
    const text = renderRegister({ archived: ['/z', '/a'], enlisted: [] })

    expect(text.indexOf('/a')).toBeLessThan(text.indexOf('/z'))
  })

  it('writes a file that is still readable when both lists are empty', () => {
    expect(parseRegister(renderRegister(EMPTY_REGISTER))).toStrictEqual(EMPTY_REGISTER)
  })
})

describe(setArchived, () => {
  it('archives and un-archives without touching the other list', () => {
    const once = setArchived({ archived: [], enlisted: ['/games/wow'] }, '/repos/org/alt', true)

    expect(once).toStrictEqual({ archived: ['/repos/org/alt'], enlisted: ['/games/wow'] })
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
