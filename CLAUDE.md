# Hafen

Eine Übersicht über alle Git-Repos einer Maschine, und was die Flotte von ihnen fordert.

## Die Grenze

> **Der Hafen misst und zeichnet. Er tut nichts.**

Kein Knopf, der etwas startet, schreibt, anlegt oder abschickt. Diese Zeile ist keine Vorsatz-
erklärung, sondern eine Definition: jeder Vorschlag mit einem Verb darin fällt automatisch aus
dem Umfang. Sie steht hier, weil das Vorgängerprojekt (Werft, ein Agenten-Cockpit) daran
gescheitert ist, dass jede Messung eine nächste rechtfertigte — 295 Auftragsdateien, und die
Projekte, um die es ging, standen still.

Gemessen wird das und nicht zugesagt: `command.spec.ts` prüft jeden Aufruf am `ProcPort` gegen
eine **Erlaubnisliste** lesender git-Kommandos. Eine Verbotsliste wäre die schwächere Richtung —
mit einer Lücke lässt sie einen Schreibvorgang still durch, während die Erlaubnisliste im
schlimmsten Fall über einen neuen *lesenden* Aufruf stolpert. `git worktree list` ist der Beweis:
auf das Wort `worktree` zu prüfen nannte ein Lesen ein Schreiben.

Das gilt besonders, weil dieses Werkzeug in achtzig-plus Arbeitsbäumen läuft, die **nicht allein
unsere** sind.

## Herkunft

Der Kern kommt aus Werft (`../werft`), und zwar gemessen: die Kette `quest` → `probe` →
`contract` → `role` importiert nichts nach oben, also war der Schnitt ein Kopieren. Was dort
liegen blieb — Dock, Session, PTY, Order, Launch, Basin, Collision, Seatrial — sind rund 15 000
Zeilen Agenten-Verwaltung.

**Die Kommentare tragen noch Werfts Namen.** Sie sind Begründungen mit Datum und Messung
dahinter und inhaltlich weiter richtig; ein pauschales Umbenennen würde Sätze wie „Werft's own
names" falsch machen, denn `CONTRACT_SCRIPTS` *ist* Werfts Namenskonvention. Wer eine solche
Stelle ohnehin anfasst, zieht sie mit.

## Vokabular

Identifier englisch, nutzersichtbare Texte deutsch. Die Domäne ist Schiffbau, die Begriffe sind
englische Fachbegriffe — keine Erfindungen, und **nicht abweichen**.

| UI (deutsch) | Code | UI (deutsch) | Code |
| --- | --- | --- | --- |
| Hafen (Übersicht) | `harbor` | Schiff (Projekt/Repo) | `ship` |
| Register | `register` | Rost (Liegezeit) | `rust` |
| Quest (Forderung) | `quest` | Kette | `chain` |
| Prüfart | `probe` | Evidenz | `evidence` |
| erfüllt / verletzt | `met` / `violated` | nicht anwendbar | `notApplicable` |
| Voraussetzung offen | `waiting` | nicht messbar | `unmeasured` |
| Aktiv / Ruhend / Archiviert | `active` / `dormant` / `archived` | Werftkapazität | `capacity` |

`dock` hieß in Werft der Worktree und ist hier **frei** — die Worktree-Verwaltung ist genau der
Teil, der nicht mitkam. Der Name wurde für dieses Projekt erwogen und verworfen: der Hafen *ist*
die Projektübersicht, und ein Dock ist ein Arbeitsplatz.

**Die Kette heißt weiter `werft`** (Technik, vor `auslauf`, `fracht`, `flagge`, `handel`). Sie zu
umbenennen hieße, den Inhalt jeder Quest-Datei für einen Werkzeugnamen zu ändern — genau der
Fehler, den Werft als „Werft passt sich an, nicht die Flotte" notiert hat. Die Werft ist die
Technik, das Werkzeug ist der Hafen; kein Konflikt.

## Architektur

- **`packages/core` kennt keine Umgebung.** Kein `node:fs`, kein `child_process`. Alles läuft
  über Ports (`ports.ts`), damit dieselbe Logik in der CLI, im Fenster und im Test gilt. Ein
  direkter Umgebungszugriff dort ist ein Fehler, kein Shortcut. Genau diese Regel hat die
  Auskopplung aus Werft zu einem Kopiervorgang gemacht.
- **Kein Zustand, der auch abgeleitet werden kann.** Rost aus `git log`, Verträge aus den
  Manifesten, Urteile aus den Quests. Ein gepflegtes Statusfeld kann falsch stehen, eine
  abgeleitete Antwort nicht.
- **Keine Datenbank.** Im Register stehen genau zwei Dinge: was archiviert ist und welche
  Verzeichnisse von Hand aufgenommen wurden. Beides sind Entscheidungen, keine Messungen.
- **`git` wird als Kommando aufgerufen, nicht als Bibliothek.**

## Quests

Die **Forderung ist eine Entscheidung, die Prüfung eine Messung.** Die Forderung liegt als Datei
im Store (`hafen-data/quests/<kette>/<id>.md`), die Prüfung steht in `probe.ts`, und geschrieben
wird nur ihr Ergebnis. Beides andersherum scheitert: eine Norm im Code kann niemand ohne Release
ändern, und eine Prüfung als Prosa lässt sich nicht laufen.

**Fünf Urteile, und `nicht messbar` ist keins der anderen vier.** `erfuellt`, `verletzt`,
`nicht anwendbar`, `Voraussetzung offen`, `nicht messbar`. Das letzte in `verletzt` zu falten
erfindet Lücken; es in `nicht anwendbar` zu falten lässt eine Forderung fallen, die gilt.
**Unmessbar ist nicht verletzt** — eine Rust-Crate ohne lesbare Prüfung sagt das, statt eine
Lücke zu behaupten.

**Jede Antwort trägt ihre Evidenz**: was gefragt wurde, wo nachgesehen wurde, was dort stand.
Ein blankes Urteilswort wäre zu glauben statt zu prüfen — und damit dasselbe wie das gepflegte
Statusfeld, das es ersetzt. `--evidenz` zeigt sie.

**Der Katalog führt, ein Schiff darf ergänzen und nie abschwächen** (`catalog.ts`). Ein Repo
kann in `.hafen/quests/` eigene Forderungen ablegen — `gilt_fuer` ist eine geschlossene Vokabel
über die ganze Flotte, und „dieses eine Projekt schuldet eine DAV-Migration" hat sonst keinen
Ort. Eine lokale Quest mit einer Id, die der Katalog schon fordert, wird verworfen **und das
wird gesagt**: eine Regel, deren einziger Biss unsichtbar ist, ist keine. Befreien geht in die
andere Richtung und gehört ins Register — eine Entscheidung des Menschen, an einer Stelle.

## Niemals

- **Nicht committen oder pushen.** Der Mensch committet selbst. Gilt auch für den Store.
- **Nichts auf eine Forge schreiben, und nicht nach draußen fragen.** Kein `fetch`, kein `gh`.
  Viele dieser Repos sind nicht allein unsere, und ein Werkzeug, das beim Ansehen einer Liste
  Anfragen verschickt, tut das ungefragt.
- **Kein Verzeichnis in eine Rateliste nachtragen.** Wo der Vertrag steht, fragt der Hafen bei
  git (`git ls-files '*package.json'`). Wer eine Rateliste pflegt, hat die Messung gegen eine
  bessere Vermutung getauscht.
- **Der Hafen passt sich an, nicht die Flotte.** Am 28.09.2026 benannte ein PR in einem fremden
  Repo 37 Dateien um, damit die Messung stimmt — und schaffte dabei `npm test` ab, die Konvention
  von npm selbst. Er wurde am selben Tag zurückgezogen. Was ihn rechtfertigte, stand wörtlich in
  ihm: „tooling that surveys a repository has to find its checks by name". Genau dieser Satz ist
  der Fehler.
- **Die Rolle steht im Befehl, nicht im Namen** (`role.ts`). `"lint": "eslint ."` und
  `"test:lint": "eslint ."` starten denselben Linter. Namensbasiert fand Werft bei Leuchtturm
  **einen** von etwa zwanzig Checks. Der Hausname bleibt als *zweites* Signal, und bei Streit
  gewinnt er — ein Projekt, das den Hausvertrag schon trägt, darf ihn durch eine bessere Messung
  nicht verlieren.
- **Ein Check muss ein Urteil zurückgeben** (`judges`). `vitest` ohne `run` wartet,
  `playwright test --ui` wartet auf einen Menschen, `--fix` ändert den Baum, damit er grün wird.

## Test-Vertrag

```sh
pnpm test:lint   # eslint + typecheck
pnpm test:unit   # vitest mit Coverage-Schwellen
```

Tests liegen neben der Datei, die sie prüfen (`x.ts` / `x.spec.ts`). Die Schwellen in den
`vitest.config.ts` sind gemessene Werte ohne Luft: ein Punkt Spielraum ist ein Punkt erlaubter
Verfall, und sie zu heben ist ein eigener Commit.
