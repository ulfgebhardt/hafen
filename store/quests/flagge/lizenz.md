---
id: lizenz
kette: flagge
titel: 'Lizenz: das Repo sagt, was jemand damit darf'
gilt_fuer: [node, rust]
pruefung:
  art: datei
  checks:
    - pruef: datei-eine-von
      dateien: LICENSE, LICENSE.md, LICENCE, LICENCE.md, COPYING
      frage: 'eine Lizenzdatei liegt im Wurzelverzeichnis'
warum: >
  Ohne Lizenzdatei gilt das Urheberrecht in seiner strengsten Form: alle Rechte vorbehalten,
  niemand darf den Code benutzen, auch nicht der Kunde, dem er geliefert wurde. Das ist fast nie
  gemeint und fällt erst auf, wenn es jemand braucht — beim Fork, beim Audit, beim Onboarding.
  Gemessen über die Flotte: 26 von 44 node-Repos tragen eine, die anderen 18 sagen ungewollt
  „nein".
---

# Lizenz: das Repo sagt, was jemand damit darf

Fünf Schreibweisen, weil es fünf gibt. `LICENSE` und `LICENSE.md` halten sich hier ungefähr die
Waage (16 zu 10), `LICENCE` ist die britische Form und `COPYING` die GNU-Tradition. Eine Quest,
die einen Pfad nennt, meldete bei zehn Repositories eine Lücke, die genau das tun, was gefordert
ist — dasselbe Argument, aus dem es `ci-nennt` gibt.

**Welche** Lizenz, steht bewusst nicht hier. Das ist eine Entscheidung pro Projekt und oft pro
Kunde; was hier gefordert wird, ist nur, dass die Frage beantwortet ist.
