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
  utopia-os/utopia-map                        main  Rost 200d
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

Was die Flotte fordert, liegt als Markdown im Store (Default
`~/.data/sources/ulfgebhardt/hafen-data`):

```
hafen-data/
  quests/werft/lint.md
  quests/werft/typecheck.md
  register.md
```

Ein einzelnes Repo darf in `.hafen/quests/` eigene Forderungen ergänzen. **Der Katalog führt:**
eine lokale Quest mit einer Id, die der Katalog schon fordert, wird verworfen — und das steht in
der Ausgabe, damit die Regel sichtbar ist.

## Das Fenster

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

**Die App misst nicht.** Sie liest `snapshot.json` und sagt in der Kopfzeile, wann der gemessen
wurde — ein Bild ohne seinen Zeitstempel behauptet, aktuell zu sein.

Gezeichnet wird mit PixiJS über WebGL. Der Grund ist gemessen: derselbe Hafen im DOM kostete in
Werft 8,4 % CPU im Leerlauf, und das bei weniger Detail.

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

Der Kern stammt aus [Werft](../werft), einem Agenten-Cockpit, das nicht weitergeführt wird. Was
hier liegt, ist der Teil, der eine Frage an Repositories stellt statt an einen Menschen.

## Tests

```sh
pnpm test:lint
pnpm test:unit
```
