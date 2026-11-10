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

## Reihenfolge der Experimente

Die Experiment-Karten in `experimente.html` haben ein `data-updated`-Datum im
Format `YYYY-MM-DD`. Bei einer inhaltlichen Überarbeitung oder neuen Iteration
das Datum der betroffenen Karte aktualisieren. `assets/js/experiments.js` ordnet
die Karten beim Laden automatisch absteigend nach diesem Datum; bei gleichem
Datum bleibt die Reihenfolge im HTML erhalten. Automatisch eingelesene News
ändern das Bearbeitungsdatum eines Experiments nicht.

## Mehrsprachigkeit

Startseite und Erfahrungsseite nutzen gemeinsam `assets/js/language.js` und `assets/css/language.css`. Der DE/EN-Schalter sitzt im Header. Deutsch ist der Standard; die Auswahl wird unter `site-language` im localStorage gespeichert und beim Seitenwechsel übernommen. Ohne verfügbaren Speicher funktioniert die Umschaltung weiterhin auf der geöffneten Seite.

Für weitere zweisprachige Seiten: beide Dateien einbinden, `data-site-language="de"` am HTML-Element ergänzen, den Header-Schalter übernehmen und Übersetzungsalternativen mit `data-language="de"` beziehungsweise `data-language="en"` sowie passenden `lang`-Attributen kennzeichnen. Inhalte ohne Übersetzung bleiben sichtbar. Dynamische Komponenten können auf `site-language-change` reagieren. Ohne JavaScript bleibt die deutsche Fassung sichtbar.

## Veröffentlichung

Die Website kann später über GitHub Pages veröffentlicht werden. Dafür reicht es, die Dateien in ein GitHub-Repository zu laden und GitHub Pages für den Hauptordner zu aktivieren.

## Rollenkarten auf der Startseite

- `assets/js/roles-data.js`: zentrale Inhalte, Reihenfolge und Links. Jeder Eintrag enthält `id`, `url` sowie `de` und `en` mit `title`, `responsibility`, `activities`, `success`, `articleTitle`.
- Die Array-Reihenfolge bestimmt die Kartenfolge; der erste Eintrag wird beim Laden angezeigt. Neue Rollen als weiteren vollständigen Eintrag in beiden Sprachen ergänzen.
- Eine leere `url` blendet den Button aus. `articleTitle` bewahrt den vorgesehenen Titel und dient bei ergänzter URL als Buttontext. Interne Links öffnen wie bisher im selben Tab.
- `assets/js/roles.js`: Darstellung, Pfeile, Tastatur (Links/Rechts, Pos1/Ende), Wischen und Barrierefreiheit. Kein automatischer Wechsel.
- `assets/css/roles.css`: ausschließlich auf das Karussell begrenzte Gestaltung. Die längste Karte bestimmt die Höhe, damit der folgende Bereich beim Wechsel stehen bleibt. Die Karten zeigen ausschließlich die zentral gewählte Sprache in einer Spalte.

Lokal geprüft am 07.11.2026: alle sieben Tabellenzeilen und Tätigkeiten vollständig übernommen, Linkziele vorhanden, Navigation/Einstieg/Neueste Einblicke unverändert, JavaScript-Syntax gültig. Browserprüfung bei 1280, 375 und 320 Pixeln: Startkarte, Reihenfolge, Pfeile, Umlauf in beide Richtungen, Tastatur, Positionsanzeige, konstante Höhe und kein Textüberlauf. Inaktive Karten sind `inert` und für Screenreader verborgen. Echte Touch-Gesten und Sprachausgabe mit einem Screenreader konnten nicht praktisch geprüft werden. Reduzierte Bewegung ist per CSS berücksichtigt; die Systemeinstellung wurde nicht umgestellt.
