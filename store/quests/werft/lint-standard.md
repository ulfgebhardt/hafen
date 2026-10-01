---
id: lint-standard
kette: werft
titel: 'Und er ist der Hausstandard: eslint-config-it4c'
setzt_voraus: [lint]
gilt_fuer: [node]
pruefung:
  art: datei
  checks:
    - pruef: haus-name
      rolle: lint
    - pruef: abhaengigkeit
      paket: eslint-config-it4c
    - pruef: datei-enthaelt
      datei: eslint.config.ts
      text: eslint-config-it4c
      frage: 'eslint.config.ts baut auf eslint-config-it4c auf'
    - pruef: datei-enthaelt
      datei: prettier.config.ts
      text: eslint-config-it4c/prettier
      frage: 'prettier.config.ts re-exportiert eslint-config-it4c/prettier'
    - pruef: datei
      datei: .tool-versions
      frage: 'die Node-Version ist gepinnt'
    - pruef: manuell
      art: manuell
      frage: 'eslint läuft mit --max-warnings 0'
    - pruef: manuell
      art: manuell
      frage: 'jede Abweichung von der Basis steht mit Begründung in eslint.config.ts'
warum: >
  Ein Hausstandard, der pro Projekt neu verhandelt wird, ist keiner: dieselbe Diskussion über
  dieselbe Regel, einmal je Repo. eslint-config-it4c hat die Entscheidungen einmal getroffen —
  und darunter die eine, die sonst offen bleibt: Prettier läuft als eslint-Regel und nicht als
  zweiter Lauf, denn zwei Werkzeuge, die über dieselben Zeilen entscheiden, brauchen eine
  Instanz, die sagt, wer gewinnt. Diese Quest gilt nur für Node-Schiffe; eine Rust-Crate erfüllt
  `lint` und schuldet hier nichts.
---

# Und er ist der Hausstandard: eslint-config-it4c

Nicht erfunden, sondern aus `ulfgebhardt/werft` und der Einführung in `IT4Change/dornsloops`
extrahiert. Beide erfüllen ihn, und damit ist er gegen zwei Schiffe abgeglichen statt gegen eine
Meinung.

## Die zwei Prüfungen von Hand, und warum sie es bleiben

**`--max-warnings 0`.** Eine Warnung, die bleiben darf, wird nach dem dritten Lauf nicht mehr
gelesen, und dann ist der ganze Lauf Dekoration — dieselbe Begründung wie bei `0029` für den
roten Schritt, eine Stufe früher. Messbar wäre es: der Befehl steht in der `package.json`. Nur
führt `Contract` ihn heute nicht mit, und das zu ändern ist eine Entscheidung über `contract.ts`
und nicht über diesen Katalog — sie liegt in
`0262-max-warnings-0-ist-messbar-sobald-der-ve`.

**„Jede Abweichung mit Begründung".** Die Forderung lautet nicht „keine Overrides" — dornsloops
braucht acht, und jeder davon ist echt (Nuxt leitet Komponentennamen aus Dateipfaden ab, `play()`
lehnt aus Browser-Gründen ab, ein CLI schreibt auf stdout). Sie lautet „keine unbegründete", und
dass ein Kommentar über einem `rules`-Block *stimmt*, ist nicht maschinell prüfbar. Der
Blindfleck wird benannt, statt ihn zu simulieren.

> Nebenbefund für `IT4Change/eslint-config-it4c`:
> `@eslint-community/eslint-comments/require-description` ist in `recommended` aus. Angeschaltet
> wäre die Begründungspflicht für *inline* `eslint-disable` maschinell geprüft, und die zweite
> Handprüfung schrumpfte auf die Config-Datei.
