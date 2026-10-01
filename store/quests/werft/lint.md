---
id: lint
kette: werft
titel: 'Lint: ein Schritt, der falschen Code findet — und jemand ruft ihn auf'
gilt_fuer: [node, rust]
pruefung:
  art: datei
  checks:
    - pruef: rolle
      rolle: lint
      frage: 'irgendein Schritt dieses Schiffs misst Lint — unter welchem Namen und mit welchem Werkzeug auch immer'
    - pruef: rolle-in-ci
      rolle: lint
      frage: 'ein CI-Workflow ruft ihn auf'
warum: >
  Ohne Lint-Schritt wird jede Abnahme von Hand neu verhandelt, und das ist der Posten, der sich
  pro Auftrag wiederholt statt einmal zu kosten. Die Einführung in IT4Change/dornsloops hat zwei
  echte Fehler aufgedeckt, die vorher niemandem aufgefallen waren: einen Import ohne Dateiendung,
  an dem `npm run add` mit ERR_MODULE_NOT_FOUND abbrach, und einen Regex mit verschachteltem
  Quantor in der URL-Erkennung. Und einer, den niemand aufruft, ist keiner — er fällt erst auf,
  wenn zufällig jemand hinsieht.
---

# Lint: ein Schritt, der falschen Code findet — und jemand ruft ihn auf

Diese Quest ist sprachneutral, und das ist ihr Zweck: *was* ein Standard fordert, unterscheidet
sich zwischen Sprachen, *dass* er gilt, nicht. Eine Rust-Crate erfüllt sie über
`cargo clippy --all-targets -- -D warnings`, ein Python-Projekt über `ruff check`, ein
Node-Projekt über eslint. Werft misst die Rolle am Befehl und nicht am Namen des Skripts
(`role.ts`), also vermisst sie damit auch fremde Repos ehrlich, ohne ihnen eine Hausnorm zu
unterstellen. Die Hausnorm steht daneben, in `lint-standard`.

Ob der Schritt **grün** ist, gehört nicht hier herein, sondern an diese Quest heran: `lint` ist
verletzt, wenn der Schritt fehlt — beschädigt, wenn er rot ist. Die Messung dafür liegt in
`0029-ein-roter-vertragsschritt-muss-in-der-ra`.
