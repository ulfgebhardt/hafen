import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkForUpdate, installUpdate, readAnswer, runningVersion } from './update'

describe(readAnswer, () => {
  /** Der eine Fall, in dem jemand etwas tun kann. */
  it('liest eine verfuegbare Fassung', () => {
    expect(readAnswer({ available: true, version: '1.2.0', rid: 7 }, '1.1.0')).toStrictEqual({
      version: '1.2.0',
      current: '1.1.0',
      rid: 7,
    })
  })

  /**
   * Kein Update ist keine Nachricht. Und eine Antwort, deren Form nicht stimmt, muss dasselbe
   * sein wie keine — lieber nichts melden als etwas Erfundenes.
   */
  it('meldet nichts, wo es nichts zu melden gibt', () => {
    expect(readAnswer({ available: false }, '1.1.0')).toBeNull()
    expect(readAnswer(null, '1.1.0')).toBeNull()
    expect(readAnswer('irgendwas', '1.1.0')).toBeNull()
    expect(readAnswer({ available: true }, '1.1.0')).toBeNull()
    expect(readAnswer({ available: true, version: '1.2.0' }, '1.1.0')).toBeNull()
  })
})

describe(checkForUpdate, () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fragt das Plugin und gibt weiter, was es sagt', async () => {
    const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
      async () => Promise.resolve({ available: true, version: '2.0.0', rid: 3 }),
    )
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke })

    await expect(checkForUpdate('1.0.0')).resolves.toStrictEqual({
      version: '2.0.0',
      current: '1.0.0',
      rid: 3,
    })
    expect(invoke).toHaveBeenCalledWith('plugin:updater|check', {})
  })

  /**
   * Hier wird geschluckt, und das ist der Punkt: wer kein Netz hat, keinen GitHub erreicht oder
   * hinter einem Proxy sitzt, hat kein Problem mit dem Hafen. Eine rote Zeile dafuer waere eine
   * Meldung ueber etwas, das niemand hier beheben kann.
   */
  it('bleibt still, wenn das Nachsehen fehlschlaegt', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {
      invoke: async () => Promise.reject(new Error('kein Netz')),
    })

    await expect(checkForUpdate('1.0.0')).resolves.toBeNull()
  })

  it('bleibt still in einem Fenster ohne Huelle', async () => {
    await expect(checkForUpdate('1.0.0')).resolves.toBeNull()
  })
})

describe(installUpdate, () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stoesst den Download an', async () => {
    const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
      async () => Promise.resolve(null),
    )
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke })

    await expect(installUpdate(3)).resolves.toBeNull()
    expect(invoke).toHaveBeenCalledWith('plugin:updater|download_and_install', { rid: 3 })
  })

  /**
   * Hier wird **nicht** geschluckt: wer auf den Knopf gedrueckt hat, hat etwas erwartet, und ein
   * Knopf, der still nichts tut, ist schlimmer als keiner.
   */
  it('nennt den Grund, woran es scheiterte', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {
      invoke: async () => Promise.reject(new Error('Signatur passt nicht')),
    })

    await expect(installUpdate(3)).resolves.toContain('Signatur passt nicht')
  })

  it('sagt es, wo es nichts zu installieren gibt', async () => {
    await expect(installUpdate(3)).resolves.toContain('laesst sich nichts installieren')
  })
})

describe(runningVersion, () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * Gefragt, nicht eingebacken: bei einem Werkzeug, dessen einzige Aufgabe hier der Vergleich
   * zweier Versionen ist, darf die eigene nicht die Behauptung des Build-Schritts sein.
   */
  it('fragt das Binary nach seiner Fassung', async () => {
    const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
      async () => Promise.resolve('1.4.2'),
    )
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke })

    await expect(runningVersion()).resolves.toBe('1.4.2')
    expect(invoke).toHaveBeenCalledWith('plugin:app|version', {})
  })

  it('gibt ohne Fenster nichts zurueck, statt etwas zu erfinden', async () => {
    await expect(runningVersion()).resolves.toBe('')
  })

  it('nimmt eine Antwort, deren Form nicht stimmt, nicht fuer eine Version', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: async () => Promise.resolve(42) })

    await expect(runningVersion()).resolves.toBe('')
  })
})
