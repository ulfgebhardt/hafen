---
id: build
kette: werft
titel: 'Ein Bau läuft durch — geprüft wird das Artefakt, nicht nur der Quelltext'
gilt_fuer: [node, rust]
pruefung:
  art: datei
  checks:
    - pruef: baut
      frage: 'ein Schritt dieses Schiffs baut das auslieferbare Artefakt — unter welchem Namen und mit welchem Werkzeug auch immer'
    - pruef: baut-in-ci
      frage: 'ein CI-Workflow ruft ihn auf'
warum: >
  Die drei Rollen des Vertrags urteilen über den Quelltext, keine über das Artefakt. Gemessen an
  Werft selbst am 29.09.2026: `lint`, `unit` und `e2e` standen grün, während `pnpm tauri build`
  auf dieser Maschine noch nie gelaufen war — und beim ersten Lauf scheiterte er. Nicht am Code,
  denn die Binärdatei entsteht in vier Minuten und das Frontend in drei Sekunden. Er scheiterte
  am letzten Schritt, dem Bündeln, und dorthin sieht keine der drei Rollen. Ein Werkzeug, von dem
  es kein Artefakt gibt, ist auch keines, das jemand installieren kann.
---

# Ein Bau läuft durch — geprüft wird das Artefakt, nicht nur der Quelltext

Diese Quest ist sprachneutral wie `lint`, und aus demselben Grund: *was* gebaut wird,
unterscheidet sich zwischen einer Rust-Crate, einem Nuxt-Mirror und einer Tauri-Anwendung, *dass*
am Ende ein Artefakt herauskommen muss, nicht. Sie fragt nicht nach einem Skriptnamen und nicht
nach einem Werkzeug — sie fragt, ob überhaupt jemand den Weg bis zum Ende geht.

## Warum beide Prüfungen heute von Hand sind

`CheckRole` kennt vier Rollen — `lint`, `typecheck`, `unit`, `e2e` (`role.ts`). Eine fünfte für
den Bau gibt es nicht, also kann diese Quest heute kein `pruef: rolle` stellen, und ohne die
Rolle auch kein `pruef: rolle-in-ci`. Dasselbe Muster wie bei den zwei Handprüfungen in
`lint-standard`: der Blindfleck wird benannt statt simuliert, und die Messung liegt in einem
eigenen Auftrag.

Dabei ist die Frage nicht bloß „noch eine Rolle dazu". Ein Bau ist der Grenzfall der Regel, die
`judges` und `namedAsWriter` in `role.ts` ziehen: ein Check darf den Baum nicht ändern, damit er
grün wird — und ein Bau **schreibt** in den Baum, `dist/` und `target/`. Der Unterschied ist, dass
er keine Quelldatei umschreibt, sondern neben sie legt; ob diese Unterscheidung messbar ist oder
ob der Bau eine eigene Kategorie neben den vier Rollen braucht, ist genau das, was der Auftrag zu
entscheiden hat.

## Was `gilt_fuer` hier noch nicht sagen kann

`SHIP_TRAITS` kennt `node` und `rust`, und keines der beiden heißt „hat ein Artefakt". Eine
Bibliothek, die als TypeScript-Quelle veröffentlicht wird, und ein Helmfile-Repo schulden hier
nichts — beide sind aber `node`. Solange die Prüfungen von Hand sind, kostet das nichts: eine
manuelle Antwort ist `nicht messbar` und damit ausdrücklich **nicht** `verletzt`, sie erzeugt
also keinen Kandidaten in der Rangliste (`contractCandidates` liest nur `violatedQuests`). Sobald
die Rolle da ist, muss dieselbe Frage beantwortet sein, sonst behauptet die Quest bei jedem
Repo ohne Artefakt eine Lücke — dieselbe Pauschale, gegen die der ganze Abschnitt „Quests"
geschrieben wurde.

## Der Befund, der sie ausgelöst hat

Bei Werft trennt sich der Bau in drei Teile, und nur der dritte war kaputt:

- `vite build` — 137 Module, 684 kB JS, 3 s.
- `cargo build --release` — 529 Crates, 4m13s kalt und 1m09s warm, eine 17-MB-Binärdatei.
- Das Bündeln — `appimagetool` verlangt `ARCH` und scheitert ohne es.

Der Bau lädt dabei fünf Binärdateien aus dem Netz nach (`AppRun`, `linuxdeploy` und drei
Plugins, von GitHub und `raw.githubusercontent.com`). Für die zweite Hälfte dieser Quest — „ein
CI-Workflow ruft ihn auf" — ist das der Punkt, an dem ein Läufer ohne Netz oder mit blockiertem
Egress nicht durchkommt, und zwar erst ganz am Ende eines Laufs, der vorher Minuten gekostet hat.

Der Befund steht ganz in `0275-werft-l-uft-nur-als-tauri-dev-es-gibt-ke`, die Behebung in dem
Auftrag, den er nennt.
