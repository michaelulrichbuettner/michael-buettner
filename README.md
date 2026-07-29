# Website Michael Büttner

Eine einfache statische Website für GitHub Pages.

## Struktur

- `index.html`: Startseite mit Kurzprofil und den drei neuesten Einblicken
- `erfahrung.html`: Lebenslauf und berufliche Stationen
- `masterarbeit.html`: Masterarbeit zu Synthetic Video Journalism
- `arbeitsproben.html`: Texte, die als Arbeitsproben markiert sind
- `blog.html`: Einblicke-Seite mit Tag-Filter
- `kontakt.html`: Kontaktformular, aktuell als Mailto-Fallback vorbereitet
- `experimente.html`: Experimente, darunter die interaktive Vogelkarte
- `impressum.html`: Anbieterkennzeichnung, nur im Footer verlinkt
- `datenschutz.html`: Datenschutzhinweise, im Footer und beim Kontaktformular verlinkt
- `assets/js/posts.js`: Einblicke-Daten und Markierung für Arbeitsproben
- `assets/css/styles.css`: Gestaltung der Website

## Neue Einblicke eintragen

Neue Beiträge werden in `assets/js/posts.js` ergänzt. Ein Eintrag hat diese Felder:

```js
{
  title: "Titel des Beitrags",
  date: "2026-06-20",
  lang: "de",
  tags: ["KI", "Medien"],
  excerpt: "Kurzer Anrisstext.",
  url: "#",
  workSample: true
}
```

`workSample: true` bedeutet, dass der Beitrag auch auf der Seite `arbeitsproben.html` erscheint.

## Vogelkarte aktualisieren

Die öffentliche Datei `data/vogelbeobachtungen.json` wird aus einem persönlichen
eBird-Life-List-Export erzeugt. Der vollständige CSV-Export mit exakten Orten
darf nicht in das Repository kopiert werden.

```powershell
python scripts/import_ebird_life_list.py "C:\Pfad\zur\ebird_world_life_list.csv"
```

Wenn im Export eine neue Stadt vorkommt, muss zuerst ihr öffentlicher
Stadtmittelpunkt in `data/vogelorte.json` ergänzt werden. Das Importskript
bricht andernfalls ab, damit keine unbekannten oder exakten Orte versehentlich
veröffentlicht werden.

## Mehrsprachigkeit

Die erste Version ist deutsch. Für Englisch kann später eine parallele Struktur ergänzt werden, zum Beispiel:

- `en/index.html`
- `en/profile.html`
- englische Eintraege in `assets/js/posts.js` mit `lang: "en"`

## Veröffentlichung

Die Website kann später über GitHub Pages veröffentlicht werden. Dafür reicht es, die Dateien in ein GitHub-Repository zu laden und GitHub Pages für den Hauptordner zu aktivieren.
