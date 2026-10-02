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
  gemeldet hat, stehen. Zwei Dinge müssen dafür zusammenkommen, und beide sind leicht zu vergessen,
  weil ihr Fehlen den Build nicht rot macht: eine Datei im Release, die sagt, was die neueste
  Fassung ist, und eine Signatur, ohne die der Updater nichts annimmt. Ein Release, das signiert
  ohne zu veröffentlichen, oder veröffentlicht ohne zu signieren, sieht grün aus und aktualisiert
  niemanden.
---

# Ein ausgeliefertes Binary kommt an seine nächste Fassung

## Warum zwei Checks und nicht einer

Weil es zwei unabhängige Fehler sind und beide still passieren.

`includeUpdaterJson` ist die Veröffentlichung: ohne sie liegt im Release eine `.sig` neben jedem
Installer, aber keine `latest.json`, und ein laufendes Binary fragt dann eine Adresse ab, unter der
nichts steht. Es meldet das nicht — der Hafen schluckt genau diesen Fehler absichtlich, weil wer
offline ist kein Problem mit dem Werkzeug hat. Also sieht ein Release ohne Update-Datei von außen
exakt so aus wie eines, bei dem alle schon aktuell sind.

`TAURI_SIGNING_PRIVATE_KEY` ist die Bedingung, dass das Angebot angenommen wird. Fehlt der
Schlüssel in der Umgebung, baut der Job **grün** durch und legt Installer ohne `.sig` ab; der
Updater prüft die Signatur gegen den öffentlichen Schlüssel und lehnt dann jede Fassung ab. Das ist
der unangenehmere der beiden Fehler, weil er nach einem erfolgreichen Release aussieht und erst bei
dem auffällt, der aktualisieren wollte.

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
