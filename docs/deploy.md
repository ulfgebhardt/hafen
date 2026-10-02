# Auslaufen

Wie der Hafen auf einen fremden Rechner kommt, und was dort von ihm übrig bleibt.

Dieses Dokument ist der Plan und zugleich die Übergabe: es steht hier, damit es eine
abgeschnittene Sitzung überlebt. Was erledigt ist, wird abgehakt — was offen ist, steht mit dem
Grund da, aus dem es offen ist.

## Das Ziel

> **Wer das Programm startet, sieht seine Projekte als Flotte. Ohne Checkout, ohne Node, ohne
> eine Umgebungsvariable.**

Daran misst sich der Rest. Jeder Punkt unten, der das nicht näher bringt, ist nachrangig.

## Der Blocker, und die Entscheidung dagegen

Das Fenster las `snapshot.json` und *maß* über `$HAFEN_CLI`, sonst über `hafen` auf dem PATH.
Auf einem fremden Rechner existiert beides nicht: ein geladenes Binary zeigte einen Fehler mit
einer Umgebungsvariable darin. (Vergangenheit seit Baustelle 1 — die CLI-Brücke ist am 02.10.2026
mit 333 Zeilen Rust gefallen, weil nichts sie mehr rief.)

Zwei Wege standen zur Wahl. Gewählt ist der zweite.

- **Sidecar** — `packages/cli` als eigenständiges Binary je Plattform mitliefern. Keine
  Logikänderung, geringes Risiko, ~55 MB je Plattform, zweite Binärdatei neben der App.
- **Tauri-Adapter (gewählt)** — `Ports` über Rust-Kommandos implementieren, `surveyHarbor` läuft
  im Webview. Kein zweites Binary. Es ist genau das, wofür `ports.ts` gebaut wurde: *"Ports are
  the only way `core` touches the outside world … A direct `node:fs` import here would make two of
  those three impossible."* Und es verschiebt die **Erlaubnisliste an die echte Grenze**: heute
  prüft sie TypeScript, danach Rust, also die Stelle, hinter der das Fenster nichts mehr erfinden
  kann.

### Das Gate: gemessen, und es fiel anders aus als geschätzt ✅

Geschätzt waren rund 1 400 IPC-Aufrufe je Vollmessung. **Gemessen waren es 49 117** — und
42 441 davon, also 86 %, waren `isDirectory` auf einem Eintrag, der gerade aus einem `readDir`
gekommen war. 42 478 Einträge abgefragt, um die 1 295 zu finden, die Verzeichnisse sind.

Die Antwort war keine Bündelung und kein Sidecar, sondern die fehlende Frage: `readDir` gibt die
**Art** jetzt mit, weil das Verzeichnis sie ohnehin kennt. Damit:

| | vorher | nachher |
| --- | --- | --- |
| Port-Aufrufe je Vollmessung | 49 117 | **6 676** |
| Dauer in der CLI | 15,54 s | **10,21 s** |
| Nutzlast | 4,8 MiB | 4,8 MiB |

Und der zweitgrößte Posten ging denselben Weg: die **Suche** war 2 174 der verbleibenden 6 676
Aufrufe, und eine Suche ist ganz Dateisystem und keine Domäne. `treesWith` gibt sie an die Seite
ab, die das Dateisystem hat — Node läuft seinen Baum, Rust läuft ihn in **einem** Aufruf.

| | am Anfang | nach `readDir` | nach `treesWith` |
| --- | --- | --- | --- |
| Port-Aufrufe je Vollmessung | 49 117 | 6 676 | **4 931** |
| davon für die Suche | 44 233 | 2 174 | **2** |
| Suche in der CLI | — | 0,75 s | **0,10 s** |

Dieselben 99 Repositories wie vorher, in einem Dreizehntel der Zeit. `find` wurde dafür gemessen
und verworfen: beschnitten ist es zwar schnell (0,31 s), aber auf dieser Maschine ist `find` in
Wahrheit **bfs 4.1.1**, auf Windows ist `find.exe` eine *Textsuche*, und die Ausschlussregel hat
einen Präfix-Fall, den kein find-Ausdruck trägt.

4 931 Aufrufe bei 0,1–0,5 ms Round-Trip sind 0,5 bis 2,5 s auf zehn Sekunden echte Arbeit. Das
Gate ist genommen, der Sidecar bleibt unnötig — und die CLI ist nebenbei schneller geworden, weil
der Fehler nie an Tauri lag.

## Die vier Baustellen

### 1. Der Adapter (Ziel 6) ✅

`packages/core` kennt vier Ports. Jeder hat eine Entsprechung in Rust:

| Port | Aufrufe | Rust |
| --- | --- | --- |
| `proc` | `run`, `which` | `std::process::Command`, gegen die Erlaubnisliste geprüft |
| `fs` | `readFile`, `readDir`, `isDirectory`, `realPath`, `writeFile` | `std::fs` |
| `host` | `cpuCount`, `totalMemory`, `freeDiskBytes` | `std::thread::available_parallelism`, `sysinfo` |
| `clock` | `now` | `Date` im Webview, kein IPC |

Die Erlaubnisliste lesender git-Kommandos (heute in `command.spec.ts` geprüft) wandert nach
`lib.rs` und wird dort **erzwungen**, nicht nur getestet. Der Test bleibt und prüft dann eine
Zusicherung statt einer Absicht.

Gebaut, und dazu kamen zwei Dinge, die der Plan nicht vorhersah:

- **`port_places`** löst Store, Schnappschuss und Wurzeln nach denselben XDG-Regeln auf, die die
  CLI benutzt. Sie müssen dieselben sein: die beiden bearbeiten dieselben Dateien, und zwei
  Pfadkonventionen für einen Store sind zwei Meinungen darüber, wo ein Register liegt.
- **Der Katalog wird einkompiliert** (`catalog.ts`). `BUILTIN_STORE` löst von `packages/cli/src`
  auf — auf einem fremden Rechner ein Pfad, den es nicht gibt. Ein geladenes Binary hätte jedes
  Repository gegen **gar keine Forderung** gemessen und eine Flotte ohne ein einziges Urteil
  gezeichnet: kaputt aussehend, während es über eine leere Norm korrekt war. Dieselben Dateien,
  nur anders gelesen.

Und `SurveyOptions.stop`: Abbrechen war ein Signal an einen Prozess. Ein Fenster, das selbst
misst, hat keinen Prozess zum Töten — also fragt der Suchlauf vor jedem Repository nach. Was
gemessen ist, **bleibt**: eine bereits genommene Lesung ist wahr, ob der Rest folgte oder nicht.

### 2. Erststart (Ziele 3, 6) ✅

Heute: `$HAFEN_ROOT`, sonst `~/.data/sources` und `~/.data/games` — eine persönliche Konvention,
auf einem fremden Rechner leer.

Beim ersten Start wird **einmal gefragt**, wo die Projekte liegen (Ordnerauswahl), und die Antwort
kommt ins **Register**. Das passt ohne Umbau: im Register stehen "genau zwei Dinge: was archiviert
ist und welche Verzeichnisse von Hand aufgenommen wurden. Beides sind Entscheidungen, keine
Messungen." Eine gewählte Wurzel ist genau das.

**Keine Rateliste** von `~/Projects`, `~/src`, `~/code`. Wer eine Rateliste pflegt, hat die
Messung gegen eine bessere Vermutung getauscht — und hier gibt es eine Messung: den Menschen zu
fragen.

**Config bleibt XDG auf jeder Plattform.** Nicht `~/Library/Application Support` auf macOS: die
CLI und das Fenster müssen sich über den Ort einig sein, und zwei Pfadkonventionen sind zwei
Meinungen über dieselbe Datei.

Gebaut. `Register` trägt eine dritte Liste — **Wurzeln** —, und das Fenster schreibt das Register
jetzt selbst: es ging vorher über die CLI, also konnte eine fremde Maschine *gar keine
Entscheidung* festhalten. Kein `hafen` auf dem PATH, kein Archivieren, keine Erststart-Antwort.
Das Format bleibt `packages/core`s: gelesen, mit `setArchived`/`setEnlisted`/`setRoot` geändert,
zurückgeschrieben.

`$HAFEN_ROOT` **führt**, wo es gesetzt ist — ein Override, den ein stored Register schlagen
könnte, wäre keiner. Sonst das Register. Beides leer heißt **nichts**, und dann fragt das Fenster
einmal, statt eine leere Flotte zu zeichnen: die beiden sehen gleich aus, und nur eine davon hat
eine Abhilfe.

### 3. Bordmittel (Ziel 5) ✅

Einmal beim Start geprüft, an einer Stelle gesagt:

- **kein `git`** — der einzige harte Ausfall. Nichts ist messbar. Eine klare Meldung mit der
  Abhilfe, nicht zweiundneunzig stille Fehlschläge.
- **kein `gh`** — nur die Forge-Lesung fällt weg, `art: forge`-Quests werden `nicht messbar`. Das
  tut der Hafen heute schon richtig; es wird nur nirgends gesagt.
- **kein `claude`** — wird vom Hafen nicht gebraucht. Der `AgentPort` stammt aus Werft und hat
  hier keinen Aufrufer; `tools()` zeichnet fehlende Werkzeuge ohnehin nicht.

Gebaut. Dabei kam heraus, dass die Forge-Abfrage noch über die CLI lief — die Bordmittel-Zeile
hätte also „gh ist da" gesagt, während der Knopf aus einem ganz anderen Grund scheiterte. Sie
läuft jetzt im Fenster über `readStats`, und die Erlaubnisliste in `ports.rs` trägt dafür die
beiden Aufrufe, die die CLI-Liste von Anfang an hatte: `gh api graphql -f query=query(` und
`curl --silent --fail`. Beides GETs — eine GraphQL-*Query* hat per Definition keine Nebenwirkung,
und `curl` bekommt weder Methode noch Body.

### 4. Updater und Release (Ziele 1, 2, 4) ✅

Das Muster steht in `tome-of-addons` und ist vollständig nachlesbar:

```
bundle.createUpdaterArtifacts: true
plugins.updater: { endpoints: [".../releases/latest/download/latest.json"], pubkey, dialog: false }
lib.rs:        .plugin(tauri_plugin_updater::Builder::new().build())
Frontend:      check() → still bei "kein Update" und bei Fehlern, Banner nur wenn eines da ist
CI:            TAURI_SIGNING_PRIVATE_KEY (+ Passwort), includeUpdaterJson: true
```

Alles davon steht jetzt im Baum. Vier Entscheidungen, die beim Bauen fielen und die ein Leser
sonst für Zufall halten müsste:

- **`plugin:updater|check` über den globalen `invoke`**, nicht über `@tauri-apps/plugin-updater`.
  Der Browser-Build trägt damit weiter keinen Tauri-Code. Der Preis ist der Fortschrittsbalken:
  dafür bräuchte es einen `Channel` aus `@tauri-apps/api`, und ein Balken ist kein halbes SDK wert.
- **Die laufende Fassung wird gefragt** (`plugin:app|version`), nicht beim Bauen eingebacken. Die
  Zahl steht an vier Stellen im Baum; bei einem Werkzeug, dessen einzige Aufgabe hier der Vergleich
  zweier Versionen ist, ist das die eine Stelle, an der man nicht raten darf.
- **Still, wo es nichts zu melden gibt.** `checkForUpdate` schluckt jeden Fehler — wer offline ist,
  hat kein Problem mit dem Hafen. `installUpdate` schluckt **nichts**: wer gedrückt hat, hat etwas
  erwartet, und ein Knopf, der still nichts tut, ist schlimmer als keiner. Das sind die beiden
  einzigen Stellen in der Anwendung, an denen ein Schluck richtig ist, und sie liegen zwei
  Funktionen auseinander.
- **Das Banner steht über allem**, auch über `NoGit` und `FirstRun`: eine neuere Fassung kann genau
  die Abhilfe für den Zustand sein, den jemand gerade ansieht.

**Als Vertrag:** `auslauf/aktualisierung` steht im Katalog. Zwei Checks, beide `ci-nennt`:
`includeUpdaterJson` (das Release veröffentlicht die Datei) und `TAURI_SIGNING_PRIVATE_KEY` (der
Build signiert). Zwei unabhängige Fehler, und beide machen den Build **grün** — ein Release ohne
Signatur sieht erfolgreich aus und aktualisiert niemanden.

Dafür kam ein Merkmalswert dazu: `gilt_fuer: [tauri]`, gemessen mit
`git ls-files '*tauri.conf.json'` und nur dann, wenn eine Quest ihn überhaupt verlangt — dieselbe
Sparsamkeit wie bei den Abhängigkeiten. Gemessen über 92 Repositories: **89 nicht anwendbar**,
zwei erfüllt (`tome-of-addons`, `hafen`), eines nicht messbar (`werft` — eine Tauri-App ohne
Workflows). Ohne das Merkmal hätte die Forderung 89-mal eine Lücke behauptet.

Ungeprüft bleibt der öffentliche Schlüssel in `tauri.conf.json`, und das ist eine Entscheidung:
die Datei liegt bei einer App unter `src-tauri/`, im Monorepo unter `apps/<name>/src-tauri/`, und
eine Kandidatenliste wäre die Rateliste, die dieses Werkzeug sonst überall ablehnt. Die Lücke steht
benannt in der Quest statt als falsches `verletzt` in einer Messung.

**macOS** ist das erste fremde Testsystem. Eine unsignierte `.app` hält Gatekeeper an; die Abhilfe
(Rechtsklick → Öffnen, oder `xattr -d com.apple.quarantine`) steht in der README. Ad-hoc-Signatur
kostet nichts, Notarisierung einen Apple-Developer-Account — eine Entscheidung des Menschen, die
hier offen bleibt.

**Der Schlüssel ist erzeugt** (02.10.2026). Der öffentliche Teil steht in
`apps/harbor/src-tauri/tauri.conf.json` und ist dafür gedacht, dort zu stehen: er prüft Signaturen
und erzeugt keine. Der private liegt in `~/.tauri/hafen.key`, das Passwort in
`~/.tauri/hafen.key.password`, beide `0600` und beide ausserhalb jedes Repositories — ein
Signaturschlüssel im Baum ist einen `git add .` von der Veröffentlichung entfernt.

Was ein Mensch noch tun muss: beide Dateien als Secrets im Repository hinterlegen,
`TAURI_SIGNING_PRIVATE_KEY` und `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Dass das Passwort im
**selben** Secret-Speicher liegt wie der Schlüssel, ist bewusst und keine Nachlässigkeit: es
schützt die Kopie auf der eigenen Platte, nicht die in der CI — wer dort ein Secret lesen kann,
liest beide. Der Schutz der CI-Kopie ist, dass niemand sie lesen kann.

Und: **dieser Schlüssel ist nicht ersetzbar.** Geht er verloren, kann keine künftige Fassung mehr
signiert werden, die ein installiertes Fenster annimmt — jede bestehende Installation ist dann
endgültig die letzte, und ein neuer Schlüssel hilft nur Leuten, die neu installieren. Eine Kopie
an einem zweiten Ort ist deshalb kein Luxus.

## Offen, und warum

- **Signaturschlüssel** — `pnpm tauri signer generate`. Der private Teil gehört in
  `secrets.TAURI_SIGNING_PRIVATE_KEY`, der öffentliche in `tauri.conf.json`. Niemand ausser dem
  Menschen kann das tun, und ohne ihn kann der Updater nichts prüfen.
- **Apple-Developer-Account** — nur für Notarisierung nötig. Ohne ihn läuft die App, mit einem
  Umweg beim ersten Öffnen.
- ~~**IPC-Kosten des Adapters**~~ — gemessen, siehe oben: 4 931 Aufrufe je Vollmessung.
