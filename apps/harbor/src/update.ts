/**
 * Wie ein ausgeliefertes Binary an seine nächste Fassung kommt.
 *
 * Ohne das ist jede Version, die jemand geladen hat, die letzte, die er hat — ein Werkzeug, das
 * sich nicht erneuern kann, altert beim Nutzer und nicht beim Autor. Und die Flotte fordert genau
 * das von ihren Schiffen (`auslauf/aktualisierung`); von sich selbst zu fordern, was man von
 * anderen fordert, ist der Unterschied zwischen einer Norm und einer Meinung.
 *
 * **Still, wo es nichts zu melden gibt.** Kein Update ist keine Nachricht, und ein Fehler beim
 * Nachsehen erst recht nicht: wer offline ist, hat kein Problem mit dem Hafen, sondern kein Netz.
 * Gemeldet wird nur der eine Fall, in dem jemand etwas tun kann.
 *
 * Über den einen globalen `invoke`, den dieses Projekt ohnehin benutzt, statt über
 * `@tauri-apps/plugin-updater` — damit der Browser-Build weiter keinen Tauri-Code trägt. Der
 * Preis ist der Fortschrittsbalken beim Laden: dafür bräuchte es einen `Channel` aus
 * `@tauri-apps/api`, und ein Balken ist keine Abhängigkeit wert, die ein halbes SDK mitbringt.
 */

/** Was nachgesehen ergeben hat. `null` heißt: nichts zu tun, und das ist der Normalfall. */
export interface Available {
  version: string
  /** Die Fassung, die gerade läuft — damit die Meldung beide nennen kann. */
  current: string
  /** Womit der Download angestoßen wird; vom Plugin vergeben. */
  rid: number
}

function invoker(): ((command: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const host = globalThis as {
    __TAURI_INTERNALS__?: {
      invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>
    }
  }
  const invoke = host.__TAURI_INTERNALS__?.invoke
  return typeof invoke === 'function' ? invoke : null
}

/**
 * Liest die Antwort des Plugins, oder `null`.
 *
 * Eigene Funktion, damit sich das Lesen ohne Netz und ohne Plugin prüfen lässt — und weil eine
 * Antwort, deren Form nicht stimmt, hier dasselbe sein muss wie keine: lieber nichts melden als
 * etwas Erfundenes.
 */
export function readAnswer(answer: unknown, current: string): Available | null {
  if (typeof answer !== 'object' || answer === null) {
    return null
  }
  const found = answer as { available?: unknown; version?: unknown; rid?: unknown }
  if (
    found.available !== true ||
    typeof found.version !== 'string' ||
    typeof found.rid !== 'number'
  ) {
    return null
  }
  return { version: found.version, current, rid: found.rid }
}

/**
 * Sieht nach, ob es eine neuere Fassung gibt.
 *
 * Fehler werden verschluckt und zwar absichtlich: das ist der zweite Ort in dieser Anwendung, an
 * dem das richtig ist. Wer kein Netz hat, keinen GitHub erreicht oder hinter einem Proxy sitzt,
 * hat kein Problem mit dem Hafen — und eine rote Zeile dafür wäre eine Meldung über etwas, das
 * niemand hier beheben kann.
 */
export async function checkForUpdate(current: string): Promise<Available | null> {
  const invoke = invoker()
  if (invoke === null) {
    return null
  }
  try {
    return readAnswer(await invoke('plugin:updater|check', {}), current)
  } catch {
    return null
  }
}

/**
 * Lädt und installiert sie. Danach muss die Anwendung neu starten.
 *
 * Gibt den Grund zurück, woran es scheiterte, oder `null`. Hier wird **nicht** geschluckt: wer
 * auf den Knopf gedrückt hat, hat etwas erwartet, und ein Knopf, der still nichts tut, ist
 * schlimmer als keiner.
 */
export async function installUpdate(rid: number): Promise<string | null> {
  const invoke = invoker()
  if (invoke === null) {
    return 'In diesem Fenster laesst sich nichts installieren.'
  }
  try {
    await invoke('plugin:updater|download_and_install', { rid })
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * Welche Fassung gerade läuft — gefragt, nicht eingebacken.
 *
 * Die Zahl steht an vier Stellen im Baum (`tauri.conf.json`, zwei `package.json`, `Cargo.toml`);
 * eine davon zur Anzeigezeit in den Frontend-Bundle zu backen hieße, die Behauptung des
 * Build-Schritts zu zeigen statt die Fassung des Binaries, das sie trägt. Bei einem Werkzeug,
 * dessen einzige Aufgabe hier der Vergleich zweier Versionen ist, ist das genau die Stelle, an der
 * man nicht raten darf. `''`, wenn kein Fenster da ist — dann gibt es auch nichts zu vergleichen.
 */
export async function runningVersion(): Promise<string> {
  const invoke = invoker()
  if (invoke === null) {
    return ''
  }
  try {
    const said = await invoke('plugin:app|version', {})
    return typeof said === 'string' ? said : ''
  } catch {
    return ''
  }
}
