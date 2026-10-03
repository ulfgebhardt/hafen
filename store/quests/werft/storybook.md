---
id: storybook
kette: werft
titel: 'Storybook: jede Komponente rendert für sich, nicht nur im Ganzen'
gilt_fuer: [frontend]
ab_komponenten: 30
pruefung:
  art: datei
  checks:
    - pruef: storybook
      frage: 'die Komponenten haben Stories — Storybook ist deklariert, und Stories liegen daneben'
    - pruef: storybook-in-ci
      frage: 'ein CI-Workflow baut oder testet die Stories'
warum: >
  Unit-Tests prüfen Logik, E2E prüft den Weg durch die Anwendung — dass eine Komponente in jedem
  ihrer Zustände rendert, prüft keines von beiden. Ein Zustand, den der E2E-Pfad nicht durchläuft
  (leer, Fehler, langer Text), bricht unbemerkt. Eine Story hält genau diesen Zustand fest, und
  ein CI, das die Stories baut, scheitert, sobald einer davon nicht mehr rendert. Gemessen am
  02.10.2026: 25 Schiffe tragen ein Frontend, zwölf davon ab 30 Komponenten, drei davon mit
  Storybook.
---

# Storybook: jede Komponente rendert für sich, nicht nur im Ganzen

## Warum erst ab 30 Komponenten

Stories sind Pflege, und die lohnt sich erst, wo Komponenten wiederverwendet werden. Bei
Leuchtturm (286 Komponenten) oder peilung-app (162) fängt eine Story den Zustand, den sonst
niemand sieht. Bei fundgrube (15) oder pinne (6) wäre dieselbe Forderung Arbeit ohne
Gegenwert. Die Flotte hat bei 30 eine natürliche Lücke: von den 25 Frontends liegen 13 bei
höchstens 28 Komponenten, die übrigen zwölf bei mindestens 32. Darunter ist die Quest `nicht
anwendbar` — eine kleine Seite ohne Storybook ist nicht im Rückstand, sie wird nicht gefragt.

Die Schwelle ist eine Entscheidung und steht deshalb hier (`ab_komponenten`), nicht in
`probe.ts`. Gezählt werden die Dateien, die git verfolgt: `*.vue`, `*.tsx`, `*.jsx`, `*.svelte`,
ohne Stories, Specs und Tests.

## Warum gebaut so viel zählt wie getestet

`storybook build` rendert jede Story einmal, und eine, die nicht mehr rendert, lässt den Bau
scheitern. Ein CI, das die Stories nur baut, hält damit schon jede Komponente zum Rendern an —
`test-storybook`, `@storybook/addon-vitest` und `chromatic` gehen weiter (Interaktionen,
Barrierefreiheit, Bildvergleich), sind aber nicht die Schwelle dieser Quest.

## Warum eine eigene Prüfart und nicht die Rolle `unit`

`unit` heißt: Logik gegen ihre Erwartung. Story-Tests prüfen etwas anderes — dass eine
Komponente in einem Zustand rendert. Beides unter einer Rolle zu zählen, hieße, dass ein Schiff
mit Stories und ohne einen einzigen Unit-Test die Rolle `unit` erfüllt.
