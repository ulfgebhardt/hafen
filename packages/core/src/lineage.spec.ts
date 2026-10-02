import { describe, expect, it } from 'vitest'

import { judge, lineageOf, measureLineage } from './lineage'
import { mockPorts } from './mock'

import type { Remote } from './ship'

function remote(name: string, url: string): Remote {
  return { name, url, forge: 'github' }
}

const ORIGIN = remote(
  'origin',
  'git@github.com:sender-fm/Sender-Fm-Ocelot-Social-Deploy-Rebranding.git',
)
const SHIP = '/repos/sender-fm/Sender-Fm-Ocelot-Social-Deploy-Rebranding'

/** The two counts and the roots, for one further remote, as `measureLineage` asks for them. */
function readings(
  rem: string,
  given: { onlyOrigin?: string; onlyRemote?: string; roots?: string; line?: string },
) {
  return {
    'git rev-list --max-parents=0 --first-parent refs/remotes/origin/HEAD': {
      stdout: given.line ?? 'aaaa\n',
    },
    [`git rev-list --count --remotes=origin --not --remotes=${rem}`]: {
      stdout: given.onlyOrigin ?? '0\n',
    },
    [`git rev-list --count --remotes=${rem} --not --remotes=origin`]: {
      stdout: given.onlyRemote ?? '0\n',
    },
    [`git rev-list --max-parents=0 --remotes=${rem}`]: { stdout: given.roots ?? 'aaaa\n' },
  }
}

describe(judge, () => {
  /**
   * Costs nothing and comes first. `IT4Change/boilerplate-frontend` carries origin's own url twice
   * -- a submodule helper added it -- and counting there measured the refspecs of two remotes
   * against each other and reported 30 commits between a repository and itself.
   */
  it('calls one address under two names a mirror without counting', () => {
    expect(
      judge({ sameUrl: true, lineRoot: null, remoteRoots: [], onlyOrigin: null, onlyRemote: null }),
    ).toStrictEqual({ kinship: 'mirror', because: 'dieselbe Adresse wie origin' })
  })

  /** Both zero is the one reading that *is* a mirror: two addresses, the same commits. */
  it('calls two addresses with the same commits a mirror', () => {
    expect(
      judge({
        sameUrl: false,
        lineRoot: 'aaaa',
        remoteRoots: ['aaaa'],
        onlyOrigin: 0,
        onlyRemote: 0,
      }).kinship,
    ).toBe('mirror')
  })

  /**
   * Measured on `Ocelot-Social`, which reaches fifteen root commits -- fourteen of them from
   * subtrees merged in over the years. `styleguide` and `boilerplate-frontend` are histories this
   * repository swallowed, not places its work came from, and calling them either mirror or origin
   * would be wrong in both directions.
   */
  it('calls a foreign root an absorbed history', () => {
    expect(
      judge({
        sameUrl: false,
        lineRoot: '345e254a',
        remoteRoots: ['783ab8a6', '3cdd06b2'],
        onlyOrigin: 17855,
        onlyRemote: 26,
      }),
    ).toStrictEqual({
      kinship: 'absorbed',
      because: 'fremde Wurzel — diese Geschichte wurde hereingemischt',
    })
  })

  /**
   * The whole reason there are three verdicts. `sender-fm` is 75 commits ahead of `ocelot/master`
   * and `u-vote.eu` is 7 ahead of its abandoned gogs address -- and locally those are the same
   * reading. Only the forge knows which is which, so this does not guess.
   */
  it('refuses to call the same lineage either mirror or origin', () => {
    const said = judge({
      sameUrl: false,
      lineRoot: '0eb108a2',
      remoteRoots: ['0eb108a2'],
      onlyOrigin: 75,
      onlyRemote: 4,
    })

    expect(said.kinship).toBe('uncertain')
    expect(said.because).toContain('75 davor')
    expect(said.because).toContain('4 dahinter')
    expect(said.because).toContain('Forge')
  })

  /**
   * The order these two are asked in was a bug the fleet caught: `wow-toc-parser` and
   * `mangos_zero_script_acid` lie on a Gitea that sets no `origin/HEAD`, and asking for the
   * lineage root first turned two certain mirrors into "not measurable". A missing extra reading
   * must not overrule one that is already conclusive.
   */
  it('still calls identical addresses a mirror without origins lineage root', () => {
    expect(
      judge({
        sameUrl: false,
        lineRoot: null,
        remoteRoots: ['f8c7ae57'],
        onlyOrigin: 0,
        onlyRemote: 0,
      }).kinship,
    ).toBe('mirror')
  })

  /**
   * Measured on `webcraftmedia/jahrweiser`: the default branch is `main` and no ref for it exists
   * here, so the lineage root came back empty. That is "not measurable" and not "no shared root"
   * -- two different sentences, and only one of them is true.
   */
  it('says when origins own lineage was never fetched', () => {
    expect(
      judge({
        sameUrl: false,
        lineRoot: null,
        remoteRoots: ['079d2ecc'],
        onlyOrigin: 976,
        onlyRemote: 0,
      }),
    ).toStrictEqual({ kinship: 'uncertain', because: 'origins Hauptlinie ist hier nicht gelesen' })
  })

  it('says when nothing of the remote is here at all', () => {
    expect(
      judge({
        sameUrl: false,
        lineRoot: 'aaaa',
        remoteRoots: [],
        onlyOrigin: 12,
        onlyRemote: 0,
      }),
    ).toStrictEqual({ kinship: 'uncertain', because: 'von diesem Remote liegt hier nichts' })
  })
})

describe(measureLineage, () => {
  /**
   * 77 of 92 repositories on this fleet have only `origin`. Paying four git calls each to answer a
   * question with no second side to it is what `treesWith` was built to stop.
   */
  it('asks nothing where there is only one remote', async () => {
    const ports = mockPorts()

    await expect(measureLineage(ports, SHIP, [ORIGIN])).resolves.toStrictEqual([])
  })

  /** Without `origin` there is nothing to compare against, and a guess would be worse than none. */
  it('asks nothing where there is no origin', async () => {
    const ports = mockPorts()

    await expect(
      measureLineage(ports, SHIP, [remote('webcraft', 'gogs@git.webcraft-media.de:x/y.git')]),
    ).resolves.toStrictEqual([])
  })

  /**
   * Handed in rather than guessed: `refs/remotes/origin/HEAD` is a symref many origins never set,
   * and the survey has already worked the leading branch out.
   */
  it('asks the branch the survey measured, not a symref that may not exist', async () => {
    const ports = mockPorts({
      commands: {
        'git rev-list --max-parents=0 --first-parent refs/remotes/origin/master': {
          stdout: 'f8c7ae57\n',
        },
        'git rev-list --count --remotes=origin --not --remotes=github': { stdout: '3\n' },
        'git rev-list --count --remotes=github --not --remotes=origin': { stdout: '1\n' },
        'git rev-list --max-parents=0 --remotes=github': { stdout: 'f8c7ae57\n' },
      },
    })

    const said = await measureLineage(
      ports,
      SHIP,
      [ORIGIN, remote('github', 'git@github.com:Mojotrollz/wow-toc-parser.git')],
      'master',
    )

    expect(said[0]).toMatchObject({ kinship: 'uncertain', onlyOrigin: 3, onlyRemote: 1 })
  })

  it('reads the counts and carries them beside the word', async () => {
    const ports = mockPorts({
      commands: readings('ocelot', {
        line: '0eb108a2\n',
        roots: '0eb108a2\n',
        onlyOrigin: '75\n',
        onlyRemote: '4\n',
      }),
    })

    const said = await measureLineage(ports, SHIP, [
      ORIGIN,
      remote(
        'ocelot',
        'git@github.com:Ocelot-Social-Community/Ocelot-Social-Deploy-Rebranding.git',
      ),
    ])

    expect(said).toHaveLength(1)
    expect(said[0]).toMatchObject({
      remote: 'ocelot',
      kinship: 'uncertain',
      onlyOrigin: 75,
      onlyRemote: 4,
    })
  })

  /**
   * A count git did not give is `null` and never a zero: two zeroes are the one reading that means
   * "mirror", so a failed call that produced them would promote an unknown into a claim.
   */
  it('does not read a failed count as a zero', async () => {
    const ports = mockPorts({
      commands: {
        'git rev-list --max-parents=0 --first-parent refs/remotes/origin/HEAD': {
          stdout: 'aaaa\n',
        },
        'git rev-list --max-parents=0 --remotes=webcraft': { stdout: 'aaaa\n' },
      },
    })

    const said = await measureLineage(ports, SHIP, [
      ORIGIN,
      remote('webcraft', 'gogs@git.webcraft-media.de:webcraft/host_uvote.git'),
    ])

    expect(said[0]).toMatchObject({ kinship: 'uncertain', onlyOrigin: null, onlyRemote: null })
  })

  it('judges every further remote, not only the first', async () => {
    const ports = mockPorts({
      commands: {
        ...readings('mangos-tbc', {
          line: 'ea63fbe1\n',
          roots: 'ea63fbe1\n',
          onlyOrigin: '10099\n',
          onlyRemote: '12350\n',
        }),
        ...readings('nostalgeek', {
          line: 'ea63fbe1\n',
          roots: 'ea63fbe1\n',
          onlyOrigin: '46\n',
          onlyRemote: '6\n',
        }),
      },
    })

    const said = await measureLineage(ports, '/repos/ulfgebhardt/ng', [
      remote('origin', 'git@git.it4c.dev:ulfgebhardt/ng.git'),
      remote('mangos-tbc', 'git@github.com:cmangos/mangos-tbc.git'),
      remote('nostalgeek', 'http://nostalgeek-serveur.com:3880/Lorh/ng.git'),
    ])

    expect(said.map((entry) => entry.remote)).toStrictEqual(['mangos-tbc', 'nostalgeek'])
    expect(lineageOf(said, 'nostalgeek')?.onlyRemote).toBe(6)
  })
})

describe(lineageOf, () => {
  it('has no opinion about a remote nobody judged', () => {
    expect(lineageOf([], 'ocelot')).toBeNull()
  })
})
