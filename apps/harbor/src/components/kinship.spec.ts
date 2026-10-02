import { describe, expect, it } from 'vitest'

import { tell } from './kinship'

import type { ForgeStats, Lineage } from '@hafen/core'

function lineage(overrides: Partial<Lineage> = {}): Lineage {
  return {
    remote: 'ocelot',
    kinship: 'uncertain',
    onlyOrigin: 75,
    onlyRemote: 4,
    because: 'dieselbe Linie, 75 davor und 4 dahinter — Spiegel oder Herkunft sagt nur die Forge',
    ...overrides,
  }
}

function forge(forkedFrom: string | null): ForgeStats {
  return {
    slug: { host: 'github.com', owner: 'sender-fm', repo: 'Sender-Fm-…' },
    stars: 0,
    watchers: 0,
    forks: 0,
    issues: 0,
    pulls: 0,
    language: null,
    guard: null,
    forkedFrom,
  }
}

const UPSTREAM = 'git@github.com:Ocelot-Social-Community/Ocelot-Social-Deploy-Rebranding.git'
const PARENT = 'Ocelot-Social-Community/Ocelot-Social-Deploy-Rebranding'

describe(tell, () => {
  it('has nothing to say about a remote nobody judged', () => {
    expect(tell(null, forge(PARENT), UPSTREAM)).toBeNull()
  })

  /**
   * The case this was built for. Measured against the real API on 02.10.2026: four of the five
   * Ocelot rebrandings on this machine report exactly this parent.
   */
  it('lets the forge decide the direction git cannot', () => {
    const said = tell(lineage(), forge(PARENT), UPSTREAM)

    expect(said).toStrictEqual({
      word: 'Herkunft',
      mark: '^',
      because: `die Forge nennt ${PARENT} als Original`,
      fromForge: true,
    })
  })

  /** Without a forge reading the local word stands, and it admits what it does not know. */
  it('says ungewiss where nobody was asked', () => {
    const said = tell(lineage(), null, UPSTREAM)

    expect(said?.word).toBe('ungewiss')
    expect(said?.fromForge).toBe(false)
    expect(said?.because).toContain('75 davor')
  })

  /**
   * The forge overrules in one direction only. Two addresses holding identical commits is a
   * complete reading; GitHub calling this repository a fork of something does not make the other
   * address hold different work.
   */
  it('does not let a fork flag overrule a measured mirror', () => {
    const said = tell(
      lineage({ kinship: 'mirror', because: 'beide Adressen halten dieselben Commits' }),
      forge(PARENT),
      UPSTREAM,
    )

    expect(said?.word).toBe('Spiegel')
    expect(said?.fromForge).toBe(false)
  })

  it('does not let a fork flag overrule an absorbed history', () => {
    expect(tell(lineage({ kinship: 'absorbed' }), forge(PARENT), UPSTREAM)?.word).toBe('eingebaut')
  })

  /**
   * The parent is one repository, and the ship may have several remotes of the same line. Crediting
   * the name to whichever remote happened to be first would put "Herkunft" on the wrong address --
   * `ng` has two, and only one of them is cmangos.
   */
  it('only credits the remote the forge actually named', () => {
    const said = tell(
      lineage({ remote: 'nostalgeek' }),
      forge('cmangos/mangos-tbc'),
      'http://nostalgeek-serveur.com:3880/Lorh/ng.git',
    )

    expect(said?.word).toBe('ungewiss')
  })

  /** One repository has several spellings of one address, and all of them are the same remote. */
  it.each([
    ['git@github.com:Ocelot-Social-Community/Ocelot-Social-Deploy-Rebranding.git'],
    ['https://github.com/Ocelot-Social-Community/Ocelot-Social-Deploy-Rebranding'],
    ['https://github.com/Ocelot-Social-Community/Ocelot-Social-Deploy-Rebranding.git'],
    ['git@github.com:ocelot-social-community/ocelot-social-deploy-rebranding.git'],
  ])('recognises %s as the named parent', (url) => {
    expect(tell(lineage(), forge(PARENT), url)?.word).toBe('Herkunft')
  })

  /**
   * Compared as a whole path and never as "contains the name": `Ocelot-Social` is a prefix of
   * `Ocelot-Social-Deploy-Rebranding`, and a loose match would credit a fork to the wrong parent.
   */
  it('does not take a prefix of the name for the name', () => {
    const said = tell(lineage(), forge('Ocelot-Social-Community/Ocelot-Social'), UPSTREAM)

    expect(said?.word).toBe('ungewiss')
  })
})
