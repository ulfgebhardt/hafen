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

Das Fenster liest `snapshot.json` und *misst* über `$HAFEN_CLI`, sonst über `hafen` auf dem PATH.
Auf einem fremden Rechner existiert beides nicht: ein geladenes Binary zeigt heute einen Fehler
mit einer Umgebungsvariable darin.

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

### 3. Bordmittel (Ziel 5)

Einmal beim Start geprüft, an einer Stelle gesagt:

- **kein `git`** — der einzige harte Ausfall. Nichts ist messbar. Eine klare Meldung mit der
  Abhilfe, nicht zweiundneunzig stille Fehlschläge.
- **kein `gh`** — nur die Forge-Lesung fällt weg, `art: forge`-Quests werden `nicht messbar`. Das
  tut der Hafen heute schon richtig; es wird nur nirgends gesagt.
- **kein `claude`** — wird vom Hafen nicht gebraucht. Der `AgentPort` stammt aus Werft und hat
  hier keinen Aufrufer; `tools()` zeichnet fehlende Werkzeuge ohnehin nicht.

### 4. Updater und Release (Ziele 1, 2, 4)

Das Muster steht in `tome-of-addons` und ist vollständig nachlesbar:

```
bundle.createUpdaterArtifacts: true
plugins.updater: { endpoints: [".../releases/latest/download/latest.json"], pubkey, dialog: false }
lib.rs:        .plugin(tauri_plugin_updater::Builder::new().build())
Frontend:      check() → still bei "kein Update" und bei Fehlern, Banner nur wenn eines da ist
CI:            TAURI_SIGNING_PRIVATE_KEY (+ Passwort), includeUpdaterJson: true
```

Das Release-Gerüst steht schon: release-please, vier Tauri-Builds, Upload ans Release. Es fehlen
genau drei Dinge — der Signaturschlüssel, `createUpdaterArtifacts`, `includeUpdaterJson`.

**Als Vertrag:** `auslauf/aktualisierung` — *ein Repository, das Binaries veröffentlicht, schuldet
einen Weg, sie zu aktualisieren.* Messbar aus `tauri.conf.json` und dem Workflow, ohne Netz. Die
Flotte fordert damit von sich, was sie von anderen fordert.

**macOS** ist das erste fremde Testsystem. Eine unsignierte `.app` hält Gatekeeper an; Abhilfe
(Rechtsklick → Öffnen, oder `xattr -d com.apple.quarantine`) gehört in die README. Ad-hoc-Signatur
kostet nichts, Notarisierung einen Apple-Developer-Account — eine Entscheidung des Menschen, die
hier offen bleibt.

## Offen, und warum

- **Signaturschlüssel** — `pnpm tauri signer generate`. Der private Teil gehört in
  `secrets.TAURI_SIGNING_PRIVATE_KEY`, der öffentliche in `tauri.conf.json`. Niemand ausser dem
  Menschen kann das tun, und ohne ihn kann der Updater nichts prüfen.
- **Apple-Developer-Account** — nur für Notarisierung nötig. Ohne ihn läuft die App, mit einem
  Umweg beim ersten Öffnen.
- ~~**IPC-Kosten des Adapters**~~ — gemessen, siehe oben: 4 931 Aufrufe je Vollmessung.
