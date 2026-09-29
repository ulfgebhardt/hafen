# Hafen

Eine Übersicht über alle Git-Repos einer Maschine: Zustand, Test-Vertrag, und was die Flotte von
ihnen fordert — mit der Evidenz hinter jedem Urteil.

**Der Hafen misst und zeichnet. Er tut nichts.** Kein Commit, kein Push, keine Netzwerkanfrage,
kein Knopf, der etwas startet. Das ist als Erlaubnisliste lesender git-Kommandos getestet, nicht
zugesagt.

## Benutzen

```sh
pnpm install

pnpm hafen hafen                 # alle Schiffe mit Zustand, Lücken und Quests
pnpm hafen hafen --evidenz       # je Quest zeigen, was gelesen wurde
pnpm hafen hafen --json          # maschinenlesbar
pnpm hafen schnappschuss         # Zeitpunkt + Wurzel + Schiffe als JSON
```

Ohne Argument steht die Hilfe da. Die Wurzel ist als zweites Argument überschreibbar, der Store
über `--store=<pfad>` oder `HAFEN_STORE`.

```
HAFEN  89 Schiffe

in Fahrt  (12)
  kompass/peilung-app                        main  Rost 200d
      ! fehlt: typecheck
      ! typecheck       offen: irgendein Schritt dieses Schiffs prüft Typen …
      + e2e             2 von 2 Prüfungen erfüllt
      + lint            2 von 2 Prüfungen erfüllt

QUESTS
  !  136  verletzt
  ~   21  Voraussetzung offen
  ?   44  nicht messbar
  +   63  erfüllt
  ·  270  nicht anwendbar
  44 von 89 Schiffen sind an eine Quest gebunden
```

## Die fünf Urteile

`+` erfüllt · `!` verletzt · `~` Voraussetzung offen · `?` nicht messbar · `·` nicht anwendbar

Fünf und nicht drei, weil **unmessbar nicht verletzt ist**: eine Rust-Crate ohne lesbaren
Lint-Schritt sagt das, statt eine Lücke zu behaupten. Und `nicht anwendbar` ist nicht `erfüllt`:
eine Forderung, die hier nicht gilt, ist keine bestandene.

## Der Katalog

Was die Flotte fordert, liegt als Markdown im Store — `$HAFEN_STORE`, sonst
`$XDG_DATA_HOME/hafen` (also meist `~/.local/share/hafen`):

```
~/.local/share/hafen/
  quests/werft/lint.md
  quests/werft/typecheck.md
  register.md
```

Der Store bleibt **lokal**. `register.md` führt jedes Repo mit absolutem Pfad, und das ist eine
Liste von Projekten und Kunden — nichts, was in ein öffentliches Repository gehört.

Ein einzelnes Repo darf in `.hafen/quests/` eigene Forderungen ergänzen. **Der Katalog führt:**
eine lokale Quest mit einer Id, die der Katalog schon fordert, wird verworfen — und das steht in
der Ausgabe, damit die Regel sichtbar ist.

## Das Fenster

Das Fenster skaliert sich selbst: `$HAFEN_ZOOM`, sonst `GDK_SCALE`/`GDK_DPI_SCALE`, sonst aus der
tatsächlichen Bildschirmdichte. Gemessen auf dem Panel, für das es geschrieben wurde — 2560×1440
auf 309 mm sind 210 dpi, während X hartnäckig 96 meldet, also Faktor 2,25.

```sh
pnpm --filter @hafen/harbor snapshot   # misst die Flotte in public/snapshot.json
pnpm --filter @hafen/harbor dev        # zeichnet sie
```

Die Flotte als Risszeichnung: ein Rumpf je Repo, das Deck geteilt durch die Forderungen, die für
es gelten. Gefüllt heißt erfüllt, schraffiert verletzt, gestrichelt nicht messbar — **Form und
nicht nur Farbe**, damit die Lesung Graustufen und ein farbenblindes Auge übersteht. Ein Repo
ohne geltende Forderung bekommt ein gestricheltes Deck und keine leeren Kästchen: „nie gemessen"
und „gemessen und leer" dürfen nicht gleich aussehen.

Der Tiefgang ist die Last — ein Schiff, das alles erfüllt, liegt hoch. Die Aufbauten wachsen mit
der Zahl der Forderungen. Sortiert wird nach Zustand, Schlimmstes zuerst; Rost ist zweiter
Schlüssel und nie erster, denn frisch ist nicht dasselbe wie wichtig.

**Daneben steht, was das Repo selbst gerade tut** — zwei verschiedene Fragen, also zwei Orte am
Schiff. Das Deck ist die Forderung der Flotte, Fracht und Flaggen sind der lokale Stand:

| Zeichen | Bedeutung | Zeichen | Bedeutung |
| --- | --- | --- | --- |
| Kiste, gefüllt | vorgemerkt (staged) | Wimpel am Mast | nicht gepusht |
| Kiste, offen | geändert | Schleifspur am Heck | Remote ist voraus |
| Kiste, gestrichelt | unverzeichnet | Kisten am Kai | Stash |
| Bruch im Rumpf | Konflikt — hier ist Schluss | Boote längsseits | weitere Worktrees |
| Haken | sauber, auf seinem Branch | | |

Der Bruch steht für sich, weil ein Konflikt keine schwerere Fracht ist, sondern **gestoppte**
Arbeit. Der Haken ist da, damit „sauber" sichtbar ist statt als Abwesenheit von Zeichen — so
sieht sonst „nicht gemessen" aus.

Auf dieser Maschine gemessen: 25 von 90 Repos haben Stash-Einträge, eines davon 16. Arbeit, die
in keinem Commit und in keinem Baum liegt und die sonst nichts anzeigt.

**Die App misst nicht.** Sie liest `snapshot.json` und sagt in der Kopfzeile, wann der gemessen
wurde — ein Bild ohne seinen Zeitstempel behauptet, aktuell zu sein.

Gezeichnet wird mit PixiJS über WebGL. Der Grund ist gemessen: derselbe Hafen im DOM kostete in
Werft 8,4 % CPU im Leerlauf, und das bei weniger Detail.

## Punkte

```sh
pnpm hafen punkte
```

Zwei Zahlen, nebeneinander und **nie addiert**:

- **Projektpunkte** sagen, was ein *Repository* angesammelt hat — alle Autoren. Ein geschäftiges
  gemeinsames Projekt steht hoch, und das ist richtig: die Zahl beschreibt das Projekt.
- **Deine Punkte** sagen, was *du* mit deiner Flotte gemacht hast. Eigene Commits, plus zwei
  Dinge, die kein einzelnes Repository zeigen kann: wie viele Projekte du gleichzeitig hältst
  (*Breite*) und wie viele Bäume du sauber hinterlässt (*Ordnung*).

Die Trennung ist der Punkt: 23 000 Punkte aus einem Projekt mit 110 Mitwirkenden sind keine
persönliche Leistung.

Gewichtet wird nach Conventional-Commit-Typ (`feat` 3, `fix`/`perf` 2, der Rest 1), plus 2 pro
gelandetem Pull Request. Ein Commit ohne Convention zählt trotzdem — eine Null neben 2000 Commits
wäre eine fehlende Konvention und keine Untätigkeit, und wie viele es sind, steht dabei.

PRs werden **lokal** gezählt, ohne die Forge zu fragen: als Menge von Nummern aus Merge-Commits
(`Merge pull request #123`) *und* Squashes (`… (#123)`). Beide Formen kommen vor, oft im selben
Repo — wer nur Merge-Commits zählt, meldet für ein squash-merging Projekt eine glatte Null.

Der Snapshot trägt die **Rohzahlen**, nicht die Punkte. Eine andere Gewichtung kostet damit keine
neue Messung — was zählt, weil der erste Satz Gewichte immer falsch ist.

Eigene Adressen: `git config user.email`, erweiterbar über `HAFEN_EMAILS` (komma-getrennt). Ohne
eine bekannte Adresse wird **nicht** gescort — jeder Commit zählte sonst als fremder.

## Aufbau

```
packages/core   Messung und Auswertung. Kennt keine Umgebung — alles über Ports.
packages/cli    Node-Adapter und Textausgabe.
apps/harbor     Das Fenster. Liest einen Snapshot, misst nichts.
```

`packages/core` importiert kein `node:fs` und kein `child_process`. Dadurch läuft dieselbe Logik
in der CLI, im Fenster und im Test gegen einen Mock.

Im Fenster gilt derselbe Schnitt noch einmal: `fleet.ts` und `hull.ts` rechnen aus, *was*
gezeichnet wird — Reihenfolge, Segmente, Tiefgang — und sind zu 100 % gemessen. `scene.ts`
zeichnet nur und ist als einziges von der Coverage ausgenommen, weil über Pixel keine Zusicherung
möglich ist, die kein Screenshot wäre. Der Blindfleck ist damit klein und benannt.

Der Kern stammt aus Werft, einem lokalen Agenten-Cockpit, das nicht weitergeführt wird. Was hier
liegt, ist der Teil davon, der eine Frage an Repositories stellt statt an einen Menschen — und
damit der Teil, der ohne ständige Aufmerksamkeit etwas wert ist.

## Tests

```sh
pnpm test:lint
pnpm test:unit
```
