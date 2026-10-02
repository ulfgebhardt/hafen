---
id: dependabot
kette: auslauf
titel: 'Abhängigkeiten werden nachgeführt, ohne dass jemand daran denkt'
gilt_fuer: [node]
pruefung:
  art: datei
  checks:
    - pruef: datei
      datei: .github/dependabot.yml
      frage: 'eine Dependabot-Konfiguration liegt im Repo'
warum: >
  Eine Abhängigkeit altert, ob jemand hinsieht oder nicht, und ein Projekt, das zwei Jahre nicht
  aktualisiert wurde, ist nicht stabil, sondern nur still. Der Unterschied zeigt sich beim ersten
  Sicherheitsproblem: wer laufend kleine Sprünge macht, hat einen Patch; wer nicht, hat eine
  Migration. Dependabot macht die Arbeit sichtbar, bevor sie dringend ist — entscheiden muss
  weiterhin ein Mensch, der Vorschlag kommt als PR.
---

# Abhängigkeiten werden nachgeführt, ohne dass jemand daran denkt

Gemessen wird die **Datei**, nicht der Dienst. Das ist eine Grenze, die hier benannt gehört:
GitHub kennt zwei Dinge unter diesem Namen. *Security Updates* lassen sich in den Einstellungen
des Repositories einschalten und brauchen keine Datei — diese Quest sieht sie nicht und behauptet
dann eine Lücke, die es womöglich nicht gibt. *Version Updates*, das laufende Nachführen, brauchen
`.github/dependabot.yml`, und genau das ist gefordert.

Auf dieser Flotte am 30.09.2026 gemessen: **11 von 45 gebundenen Repositories** haben die Datei,
34 fehlt sie.

Die Zahl steht hier, weil sie beim ersten Anlauf falsch war: ein `find -maxdepth 3` über
`<org>/<repo>/.github/` ist eine Ebene zu flach und meldete null. Die Quest selbst hat es richtig
gemessen. Das ist genau der Zweck einer ausgeführten Prüfung gegenüber einer erinnerten Zahl —
und der Grund, warum in diesem Werkzeug nichts ohne seine Evidenz danebensteht.

Die Einstellungs-Variante prüfbar zu machen hieße, die Forge zu fragen — siehe
`geschuetzter-hauptzweig`, das denselben Blindfleck ausdrücklich stehen lässt.
