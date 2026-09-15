# Website Michael Büttner

Eine einfache statische Website für GitHub Pages.

## Struktur

- `index.html`: Startseite mit Kurzprofil und den drei neuesten Einblicken
- `erfahrung.html`: Lebenslauf und berufliche Stationen
- `masterarbeit.html`: Masterarbeit zu Synthetic Video Journalism
- `arbeitsproben.html`: Event-Weltkarte, Podcast-Auftritte, Themen und Schwerpunkte sowie die drei neuesten Einblicke
- `blog.html`: Einblicke-Seite mit Tag-Filter
- `kontakt.html`: Kontaktformular, aktuell als Mailto-Fallback vorbereitet
- `experimente.html`: Experimente, darunter die interaktive Vogelkarte
- `impressum.html`: Anbieterkennzeichnung, nur im Footer verlinkt
- `datenschutz.html`: Datenschutzhinweise, im Footer und beim Kontaktformular verlinkt
- `assets/js/posts.js`: Einblicke-Daten für Startseite, Arbeitsproben und Einblicke-Seite
- `assets/js/podcasts.js`: Auswahl und Darstellung der Podcastfolgen
- `assets/css/arbeitsproben.css`: Seitenspezifische Überschriften- und Podcast-Gestaltung
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

Startseite und Arbeitsprobenseite zeigen automatisch die drei neuesten Beiträge nach Datum. Die vollständige Liste steht auf `blog.html`. Die bisherige Eigenschaft `workSample` wird für diese Übersichten nicht mehr benötigt.

## Podcastfolgen pflegen

Die ausgewählten Folgen stehen im Array `episodes` am Anfang von `assets/js/podcasts.js`. Die Reihenfolge dort ist die Anzeigereihenfolge; Folgen eines Podcasts sollten zusammenbleiben.

Pro Folge werden eine eindeutige `id`, `podcast`, `provider`, `episode` (Folgennummer), `title`, `date` im Format `YYYY-MM-DD`, `topic`, `url` (Originalseite) und `audioUrl` (öffentliche Audiodatei aus dem offiziellen RSS-Feed) gepflegt. Die Rolle ist für alle Folgen „Gast“. Es gibt keine zusätzlichen Beschreibungstexte.

Quellen zur Prüfung neuer oder geänderter Audioadressen:

- Casa Casi: <https://feeds.transistor.fm/casa-casi-tech-fur-feinschmecker>
- überMORGEN: <https://morgen.podigee.io/feed/mp3>

Die Wiedergabe erfolgt mit dem nativen Browser-Player. Erst ein Klick auf „Folge anhören“ setzt die Audioquelle und lädt die Datei vom Anbieter. Ein zweiter gestarteter Player pausiert die vorherige Folge; der Link zur Originalseite bleibt immer verfügbar. Es werden keine Audiodateien ins Projekt kopiert. Änderungen an den Anbietern müssen auch in den Datenschutzhinweisen berücksichtigt werden.

Das Raster zeigt auf großen Bildschirmen drei, auf Tablets zwei und auf kleinen Bildschirmen eine Kachel pro Zeile. Breite und Bildflächenformat entsprechen den Einblicke-Kacheln der Startseite.

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
