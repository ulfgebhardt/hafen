---
id: aktualisierung
kette: auslauf
titel: 'Ein ausgeliefertes Binary kommt an seine nächste Fassung'
gilt_fuer: [tauri]
pruefung:
  art: datei
  checks:
    - pruef: ci-nennt
      text: includeUpdaterJson
      frage: 'das Release veröffentlicht die Datei, die ein laufendes Binary fragt'
    - pruef: ci-nennt
      text: TAURI_SIGNING_PRIVATE_KEY
      frage: 'der Build signiert, sonst installiert der Updater nichts'
warum: >
  Eine Web-App aktualisiert sich beim Neuladen; ein Binary tut es nie von allein. Ohne einen
  Update-Pfad ist die Fassung, die jemand einmal geladen hat, die letzte, die er hat — das Werkzeug
  altert dann beim Nutzer und nicht beim Autor, und jeder gefixte Fehler bleibt bei dem, der ihn
  gemeldet hat, stehen. Zwei Dinge müssen dafür zusammenkommen: eine Datei im Release, die sagt,
  was die neueste Fassung ist, und eine Signatur, ohne die der Updater nichts annimmt. Der eine
  fehlt laut, der andere still — und deshalb werden beide geprüft und nicht nur der stille.
---

# Ein ausgeliefertes Binary kommt an seine nächste Fassung

## Warum zwei Checks und nicht einer

Weil es zwei unabhängige Fehler sind — und gemessen am 02.10.2026 verhalten sie sich **nicht**
gleich. Hier stand vorher, beide würden den Build grün lassen. Ein lokaler `tauri build` hat das
widerlegt, und der Unterschied ist das Interessante.

`TAURI_SIGNING_PRIVATE_KEY` **bricht laut ab**. Mit `createUpdaterArtifacts: true` und einem
pubkey in der Konfiguration endet der Build mit „A public key has been found, but no private key".
Das ist der freundliche der beiden Fehler: er ist nicht zu übersehen, und niemand veröffentlicht
versehentlich Installer ohne Signatur. Geprüft wird er trotzdem — ein roter Build ist eine
Rückmeldung an den, der gerade releast, und kein Zustand, der im Repository aufgeschrieben steht.
Die Quest beantwortet die andere Frage: *schuldet* dieses Repo einen Update-Pfad und hat es ihn.

`includeUpdaterJson` **schweigt**. Ohne die Eingabe liegt im Release eine `.sig` neben jedem
Installer, aber keine `latest.json` — der Build ist grün, die Dateien sehen vollständig aus, und
ein laufendes Binary fragt eine Adresse ab, unter der nichts steht. Es meldet das nicht, weil der
Hafen genau diesen Fehler absichtlich schluckt: wer offline ist, hat kein Problem mit dem Werkzeug.
Ein Release ohne Update-Datei sieht von außen also exakt so aus wie eines, bei dem alle schon
aktuell sind. Das ist der Fehler, für den diese Quest existiert.

## Was hier *nicht* geprüft wird, und warum nicht

Die dritte Bedingung ist der öffentliche Schlüssel in `tauri.conf.json` samt Endpunkt. Sie bleibt
ungemessen, und das ist eine Entscheidung und kein Versehen: diese Datei liegt bei einer einzelnen
App unter `src-tauri/`, in einem Monorepo unter `apps/<name>/src-tauri/`, und eine Quest mit einer
Kandidatenliste wäre genau die Rateliste, die dieses Werkzeug sonst überall ablehnt. Ein
`verletzt` aus einem falsch geratenen Pfad wäre schlechter als die Lücke, die hier benannt steht.

Dass die Datei existiert und wo, ist dagegen gemessen — über `gilt_fuer: [tauri]`, das `git`
fragt und nicht rät. Ein Repository ohne Tauri-Config bekommt `nicht anwendbar` und keine
erfundene Forderung: eine Bibliothek liefert kein Binary aus und schuldet ihm keinen Update-Pfad.

## Was die Flotte dazu sagt

Gemessen am 02.10.2026 über 92 Repositories: **89 nicht anwendbar**, zwei erfüllt, eines nicht
messbar. Genau diese Verteilung ist der Grund für den Merkmalswert. Ohne ihn hätte die Forderung
89-mal eine Lücke behauptet, wo kein Binary ausgeliefert wird — und eine Quest, die fast überall
falsch steht, liest nach einer Woche niemand mehr.

Das nicht messbare ist `werft`: eine Tauri-App ohne einen einzigen Workflow. Dort ist nichts zu
lesen, also wird nichts behauptet — **unmessbar ist nicht verletzt**, und das fünfte Urteil tut
hier dieselbe Arbeit wie beim geschützten Hauptzweig.

## Die Prüfung ist an eine Vokabel gebunden, und das steht hier

`includeUpdaterJson` ist der Name, den `tauri-action` **in Major 0** für die Veröffentlichung der
Update-Datei verwendet. In Major 1 (seit 29.06.2026) heißt dieselbe Eingabe `uploadUpdaterJson`.
Unbekannte Eingaben verwirft GitHub Actions mit einer Warnung — ein Upgrade ohne Umbenennen baut
also durch, ist grün und lädt die Datei nicht hoch, und **diese Quest fände das nicht**: sie sucht
die Zeichenkette, und die steht dann noch im Workflow.

Das ist die Grenze einer Praxis-Messung und kein Argument gegen sie. Ein fester Dateipfad hätte
dieselbe Grenze plus eine zweite (`ci-nennt` oben). Wer die Major wechselt, zieht diesen Text mit —
und der Workflow sagt es an der Stelle noch einmal.

## Herkunft

Das Muster kommt aus tome-of-addons, wo es läuft. Was dort gelernt wurde und hier als Check steht,
ist die Reihenfolge: der Schlüssel gehört in die Umgebung des Build-Jobs, nicht in die `with:`-Liste
der Action — ein Secret als Eingabe eines Schritts steht im Log, sobald irgendetwas es
weiterreicht.
