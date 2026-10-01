---
id: release-please
kette: auslauf
titel: 'Releases entstehen aus den Commits, nicht aus der Erinnerung'
gilt_fuer: [node]
pruefung:
  art: datei
  checks:
    - pruef: ci-nennt
      text: release-please
      frage: 'ein Workflow ruft release-please auf'
    - pruef: datei-aus-ci
      schluessel: config-file
      sonst: release-please-config.json
      frage: 'die Konfiguration liegt im Repo, nicht nur im Workflow'
warum: >
  Ein Release von Hand ist ein Arbeitsschritt, den genau eine Person kann, und der Changelog
  entsteht dabei aus dem Gedächtnis — also unvollständig, und immer zugunsten dessen, woran sich
  der Autor erinnert. release-please dreht das um: die Commits sind die Quelle, der Vorschlag
  steht als PR da, und die Entscheidung bleibt ein Klick eines Menschen. Auf dieser Flotte tun
  das zehn Repositories bereits; die Forderung schreibt nur auf, was dort schon Praxis ist.
---

# Releases entstehen aus den Commits, nicht aus der Erinnerung

Geprüft wird über `ci-nennt` und nicht über einen Dateinamen, und das ist der ganze Grund, warum
es diese Prüfart gibt. Gemessen auf dieser Flotte heißt der Workflow in fünf Repositories
`release.yml`, in einem `release-please-lint.yml`, in einem weiteren `ui-release.yml`. Eine Quest
mit festem Pfad hätte die Dateinamen gemessen statt der Praxis und hätte genau den Repositories
eine Lücke bescheinigt, die das Geforderte tun.

Die Konfigurationsdatei steht als zweiter Check daneben, weil ein Workflow ohne sie auf die
Vorgaben der Action zurückfällt: das funktioniert, ist aber nichts, was im Repository nachlesbar
wäre. Zehn Repositories dieser Flotte haben sie.

`gilt_fuer: [node]`, weil release-please hier für npm-Pakete eingesetzt wird. Eine Rust-Crate
released über `cargo-release` oder `cargo dist` und schuldet das hier nicht — sie bekommt
`nicht anwendbar` und keine erfundene Lücke.
