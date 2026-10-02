# Changelog

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
