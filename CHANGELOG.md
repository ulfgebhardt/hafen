# Changelog

## [1.3.1](https://github.com/ulfgebhardt/hafen/compare/v1.3.0...v1.3.1) (2026-10-06)


### Bug Fixes

* **core:** Repos bis zehn Ebenen tief suchen statt vier ([#37](https://github.com/ulfgebhardt/hafen/issues/37)) ([d52a389](https://github.com/ulfgebhardt/hafen/commit/d52a389415ed2d8c2e70c4ecced126d3a4f1a58b))
* **ui:** Esc hebt die Auswahl auf, Trackpad-Zoom proportional statt in Sprüngen ([#36](https://github.com/ulfgebhardt/hafen/issues/36)) ([203da40](https://github.com/ulfgebhardt/hafen/commit/203da40b466cd88dbc336912481d966b081d55f6))
* **ui:** Kopfzeile kompakter, Wurzel-Popup im Fenster und über dem Datenblatt; e2e auch in WebKit ([#38](https://github.com/ulfgebhardt/hafen/issues/38)) ([f346189](https://github.com/ulfgebhardt/hafen/commit/f346189b65a9e0fc1a163e46df8e324b4f7a247f))
* **ui:** Textfarben als gemessene Rollen, Kleingedrucktes erreicht WCAG AA ([#32](https://github.com/ulfgebhardt/hafen/issues/32)) ([fc946f9](https://github.com/ulfgebhardt/hafen/commit/fc946f940f1343c657d2cee94dbeb58a3f61cd33))


### Tests

* **ui:** axe prüft Kontrast am echten Rendering ([#34](https://github.com/ulfgebhardt/hafen/issues/34)) ([779926a](https://github.com/ulfgebhardt/hafen/commit/779926a571914a2ba34541e96c0aec95318f200e))
* **ui:** Palettengrau in Templates verboten, ink-off nur hinter disabled: ([#33](https://github.com/ulfgebhardt/hafen/issues/33)) ([25a81c2](https://github.com/ulfgebhardt/hafen/commit/25a81c26ea02dd6a46956f2ac70bc2cfa68bcbb0))

## [1.3.0](https://github.com/ulfgebhardt/hafen/compare/v1.2.2...v1.3.0) (2026-10-05)


### Features

* **ui:** Wurzeln in der Kopfzeile verwalten, hinzufügen durchsucht den Ordner ([#30](https://github.com/ulfgebhardt/hafen/issues/30)) ([22680fa](https://github.com/ulfgebhardt/hafen/commit/22680fa04efb8b4e9edbdfe1c8471c193f581225))

## [1.2.2](https://github.com/ulfgebhardt/hafen/compare/v1.2.1...v1.2.2) (2026-10-04)


### Bug Fixes

* **tauri:** macOS-Bundle ad-hoc signiert, aarch64 galt sonst als beschädigt ([#27](https://github.com/ulfgebhardt/hafen/issues/27)) ([fd93d20](https://github.com/ulfgebhardt/hafen/commit/fd93d208f8c2cd5d8c15c32d42948403ea65d778))
* **ui:** erster Start ohne Schnappschuss verwarf den gewählten Ordner ([#28](https://github.com/ulfgebhardt/hafen/issues/28)) ([a29bcc2](https://github.com/ulfgebhardt/hafen/commit/a29bcc23292f11b716f55557e151ef6a03d5386d))

## [1.2.1](https://github.com/ulfgebhardt/hafen/compare/v1.2.0...v1.2.1) (2026-10-03)


### Bug Fixes

* **core:** git status schreibt den Index nicht mehr, GIT_OPTIONAL_LOCKS=0 am ProcPort ([#25](https://github.com/ulfgebhardt/hafen/issues/25)) ([c505380](https://github.com/ulfgebhardt/hafen/commit/c5053804f76260194d36053429bd177e5ea034f2))

## [1.2.0](https://github.com/ulfgebhardt/hafen/compare/v1.1.1...v1.2.0) (2026-10-03)


### Features

* **core:** eigene Forges und Wurzeln stehen im Register, nicht im Code ([#19](https://github.com/ulfgebhardt/hafen/issues/19)) ([5fc9676](https://github.com/ulfgebhardt/hafen/commit/5fc967637bb3b222bb6b89bd19c42122fb6dfc3f))
* **core:** Storybook als eigene Prüfung, für Frontends ab 30 Komponenten ([#15](https://github.com/ulfgebhardt/hafen/issues/15)) ([7f9d072](https://github.com/ulfgebhardt/hafen/commit/7f9d072f383ad66df1205b6cdf439bc6450a5eed))
* **ui:** die Suche rahmt den ganzen Liegeplatz, und auf Wunsch zeichnet sie nur die Treffer ([#18](https://github.com/ulfgebhardt/hafen/issues/18)) ([73888fa](https://github.com/ulfgebhardt/hafen/commit/73888fa640c0b31b25dd2a3d755ea85514bf534b))


### Bug Fixes

* **core:** die Erkennung liest Build und Rollen, die sie vorher übersah ([#14](https://github.com/ulfgebhardt/hafen/issues/14)) ([9d39c9e](https://github.com/ulfgebhardt/hafen/commit/9d39c9e90e40322ddd1d85cc6dbf3da9f9373057))


### Miscellaneous Chores

* **core:** Beispielnamen statt der echten Flotte ([#17](https://github.com/ulfgebhardt/hafen/issues/17)) ([cafa4b2](https://github.com/ulfgebhardt/hafen/commit/cafa4b2be3a0563dbb764f2674b0b63dfa11c460))
* **core:** Beispielpfade statt einer persönlichen Verzeichniskonvention ([#20](https://github.com/ulfgebhardt/hafen/issues/20)) ([6e2f93c](https://github.com/ulfgebhardt/hafen/commit/6e2f93c62d70b0b662ac90a737711afba7ef7b2a))

## [1.1.1](https://github.com/ulfgebhardt/hafen/compare/v1.1.0...v1.1.1) (2026-10-02)


### Continuous Integration

* **release:** der Changelog zeigt jeden Typ, und der Titel-Check folgt Leuchtturm ([#12](https://github.com/ulfgebhardt/hafen/issues/12)) ([#12](https://github.com/ulfgebhardt/hafen/pull/12))

## [1.1.0](https://github.com/ulfgebhardt/hafen/compare/v1.0.0...v1.1.0) (2026-10-02)


### Features

* **ui:** Flotte ohne Archiv, Zoom bleibt beim Wechsel, die Seite folgt dem Schiff ([#7](https://github.com/ulfgebhardt/hafen/pull/7))


### Bug Fixes

* **app:** Waben zwischen den Stegenden, und jedes Becken geht zum naechsten Ufer ([#6](https://github.com/ulfgebhardt/hafen/pull/6))
* **release:** Cargo.lock zieht die Version mit ([#4](https://github.com/ulfgebhardt/hafen/pull/4))
* **tauri:** das Terminal des Nutzers, und beendete Kinder werden eingesammelt ([#8](https://github.com/ulfgebhardt/hafen/pull/8))
* **ui:** der Zoom bleibt auch beim Reiterwechsel ([#9](https://github.com/ulfgebhardt/hafen/pull/9))
* **ui:** die Kopfzeile rechnet vor, woraus deine Punkte bestehen ([#10](https://github.com/ulfgebhardt/hafen/pull/10))
* **ui:** Waben zwischen den Stegenden, und jedes Becken geht zum nächsten Ufer ([#6](https://github.com/ulfgebhardt/hafen/pull/6))

## 1.0.0 (2026-10-02)


### Features

* **app:** das Fenster bekommt eigene Ports -- und die Erlaubnisliste wandert an die Grenze
* **app:** das Fenster misst selbst -- ohne CLI, ohne Node, ohne Umgebungsvariable
* **app:** die Bordmittel werden einmal gefragt -- und gesagt
* **app:** die eine Frage, die der Hafen nicht messen kann -- wo die Projekte liegen
* **app:** ein ausgeliefertes Binary kommt an seine naechste Fassung
* **ci:** Releases fuer Linux, macOS und Windows aus den Commits
* **cli:** der Katalog reist mit, der Store ergaenzt ihn
* **core:** der geschuetzte Hauptzweig ist messbar -- aus einer Datei, nicht aus dem Netz
* **core:** die Zeilen im Baum sind gemessen, und die Punkte rechnen sich auf
* **core:** ein zweiter Remote ist nicht automatisch ein Spiegel
* **core:** eine Datei dort suchen, wo die CI sie nennt
* **core:** ob gebaut wird, ist messbar -- und war es die ganze Zeit
* **core:** wer zusammengehoert, wird gemessen -- und die verwandten Docks liegen nebeneinander
* **tauri:** Messen friert nicht mehr ein, zeigt Fortschritt und laesst sich abbrechen
* **ui:** Autoren starten am eigenen Schiff und gehen an Bord
* **ui:** der Katalog wird eine Ansicht, die Flagge bekommt Luft, das Terminal die richtige Shell
* **ui:** die Ablage wird begehbar, und wo gearbeitet wird, laeuft ein Kran
* **ui:** die Flagge weht ueber dem Schiff, und ein Wechsel laesst sie stehen
* **ui:** die Flottenkarte wird gepackt statt gefaechert
* **ui:** die Flottenkarte zeichnet jede Sippe als Ring auf einem Sechseckgitter
* **ui:** die Frage zuerst, die Seite danach -- zwei Knoepfe vor den Tabs
* **ui:** die Groesse eines Schiffs kommt aus Commits und Autoren -- und variiert endlich sichtbar
* **ui:** die Suche markiert, statt einen anderen Hafen zu zeichnen
* **ui:** ein Graben um jedes Becken, damit die Cluster zaehlbar werden
* **ui:** eine Flaeche statt eines Rundwegs, und der Kran dreht sich
* **ui:** Haufen statt Reihen, eine Farbe je Sache, und Groesse, die wirklich skaliert
* **ui:** keine Fenster von oben, Steg am Remote, und was offen ist, steht in der Zeichnung
* **ui:** offene Issues und PRs stehen auf der Ablage
* **ui:** Stege in Kaigrau, und die Gruppe sagt ein Wimpel
* **ui:** Verkehr auf jedem Steg, und die Boote fahren nicht mehr auf den Wegen
* **ui:** was die Forge sagt, nach vorn -- und offene Arbeit wird gezeichnet


### Bug Fixes

* **app:** der Bundle-Identifier nennt die Domain, die es gibt
* **app:** ein aelterer Schnappschuss blendet das Datenblatt nicht mehr aus
* **app:** open_url gab es nicht -- die Forge-Links haben nie funktioniert
* **cli:** das Register im Test ist das ganze Register ([#2](https://github.com/ulfgebhardt/hafen/pull/2))
* **cli:** das Render-Fixture kennt lineage ([#2](https://github.com/ulfgebhardt/hafen/pull/2))
* **tauri:** auf Windows heisst `git` nicht `git`
* **tauri:** das Kommando `forge` war nie registriert
* **ui:** der Kran springt nicht mehr, an Bord geht es ueber den Steg, und der Weg ist dieselbe Flaeche
* **ui:** der Name der Sippe steht wieder in der Mitte, und dort steht kein Schiff
* **ui:** die Abrechnung sagt, was ueberhaupt deins werden kann
* **ui:** die Zeichnung fragt den Wegegraph, statt ihn anzunehmen
* **ui:** ein Becken ist die gemessene Familie, sonst die Orga -- und der Abstand zur Mitte ist die Liegezeit
* **ui:** ein zweiter Klick waehlt ab, jede Wahl scrollt zu ihrer Zeile, und der Knopf sagt was er tut
* **ui:** eine Zahl, die nur aussah wie eine Messung -- und Verweise auf eine Datei, die es nicht mehr gibt


### Performance Improvements

* **core:** die Suche gehoert dem Dateisystem -- treesWith statt 2 174 Einzelfragen
* **core:** readDir sagt, was ein Eintrag ist -- und die Messung wird ein Drittel schneller
