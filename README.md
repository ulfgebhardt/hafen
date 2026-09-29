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

## Aufbau

```
packages/core   Messung und Auswertung. Kennt keine Umgebung — alles über Ports.
packages/cli    Node-Adapter und Textausgabe.
```

`packages/core` importiert kein `node:fs` und kein `child_process`. Dadurch läuft dieselbe Logik
in der CLI, in einem Fenster und im Test gegen einen Mock.

Der Kern stammt aus [Werft](../werft), einem Agenten-Cockpit, das nicht weitergeführt wird. Was
hier liegt, ist der Teil, der eine Frage an Repositories stellt statt an einen Menschen.

## Tests

```sh
pnpm test:lint
pnpm test:unit
```
