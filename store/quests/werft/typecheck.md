---
id: typecheck
kette: werft
titel: 'Typecheck: der Compiler widerspricht, bevor die Laufzeit es tut'
gilt_fuer: [node]
pruefung:
  art: datei
  checks:
    - pruef: rolle
      rolle: typecheck
      frage: 'irgendein Schritt dieses Schiffs prüft Typen — unter welchem Namen und mit welchem Werkzeug auch immer'
    - pruef: rolle-in-ci
      rolle: typecheck
      frage: 'ein CI-Workflow ruft ihn auf'
warum: >
  `tsc --noEmit` läuft in Node nicht automatisch mit, und ein Editor, der grün zeigt, prüft nur
  die eine Datei, die gerade offen ist, nie das ganze Projekt auf einmal. Nur für Node: `role.ts`
  kennt für Rust noch keinen eigenen Typecheck-Befehl, `cargo build` und `cargo test` zählen dort
  bislang als `unit` — diese Quest träfe jede Rust-Crate als falsche Lücke, bevor diese Messung
  nachgezogen ist.
---

# Typecheck: der Compiler widerspricht, bevor die Laufzeit es tut

Dieselbe Trennung wie bei `lint`: *was* geprüft wird, ist eine Sprachfrage, *dass* etwas prüft,
nicht. Ob der Lauf grün ist, gehört nicht hier herein, sondern an diese Quest heran — `typecheck`
ist verletzt, wenn der Schritt fehlt, beschädigt, wenn er rot ist. Die Messung dafür liegt in
`0029-ein-roter-vertragsschritt-muss-in-der-ra`.
