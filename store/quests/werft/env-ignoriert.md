---
id: env-ignoriert
kette: werft
titel: 'Secrets: .gitignore nennt .env, bevor jemand eine anlegt'
gilt_fuer: [node]
voraussetzungen: [gitignore]
pruefung:
  art: datei
  checks:
    - pruef: datei-enthaelt
      datei: .gitignore
      text: .env
      frage: 'die .gitignore nennt .env'
warum: >
  Ein committetes `.env` ist der häufigste Weg, auf dem ein Secret in ein Repository kommt — und
  der schlechteste, weil `git` es danach für immer behält, auch nach dem Löschen. Die Zeile kostet
  nichts und muss dastehen, *bevor* jemand die Datei anlegt: danach fragt `git add -A` nicht mehr.
  Gemessen: 11 von 40 node-Repos mit einer .gitignore nennen `.env`.
---

# Secrets: .gitignore nennt .env, bevor jemand eine anlegt

Die Reihenfolge ist der ganze Punkt. Nach dem Unfall hilft die Zeile nicht mehr: der Wert steht in
der Historie, und ihn herauszubekommen heißt, das Repository umzuschreiben und jeden Klon
wegzuwerfen. Davor kostet sie sieben Zeichen.

Wo es gar kein `.env` gibt, ist die Zeile trotzdem richtig — sie kostet nichts und beschreibt, was
passieren soll, wenn doch eines entsteht. Eine Forderung, die erst gilt, sobald der Fehler möglich
ist, ist eine, die man zu spät stellt.

`voraussetzungen: [gitignore]` — ohne `.gitignore` ist das hier nicht verletzt, sondern wartet:
verlangt würde sonst zweimal dieselbe Datei, und die erste Meldung wäre die nützlichere.
