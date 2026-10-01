---
id: e2e
kette: werft
titel: 'E2E: der Pfad, den jemand tatsächlich geht, ist geprüft'
gilt_fuer: [node]
pruefung:
  art: datei
  checks:
    - pruef: rolle
      rolle: e2e
      frage: 'irgendein Schritt dieses Schiffs führt den Weg eines Menschen durch die Anwendung — unter welchem Namen und mit welchem Werkzeug auch immer'
    - pruef: rolle-in-ci
      rolle: e2e
      frage: 'ein CI-Workflow ruft ihn auf'
warum: >
  Unit-Tests beweisen, dass eine Funktion tut, was ihr Aufruf verspricht — nicht, dass der Weg
  durch die Oberfläche noch zusammenhängt. Der Fall, an dem sich diese Quest beweisen muss, ist
  nicht der Gap: ein Markdown-Repo hat weder die Spur `node` noch `rust` und ist damit
  automatisch `nicht anwendbar`, ohne dass diese Datei ein Wort darüber sagt.
---

# E2E: der Pfad, den jemand tatsächlich geht, ist geprüft

Dieselbe Trennung wie bei `lint`: *was* geprüft wird, ist eine Sprachfrage, *dass* etwas prüft,
nicht. Ob der Lauf grün ist, gehört nicht hier herein, sondern an diese Quest heran — `e2e` ist
verletzt, wenn der Schritt fehlt, beschädigt, wenn er rot ist. Die Messung dafür liegt in
`0029-ein-roter-vertragsschritt-muss-in-der-ra`.

## Der Blindfleck, den `gilt_fuer` noch nicht schließt

`gilt_fuer` kennt nur `node` und `rust` (`SHIP_TRAITS`), keine Spur für „hat eine Oberfläche".
Eine reine CLI oder ein API-Server ohne Frontend ist `node` und schuldet nach dieser Quest
trotzdem einen E2E-Schritt, den sie nicht braucht — dieselbe Pauschale, die der ganze Umbau
vermeiden sollte, nur eine Ebene feiner als die, die er schon löst. Eine eigene Spur dafür ist
eine Messung, die noch niemand gebaut hat, und gehört in einen eigenen Auftrag statt in eine
Behauptung in dieser Datei.
