---
id: unit
kette: werft
titel: 'Unit-Tests: Verhalten ist geprüft, nicht nur gelesen'
gilt_fuer: [node, rust]
pruefung:
  art: datei
  checks:
    - pruef: rolle
      rolle: unit
      frage: 'irgendein Schritt dieses Schiffs misst Unit-Tests — unter welchem Namen und mit welchem Werkzeug auch immer'
    - pruef: rolle-in-ci
      rolle: unit
      frage: 'ein CI-Workflow ruft ihn auf'
warum: >
  Ohne Unit-Schritt beweist nur der nächste Bug, dass eine Änderung etwas anderes kaputt gemacht
  hat als das, was gerade angefasst wurde — und der Beweis kommt dann beim Menschen an, nicht
  vorher. Sprachneutral wie `lint`: ein Node-Projekt erfüllt sie über `vitest`, eine Rust-Crate
  über `cargo test`, gemessen an der Rolle des Befehls und nicht am Namen des Skripts.
---

# Unit-Tests: Verhalten ist geprüft, nicht nur gelesen

Dieselbe Trennung wie bei `lint`: *was* geprüft wird, ist eine Sprachfrage, *dass* etwas prüft,
nicht. Ob der Lauf grün ist, gehört nicht hier herein, sondern an diese Quest heran — `unit` ist
verletzt, wenn der Schritt fehlt, beschädigt, wenn er rot ist. Die Messung dafür liegt in
`0029-ein-roter-vertragsschritt-muss-in-der-ra`.
