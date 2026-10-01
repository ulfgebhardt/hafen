---
id: gitignore
kette: werft
titel: 'Gitignore: das Repo sagt, was nicht hineingehört'
gilt_fuer: [node, rust]
pruefung:
  art: datei
  checks:
    - pruef: datei
      datei: .gitignore
      frage: '.gitignore liegt im Wurzelverzeichnis'
warum: >
  Ohne `.gitignore` landet irgendwann etwas im Repo, das dort nicht hingehört — ein
  `node_modules`, ein Build-Ordner, eine `.env`. Die ersten beiden kosten Platz und Merge-Konflikte,
  das dritte kostet ein Secret. Und es fällt beim Committen nicht auf, weil `git add -A` nichts
  fragt. Gemessen: 40 von 44 node-Repos tragen eine.
---

# Gitignore: das Repo sagt, was nicht hineingehört

Nur die Existenz, nicht der Inhalt. Was ignoriert gehört, unterscheidet sich zwischen Sprachen,
Werkzeugen und Jahren — `dass` die Frage beantwortet wurde, nicht.

Im Wurzelverzeichnis und nicht irgendwo: git liest `.gitignore` zwar in jedem Verzeichnis, aber
eine Datei tief im Baum sagt nichts darüber, ob das Repository als Ganzes eine Antwort hat.
