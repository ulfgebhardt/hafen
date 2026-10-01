---
id: geschuetzter-hauptzweig
kette: auslauf
titel: 'Auf den Hauptzweig kommt nichts ohne Review und grüne Checks'
setzt_voraus: [release-please]
gilt_fuer: [node]
pruefung:
  art: forge
  checks:
    - pruef: forge-schutz
      art: forge
      fordert: pull-request, status-checks
      frage: 'der Hauptzweig verlangt einen Pull Request und bestandene Checks'
warum: >
  Ein Hauptzweig ohne Schutz ist eine Zusage, die jeder einzelne Push wieder zur Disposition
  stellt — und sie wird nicht gebrochen, weil jemand nachlässig ist, sondern weil an einem
  Freitagabend etwas dringend war. Die Regel gehört deshalb dorthin, wo sie niemand umgehen kann,
  und nicht in eine Vereinbarung. Dass die Checks grün sein müssen, ist die zweite Hälfte: ein
  Review, der einen roten Lauf durchwinkt, ist ein Review, das den Lauf abschafft.
---

# Auf den Hauptzweig kommt nichts ohne Review und grüne Checks

**Diese Quest wird gemessen, sobald die Forge gelesen wurde — und sonst `nicht messbar`.**

Ob ein Zweig geschützt ist, steht nirgends im Repository — es steht in der GitHub-API. Der Hafen
fragt keine Forge: viele dieser Arbeitsbäume sind nicht allein unsere, und ein Werkzeug, das beim
bloßen Ansehen einer Liste Anfragen nach draußen schickt, tut das ungefragt. `art: forge` ist
deshalb genau das, wofür das fünfte Urteil existiert: die Forderung steht geschrieben, der Hafen
sagt ehrlich, dass er sie nicht prüfen kann, und erfindet weder ein `erfüllt` noch ein `verletzt`.

Der Unterschied zu `nicht anwendbar` ist der Punkt: die Forderung **gilt**. Sie wird nur nicht
gemessen. Wer sie prüfen will, tut es mit einem Blick in die Einstellungen — und der Hafen sagt
ihm wenigstens, dass dieser Blick aussteht, statt so zu tun, als sei die Frage beantwortet.

`setzt_voraus: [release-please]` ordnet die beiden: ein geschützter Zweig, auf den nur ein
Release-PR trifft, ist die Form, in der das hier gemeint ist. Solange release-please fehlt, steht
diese Quest auf `Voraussetzung offen` — und nicht auf `verletzt`, was sie zu einer zweiten
Meldung derselben Lücke machen würde.

Messbar würde sie mit einem Zugang zur Forge. Das wäre eine Entscheidung über den Zuschnitt des
Werkzeugs und keine Erweiterung dieser Datei.
