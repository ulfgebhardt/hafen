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

Der Kern kommt aus Werft, einem nicht weitergeführten lokalen Agenten-Cockpit, und zwar gemessen: die Kette `quest` → `probe` →
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
| Reederei (Orga-Gruppe) | `fleetlet` | Sippe (verwandte Reedereien) | `kindred` |
| Familie (dasselbe Projekt) | `family` | Beiboot (Submodul) | `tender` |
| Spiegel / eingebaut / ungewiss | `mirror` / `absorbed` / `uncertain` | Herkunft (vom Fork-Original) | `forkedFrom` |

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
- **Zusammengehörigkeit wird gemessen, nicht gefiltert** (`kin.ts`). Drei Kanten, alle schon
  irgendwo aufgeschrieben: ein geteilter Wurzel-Commit (`git rev-list --max-parents=0 HEAD`), ein
  Remote, das auf ein anderes Schiff der Flotte zeigt, und ein Submodul, das dasselbe tut. Die
  Verzeichnis-Orga ist eine Ablage-Entscheidung — auf dieser Flotte stimmt sie 89 von 92 Mal und
  verfehlt jeden interessanten Fall: acht Repos in sechs Orgas teilen Wurzel `0eb108a2`.
  Gemeinsame *Autoren* wurde erwogen und verworfen: bei einer eigenen Flotte sagt das Signal „ich
  habe an beidem gearbeitet", und das haben alle gemeinsam.
- **Ein zweiter Remote ist nicht automatisch ein Spiegel** (`lineage.ts`). Bis 02.10.2026 hieß jeder
  Remote außer `origin` so, und das war ein Wort für drei Dinge: gemessen über 21 solche Remotes sind
  **vier** Spiegel (beide Adressen halten dieselben Commits), **sechs** eingebaut (fremde Wurzel, per
  subtree hereingemischt) und **elf** dieselbe Linie bei anderem Repo. Für die Ocelot-Rebrandings sagte
  „Spiegel" das Gegenteil der Wahrheit: ein Spiegel hält dieselbe Arbeit und darf ignoriert werden,
  eine Herkunft ist der Ort, an den eine Änderung gehört.
  **Die Richtung steht nicht im Repository.** `sender-fm` liegt 75 Commits vor `ocelot/master` und
  `u-vote.eu` 7 vor seiner alten gogs-Adresse — lokal ist das dieselbe Lesung. Deshalb gibt es kein
  lokales `origin`-Urteil, sondern `ungewiss`, und `isFork { parent }` in der GraphQL-Abfrage liefert
  die Richtung mit dem Zeitstempel der Forge. **Die Forge überstimmt nur in eine Richtung**
  (`kinship.ts`): ein gemessener Spiegel bleibt einer, denn dass GitHub dieses Repo einen Fork nennt,
  macht die andere Adresse nicht zu anderer Arbeit.
  Zwei Fehler hat erst die Flottenmessung gefunden: die Reihenfolge der Prüfungen (die Wurzel *vor*
  den Zählern zu verlangen verlor zwei sichere Spiegel auf Gitea-Origins ohne `origin/HEAD`) und der
  verschenkte Messwert (`defaultBranch` lag schon da).
- **Die Sippe ordnet, sie gruppiert nicht** (`kindredOf` in `flags.ts`). Nach *Familie* gruppiert
  wären 92 Schiffe 72 Gruppen — strung out statt kompakt, weil fast jede Familie ein Repo ist.
  Eine Ebene höher sind 25 Orgas 15 Sippen, die größte mit neun. Die Orga bleibt das Dock; die
  Sippe entscheidet nur, welche Docks Nachbarn sind.

## Quests

Die **Forderung ist eine Entscheidung, die Prüfung eine Messung.** Die Forderung liegt als Datei
(`quests/<kette>/<id>.md`), die Prüfung steht in `probe.ts`, und geschrieben wird nur ihr Ergebnis.
Beides andersherum scheitert: eine Norm im Code kann niemand ohne Release ändern, und eine Prüfung
als Prosa lässt sich nicht laufen.

**Fünf Urteile, und `nicht messbar` ist keins der anderen vier.** `erfuellt`, `verletzt`,
`nicht anwendbar`, `Voraussetzung offen`, `nicht messbar`. Das letzte in `verletzt` zu falten
erfindet Lücken; es in `nicht anwendbar` zu falten lässt eine Forderung fallen, die gilt.
**Unmessbar ist nicht verletzt** — eine Rust-Crate ohne lesbare Prüfung sagt das, statt eine
Lücke zu behaupten.

**Jede Antwort trägt ihre Evidenz**: was gefragt wurde, wo nachgesehen wurde, was dort stand.
Ein blankes Urteilswort wäre zu glauben statt zu prüfen — und damit dasselbe wie das gepflegte
Statusfeld, das es ersetzt. `--evidenz` zeigt sie.

**Der Katalog liegt im Repo** (`store/quests/`, `BUILTIN_STORE` in `command.ts`), der lokale Store
daneben. Bis 01.10.2026 lag er nur in `$XDG_DATA_HOME/hafen`: eine frische Installation forderte
dann nichts und zeichnete eine Flotte ohne ein einziges Urteil — das Werkzeug sah kaputt aus,
obwohl es korrekt eine leere Norm gemessen hatte. Im Store bleibt, was eine *Entscheidung dieser
Maschine* ist: `register.md` und zusätzliche Quests. Die Richtung ist dieselbe wie unten, nur eine
Ebene höher: der mitgelieferte Katalog führt, der Store ergänzt und schwächt nie ab.

**Der Katalog führt, ein Schiff darf ergänzen und nie abschwächen** (`catalog.ts`). Ein Repo
kann in `.hafen/quests/` eigene Forderungen ablegen — `gilt_fuer` ist eine geschlossene Vokabel
über die ganze Flotte, und „dieses eine Projekt schuldet eine DAV-Migration" hat sonst keinen
Ort. Eine lokale Quest mit einer Id, die der Katalog schon fordert, wird verworfen **und das
wird gesagt**: eine Regel, deren einziger Biss unsichtbar ist, ist keine. Befreien geht in die
andere Richtung und gehört ins Register — eine Entscheidung des Menschen, an einer Stelle.

## Niemals

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
  `"test:lint": "eslint ."` starten denselben Linter. Namensbasiert fand Werft bei Ocelot-Social
  **einen** von etwa zwanzig Checks. Der Hausname bleibt als *zweites* Signal, und bei Streit
  gewinnt er — ein Projekt, das den Hausvertrag schon trägt, darf ihn durch eine bessere Messung
  nicht verlieren.
- **Ein Check muss ein Urteil zurückgeben** (`judges`). `vitest` ohne `run` wartet,
  `playwright test --ui` wartet auf einen Menschen, `--fix` ändert den Baum, damit er grün wird.

## Punkte

- **Zwei Zahlen, nie eine.** Projektpunkte beschreiben ein *Repository* (alle Autoren),
  Nutzerpunkte beschreiben, was ein *Mensch* mit seiner Flotte getan hat. Gemessen auf dieser
  Maschine: 151 556 gegen 23 661. Sie zu addieren hiesse, wer neben dem groessten gemeinsamen
  Projekt steht, duerfte dessen Geschichte als seine ausgeben.
- **Die Messung steht in `work.ts`, die Wertung in `points.ts`** — dieselbe Trennung wie
  quest/probe: eine Zahl ist eine Tatsache, ein Gewicht eine Entscheidung. Der Schnappschuss
  traegt die **Rohsignale** und nicht die Punkte, also kostet eine andere Gewichtung keine neue
  Messung. Das zaehlt, weil der erste Satz Gewichte immer falsch ist.
- **Quests gehen nicht in die Punkte ein.** Eine erfuellte Forderung ist ein Zustand, in dem das
  Schiff sein *soll*, keine Leistung zum Verbuchen — und beides zu addieren liesse ein Repo sich
  mit Commit-Menge aus einem verletzten Vertrag freikaufen.
- **Ein Commit ohne Convention zaehlt trotzdem, und es wird gesagt wie viele.** Eine Null neben
  2 000 Commits waere eine fehlende Konvention und keine Untaetigkeit — die eine Art, wie diese
  Zahlen glatt luegen koennten. Gemessen: 96 % der 124 314 Commits dieser Flotte tragen keine,
  fast alle davon in grossen Fremdprojekten (`ng`: 3 von 11 382).
- **PRs werden als Menge von Nummern gezaehlt, nicht als Commits.** Beide Merge-Arten kommen vor,
  oft im selben Repo: `Merge pull request #123` und der Squash `… (#123)`. Nur Merge-Commits zu
  zaehlen meldete fuer jahrweiser 0 statt 348 — eine glatte Falschaussage. Die Menge entdoppelt
  zugleich, wo beide Formen dieselbe Nummer nennen. Und sie kommt aus `git log`: kein `gh`, keine
  Forge, kein Netz.
- **Ordnung ist das Gegengewicht zur Arbeit.** Commits allein belohnen Bewegung, und eine Flotte,
  die auf Bewegung optimiert, ist eine mit neunzig halbfertigen Baeumen. `tidy` faellt, sobald
  Arbeit herumliegt — ein Stash ist genau das.
- **Ohne bekannte Adresse wird nicht gescort.** `git config user.email` plus `HAFEN_EMAILS`,
  einmal gelesen statt neunzigmal. Fehlt sie, zaehlte jeder Commit als fremder, und eine
  persoenliche Null neben einer geschaeftigen Flotte ist schlechter als gar keine Zahl.

## Prüfarten

Welche es gibt, entscheidet **eine** Stelle: das `switch` in `probe.ts`. Ein Name, den niemand
implementiert, wird beantwortet und nicht geworfen — ein Tippfehler in einer Quest darf den
Katalog nicht mitnehmen, und ein Katalog, der für einen späteren Hafen geschrieben ist, muss von
diesem lesbar bleiben.

- **`ci-nennt` prüft die Praxis, nicht den Dateinamen.** release-please liegt auf dieser Flotte
  in `release.yml` (fünfmal), `release-please-lint.yml` und `ui-release.yml`. Eine Quest mit
  festem Pfad hätte ausgerechnet den Repositories eine Lücke bescheinigt, die das Geforderte tun.
  Die Workflow-Inhalte trägt `QuestFacts` seitdem mit — sie wurden vorher gelesen, verworfen und
  das Verzeichnis ein zweites Mal nur zum Zählen aufgelistet.
- **`art: forge` ist der benannte Blindfleck.** Ob ein Zweig geschützt ist, steht in der
  GitHub-API und nirgends im Repository. Eine solche Quest wird `nicht messbar` — weder ein
  erfundenes `verletzt` noch ein stillschweigendes `nicht anwendbar`, sondern der Satz "das gilt
  hier und ich kann es nicht prüfen". Genau dafür gibt es das fünfte Urteil.
- **`workflows` ist eine Liste und keine Zahl, und der Unterschied hat gebissen.** Nach der
  Umstellung verglich `rolle` weiter `facts.workflows === 0` — ein Array gegen eine Zahl, also
  immer falsch, und die Prüfung hätte eine Lücke *behauptet*, wo nichts messbar war. Ein Test
  hat es gefangen; die Regel dahinter ist die übliche: unmessbar ist nicht verletzt.

## Das Fenster

- **Kein Pfad ist verdrahtet, und schon gar nicht der einer Person.** Wurzel, Store und
  Schnappschuss kommen aus `$HAFEN_ROOT`, `$HAFEN_STORE`, `$HAFEN_SNAPSHOT`, sonst aus XDG. Bis
  30.09.2026 stand `<root>/ulfgebhardt/hafen-data` im Code: das machte das Werkzeug für jeden
  anderen unbrauchbar, und es zeigte auf ein `register.md`, das den absoluten Pfad jedes Repos
  dieser Maschine führt — eine Liste von Projekten und Kunden, keine Konfiguration. Der Store
  bleibt deshalb lokal und wird nie gepusht.
- **Die Größe wird gemessen, nicht angenommen** (`zoom_from` in `lib.rs`). `$HAFEN_ZOOM` schlägt
  `GDK_SCALE`/`GDK_DPI_SCALE`, und die schlagen die Bildschirmdichte aus `xrandr`. Der letzte Fall
  ist der, der hier zählt: auf dieser Maschine ist keine der GDK-Variablen gesetzt und `Xft.dpi`
  sagt 96, während das Panel 210 dpi hat — wer die Behauptung glaubt, zeichnet halb so groß wie
  nötig. Gesetzt wird in Rust beim Start und nicht aus dem Fenster: ein Zoom, den der Webview
  selbst setzt, kommt ein Bild zu spät und bräuchte eine IPC-Erlaubnis für etwas, das eine
  Eigenschaft des Bildschirms ist.
- **Der lokale Stand steht neben dem Vertrag und nie darin** (`marks.ts`). Das Deck ist, was die
  *Flotte* fordert; Fracht, Flaggen und Schäden sind, was das Repo gerade tut. Zwei Fragen mit
  verschiedenen Antworten und verschiedenen Mitteln — in einer Reihe gezeichnet wären sie eine.
  Der Konflikt ist dabei keine schwerere Fracht, sondern ein **Bruch**: gestoppte Arbeit, kein
  Fortschritt. Und „sauber" bekommt einen Haken, weil eine Abwesenheit von Zeichen genau so
  aussieht wie „nicht gemessen".
- **Ein Zeichenlimit ist keine Messung** (`MAX_PER_KIND`). Vier Kisten je Art, und wo gekappt
  wurde, steht ein `+`; die wahre Zahl steht im Datenblatt. Ein Repo mit 3785 unverzeichneten
  Dateien würde das Schiff sonst unter Kisten begraben und nur „viel" sagen.
- **Es misst nicht.** `hafen schnappschuss` misst, die App liest `snapshot.json`. Deshalb steht
  der Zeitpunkt der Messung in der Kopfzeile: ein Bild ohne Zeitstempel behauptet, aktuell zu
  sein, und dieses ist genau so alt wie der letzte Schnappschuss.
- **Der Stil ist eine Risszeichnung, keine Illustration.** Raster, dünne Striche, Spanten,
  Wasserlinien, Beschriftung in Monospace. Keine Wolken, keine Möwen, keine Gischt. Jede Linie
  steht für etwas Gemessenes — dieselbe Zusage wie im Rest des Werkzeugs. Das einzige, was
  ausdrücklich Deko ist, sind die Uferböschung und die Boote auf den Bahnen — beide sagen das an
  Ort und Stelle.
- **Was gezeichnet wird, entscheidet nicht der Zeichner.** `fleet.ts` (Reihenfolge, Gruppierung)
  und `vessel.ts` (Geometrie, Segmente, Tiefgang) sind reine Funktionen und nahezu vollständig
  gemessen;
  `scene.ts` setzt sie in Striche um und besitzt keine Regel. Nur durch diesen Schnitt ist
  überhaupt etwas zusicherbar, denn über einen Canvas lässt sich nichts behaupten. `scene.ts` und
  `HarborScene.vue` stehen deshalb **namentlich** in der Coverage-Ausnahme, statt stillschweigend
  mitgezählt zu werden — derselbe Umgang wie mit einer `manuell`-Prüfung im Katalog.
- **Kein committetes Vergleichsbild.** Es entstünde auf einer Maschine mit einem Satz Fonts, und
  die nächste Chromium-Version färbt es rot, ohne dass etwas kaputt ist. Ein Rot, das nichts
  bedeutet, verliert seinen Leser.
- **Jedes Urteil trägt eine Form, nicht nur eine Farbe** (`SEGMENT` in `theme.ts`): gefüllt,
  schraffiert, gestrichelt. Acht Prozent der Männer trennen dieses Rot und Grün nicht, und ein
  Screenreader bekommt von einem Canvas gar nichts — die Wörter stehen im Datenblatt daneben.
- **Pixi statt DOM, und das ist gemessen.** Derselbe Hafen als SVG wären ~2700 Knoten; in Werft
  kostete der DOM-Renderer allein 8,4 % CPU im Leerlauf, bei weniger Detail.

## Test-Vertrag

```sh
pnpm test:lint   # eslint + typecheck
pnpm test:unit   # vitest mit Coverage-Schwellen
```

Tests liegen neben der Datei, die sie prüfen (`x.ts` / `x.spec.ts`). Die Schwellen in den
`vitest.config.ts` sind gemessene Werte ohne Luft: ein Punkt Spielraum ist ein Punkt erlaubter
Verfall, und sie zu heben ist ein eigener Commit.

**Ein grünes `pnpm test:lint` ist nicht unbedingt ein gelaufenes.** turbo cacht je Paket, und am
02.10.2026 meldete es „6 successful, 4 cached" — darunter der `tsc`-Lauf der CLI, dessen Fixture
ein neues `Ship`-Feld nicht kannte. Die CI hatte einen Cache-Miss und fand es, lokal war es
unsichtbar. Vor einem Push, der an einem geteilten Typ gerührt hat: `pnpm test:lint --force`. Die
Zeile `Cached: 0 cached, 6 total` ist der Beleg, dass wirklich gemessen wurde.
