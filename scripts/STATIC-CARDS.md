# Statische Rollen- und Blogkarten

Die redaktionellen Quellen bleiben `assets/js/roles-data.js` und `assets/js/posts.js`.
Die Website lädt diese Dateien für die Karten nicht mehr im Browser. Texte und Links
stehen bereits in `index.html`, `blog.html` und `arbeitsproben.html`.

Nach Änderungen an Rollen oder Blogdaten, vor Commit und Veröffentlichung:

```sh
node scripts/build-static-cards.cjs
node scripts/build-static-cards.cjs --check
```

Node.js 22 oder neuer genügt; keine Pakete installieren. Das Skript aktualisiert nur
die mit `generated:roles` bzw. `generated:posts` markierten Bereiche. Diese Bereiche
nicht von Hand bearbeiten. Datumsangaben werden unabhängig von der lokalen Zeitzone
erzeugt. `--check` schreibt nichts und schlägt bei veralteten Karten fehl.

JavaScript ergänzt das Karussell und blendet beim Filtern vorhandene Artikelkarten
ein oder aus. Ohne JavaScript bleiben alle Rollen und Beiträge lesbar; Filter und
Karussellsteuerung werden erst bei erfolgreicher Initialisierung angezeigt.

Die GitHub-Prüfung meldet veraltete Karten. Sie erzeugt keine automatischen Commits
und ändert die vorhandene GitHub-Pages-Veröffentlichung nicht.
