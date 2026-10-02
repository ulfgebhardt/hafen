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

## Wie gemessen wird

Beide Prüfungen messen, keine ist mehr von Hand. Der Bau ist dabei **keine fünfte Rolle**: eine
Rolle urteilt über den Quelltext und darf den Baum nicht ändern (`judges` in `role.ts`), ein Bau
schreibt in den Baum, `dist/` und `target/`. Deshalb hat er eine eigene Tabelle neben den Rollen
(`BUILD_COMMANDS`) und `judges` wird auf ihn nicht angewandt — ein Bau ist kein Richter.

- `baut` liest die Befehle der Skripte, nicht ihre Namen: `"bundle": "vite build"` baut,
  `"build": "turbo build"` übergibt nur. Ein Werkzeug, das keine Tabelle kennt, verrät sich am
  Unterbefehl (`vuepress build`, `storybook build`); und behauptet ein Skript per Namen einen
  Bau, läuft aber etwas Ungelesenes (`tsx esbuild.config.ts`), ist die Prüfung `nicht messbar`
  und nennt den Befehl — kein erfundenes `verletzt`.
- `baut-in-ci` liest die `run:`-Schritte, `run: |`-Blöcke eingeschlossen, und folgt einem
  `npm run build` in das Skript, das er aufruft (`Contract.buildsInCi`). Bis 02.10.2026 las sie
  jede Zeile für sich und bescheinigte neun Schiffen, die ihren Build in der CI laufen ließen,
  keinen zu haben.

## Was `gilt_fuer` hier noch nicht sagen kann

`SHIP_TRAITS` kennt kein Merkmal „hat ein Artefakt", und `node` heißt es nicht. Solange beide
Prüfungen von Hand waren, kostete das nichts: eine manuelle Antwort ist `nicht messbar`. Diese
Datei sagte voraus, was mit der Messung kommen würde — die Quest behauptet bei jedem Repo ohne
Artefakt eine Lücke. Gemessen am 02.10.2026 ist das eingetreten, in zwei Formen:

- **Nichts zu bauen.** `funkspruch-archiv` läuft als `node index.js` aus dem
  Quelltext, `lib_tween` ist eine PHP-Bibliothek mit einem Manifest daneben. Beide bekommen
  „kein Skript baut" und schulden doch kein Artefakt — das ist die falsche Lücke.
- **Gebaut wird nur in der CI.** Die sechs Leuchtturm-Rebrandings (`Leuchtturm-…`, `windstaerke`,
  `lernwerk`, `Brise-Net-…`, `Kutter-…`, `Lotsenverein-…`) tragen ein `package.json`
  ohne Skripte als Konfiguration und bauen ihr Docker-Image im Workflow. Das ist ein Bau, aber keiner, den jemand lokal anstoßen
  kann — ob das die Forderung erfüllt, ist eine Entscheidung und keine Messung.

Was fehlt, ist die Messung „dieses Schiff liefert etwas aus" — ein Merkmal, wie `tauri` eines ist
—, nicht eine Liste der Repos, denen der Bau erlassen wird. Bis dahin steht eine Befreiung im
Register, an einer Stelle und von Hand.

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
