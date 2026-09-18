"""Build the website's article timeline data from Michael's Excel archive.

Usage:
    python scripts/build_article_archive.py path/to/archive.xlsx

The topic assignment is deliberately deterministic. Adjust TOPIC_RULES and run the
script again when the archive or the desired taxonomy changes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "assets" / "data" / "article-archive.json"
DEFAULT_UNDATED_OUTPUT = ROOT / "assets" / "data" / "article-archive-undated.json"
DEFAULT_BROWSER_OUTPUT = ROOT / "assets" / "data" / "article-archive-data.js"
EVENT_DATA = ROOT / "assets" / "data" / "event-articles.json"
LINK_CORRECTION_FILES = (
    ROOT / "data" / "article-link-corrections.json",
    ROOT / "data" / "article-link-manual-corrections.json",
)

# Editorially confirmed exceptions are kept separate from the general keyword
# rules. This avoids fragile title heuristics for older tests whose headlines
# do not name the actual device category.
TOPIC_OVERRIDES = {
    "www.inside-digital.de/handys/microsoft-lumia-950/test": "smartphones",
    "www.inside-digital.de/handys/lenovo-phab-2-pro/test": "smartphones",
    "www.inside-digital.de/news/36569-snapdragon-616-qualcomm-beerbt-den-allround-prozessor-snapdragon-615": "smartphones",
    "www.inside-digital.de/handys/alcatel-one-touch-pop-c3-dual-sim/test": "smartphones",
    "www.inside-digital.de/handys/sony-xperia-style/test": "smartphones",
}


TOPICS = [
    {"id": "smartphones", "name": "Smartphones"},
    {"id": "mobile-connectivity", "name": "Mobilfunk & Konnektivität"},
    {"id": "mobility", "name": "Mobilität"},
    {"id": "audio", "name": "Audio"},
    {"id": "computers-tablets", "name": "Computer & Tablets"},
    {"id": "smart-home-household", "name": "Smart Home & Haushalt"},
    {"id": "ai-software", "name": "KI & Software"},
    {"id": "streaming-entertainment", "name": "Streaming & Entertainment"},
    {"id": "fitness-wearables-health", "name": "Fitness, Wearables & Gesundheit"},
    {"id": "other", "name": "Sonstiges"},
]


# Scores make mixed titles predictable: a specific product class outweighs a
# generic word such as "App", "Smartphone" or "digital".
TOPIC_RULES = {
    "smartphones": [
        (r"\bsmartphones?\b|\bhandys?\b|\bmobiltelefon", 8),
        (r"\biphone\b|\bgalaxy\b|\bpixel\b|\bxperia\b|\boneplus\b|\boppo\b|\bxiaomi\b|\bhuawei\b|\bhonor\b|\bnokia\b|\bmotorola\b|\brealme\b|\bfairphone\b|\bbq aquaris\b|\bcrosscall\b", 7),
        (r"\bandroid\b|\bios\b|\bmobilfunk\b|\bsim(?:-karte)?\b|\besim\b", 5),
        (r"\bhtc\b|\balcatel\b|\bwiko\b|\bgigaset\b|\bpoco\b|thinkphone|nothing phone|essential phone|motorola.*razr|phablet", 7),
        (r"lg x power|samsung-galaxys?|sony imx|powerbanks?", 6),
        (r"flaggschiff|mittelklasse|einsteiger|selfie|fingerabdruck|handyvideo|kamerasensor", 4),
        (r"falt(?:handy|smartphone)|klapp(?:handy|smartphone)|display", 3),
        (r"snapdragon|qualcomm", 2),
    ],
    "mobility": [
        (r"e[- ]?bike|pedelec|fahrrad|radfahren|fahrradreifen|fahrradschloss", 10),
        (r"e[- ]?motorrad|motorrad|motorroller|e[- ]?roller|scooter", 9),
        (r"e[- ]?auto|elektroauto|tesla|automobil|fahrzeug|autos?\b|carplay", 8),
        (r"\bbahn\b|\bzug\b|nachtzug|fliegen|flugzeug|flughafen|reisen|reiseburo|urlauber|verkehr|navigation", 6),
        (r"autofahrer|autobahn|parken|tankstelle|ladesaule|verbrenner|fahrplan|flixtrain|deutschlandticket|vanmoof|brompton|adobike|buffalo utility|camper", 7),
        (r"lufthansa|flugstreich|ticket-ruckzahlung|streik|autonomes fahren|porsche taycan|vw id\.? buzz|autobauer|robolowe|biken", 7),
        (r"bosch.*motor|reichweite|ladestation|wallbox", 4),
    ],
    "audio": [
        (r"kopfh[oö]rer|in[- ]?ear|earbuds?|headset", 10),
        (r"lautsprecher|bluetooth[- ]?box|soundbar|sound tower|music frame|audio|dolby|stereo|hi[- ]?fi|subwoofer|sonos|teufel", 12),
        (r"musik|radio|podcast|bluetooth-box", 5),
    ],
    "computers-tablets": [
        (r"laptop|notebook|computer|\bpc\b|chromebook|macbook|imac|galaxy book", 10),
        (r"tablets?|ipad|surface", 9),
        (r"monitor|bildschirm|tastatur|maus|drucker|prozessor|cpu|grafikkarte|mx keys", 6),
        (r"windows|macos|intel|amd|nvidia|lenovo|acer|dell|medion|home-office", 4),
    ],
    "smart-home-household": [
        (r"smart[- ]?home|google home hub|haushalt|haushalts", 10),
        (r"saugroboter|m[aä]hroboter|fensterroboter|staubsauger|wischroboter|roboter|roborock|tineco|dyson", 8),
        (r"waschmaschine|trockner|k[uü]hlschrank|geschirrsp[uü]ler|kaffeemaschine|k[uü]che|backofen", 8),
        (r"philips hue|beleuchtung|leuchte|lampe|licht|garten", 6),
        (r"power ?station|powerhouse|solaranlage|balkonkraftwerk|thermostat|heizung|klimaanlage|steckdose|t[uü]rklingel", 6),
    ],
    "mobile-connectivity": [
        # Network plans and infrastructure form a distinct editorial beat;
        # the terms deliberately outrank generic software and phone mentions.
        (r"\btarif(?:e|en)?\b|allnet|datenvolumen|prepaid|jahrestarif|internet.flat|handy.ineternet.flat|roaming", 12),
        (r"\bglasfaser\b|\bgigabit\b|netzausbau|funknetz|handyempfang|mobilfunkmarken", 12),
        (r"\btelekom\b|\bvodafone\b|\bcongstar\b|\btelefonica\b|\bo2\b|\b1&1\b|unitymedia|simon", 9),
        (r"\bwlan\b|wi[- ]?fi|bluetooth|funkstandard|\blte\b|\bumts\b", 8),
        (r"bluetooth\s+[0-9]|wlan\s+[0-9]", 12),
        (r"\b5g\b.*(?:netz|test|internet|standard)|(?:netz|internet|standard).*\b5g\b", 10),
        (r"\bsim(?:-karte)?\b|\besim\b|router|modem|breitband|internet der zukunft", 8),
    ],
    "ai-software": [
        (r"k[uü]nstliche intelligenz|\bki\b|\bai\b|chatgpt|gemini|copilot", 10),
        (r"software|update|betriebssystem|\bapp\b|whatsapp|telegram|signal|browser", 6),
        (r"vpn|passwort|hacker|cyber|datenschutz", 5),
        (r"google maps|google fotos|google\.de|google.*suche|karte zeigt|interaktive karte|weltweite hilfe|wahl-o-mat|digitaler? nachlass", 6),
        (r"skype|cortana|sms|deepfake|wwdc", 6),
        (r"cloud|amazon alexa|google assistant|sprachassistent", 4),
    ],
    "streaming-entertainment": [
        (r"streaming|netflix|disney\+?|prime video|amazon video|youtube|spotify|waipu|zattoo|mediathek", 10),
        (r"fernsehen|\btv\b|filme?|serien?|kino|\bzdf\b", 8),
        (r"gaming|videospiel|konsol|playstation|xbox|nintendo|pokemon|pok[eé]mon|lego|stadia|game|spiel(?:en|zeug)?", 7),
        (r"marvel|mcu|trailer|super bowl commercials|bundesliga apps|carrera hybrid", 5),
        (r"kamera|fotografie|fotos?\b|drohne|virtual reality|\bvr\b|augmented reality|\bar\b", 4),
    ],
    "fitness-wearables-health": [
        (r"smartwatch|wearable|fitness[- ]?tracker|fitnesstracker|smart(?:er|e|en)? ring|smart ring|smarte? brille|sonnenbrille|ray-ban|smartes? fernglas", 10),
        (r"fitness|training|trainer|yoga|sport|laufen|joggen|workout|entspannungs-app|fahrradergometer", 8),
        (r"gesundheit|schlaf|blutdruck|herz|puls|medizin|thermometer|fieber|h[oö]rger[aä]t", 8),
        (r"apple watch|galaxy watch|pixel watch|lg watch|watchos|garmin|fitbit|ultrahuman|oura|peloton|schwinn", 9),
    ],
}


FORMAT_MAP = {
    "news": ("news", "News"),
    "testbericht": ("test", "Test"),
    "test": ("test", "Test"),
    "ratgeber": ("guide", "Ratgeber"),
}


def normalize_text(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").casefold())
    return "".join(character for character in text if not unicodedata.combining(character))


def canonical_url(url: str) -> str:
    value = url.strip()
    archived = re.search(r"https?://web\.archive\.org/web/\d+(?:[a-z_]+)?/(https?://.+)$", value)
    if archived:
        value = archived.group(1)
    parsed = urlparse(value)
    return f"{parsed.netloc.casefold()}{parsed.path.rstrip('/').casefold()}"


def event_lookup() -> dict[str, dict[str, str]]:
    if not EVENT_DATA.exists():
        return {}
    with EVENT_DATA.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    lookup: dict[str, dict[str, str]] = {}
    for event in payload.get("events", []):
        for article in event.get("articles", []):
            url = str(article.get("url", "")).strip()
            if not url:
                continue
            lookup[canonical_url(url)] = {
                "eventName": str(article.get("event") or event.get("name") or "").strip(),
                "location": str(event.get("location") or "").strip(),
            }
    return lookup


def corrected_url_lookup() -> dict[int, dict]:
    """Return audited URL decisions keyed by original spreadsheet row.

    The source workbook remains untouched. Keeping replacements in small JSON
    files makes the public data rebuild reproducible and lets uncertain links
    stay out of the portfolio until they have been reviewed.
    """
    lookup: dict[int, dict] = {}
    for path in LINK_CORRECTION_FILES:
        if not path.exists():
            continue
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        for record in payload.get("records", []):
            source_row = record.get("sourceRow")
            verified_url = str(record.get("verifiedUrl") or "").strip()
            if isinstance(source_row, int) and (verified_url or record.get("resolution") == "offline"):
                lookup[source_row] = {
                    "url": verified_url,
                    "offline": record.get("resolution") == "offline",
                }
    return lookup


def infer_topic(title: str, date: pd.Timestamp | None = None, format_id: str = "news") -> str:
    haystack = normalize_text(title)
    scores: dict[str, int] = {topic["id"]: 0 for topic in TOPICS}
    for topic_id, rules in TOPIC_RULES.items():
        for pattern, weight in rules:
            if re.search(pattern, haystack):
                scores[topic_id] += weight

    # A few collisions need editorial tie-breaks. These apply only when both
    # themes were actually detected.
    if scores["mobility"] and re.search(r"e[- ]?bike|pedelec|fahrrad|motorrad|tesla|e[- ]?auto", haystack):
        scores["mobility"] += 7
    if scores["fitness-wearables-health"] and re.search(r"smartwatch|wearable|fitness|gesundheit|smart ring", haystack):
        scores["fitness-wearables-health"] += 6
    if scores["streaming-entertainment"] and re.search(r"streaming|netflix|disney|prime video|gaming|playstation|xbox", haystack):
        scores["streaming-entertainment"] += 6

    best_topic = max(scores, key=scores.get)
    if scores[best_topic] > 0:
        return best_topic

    # The archive's older test headlines often use magazine-style metaphors and
    # omit both model and product class. In this phase of the publication they
    # overwhelmingly refer to smartphones. Explicit keywords above always win.
    if format_id == "test" and date is not None and date.year <= 2020:
        return "smartphones"
    return "other"


def topic_for_article(title: str, url: str, date: pd.Timestamp | None, format_id: str) -> str:
    """Apply confirmed editorial assignments before general topic inference."""
    canonical = canonical_url(url)
    if canonical in TOPIC_OVERRIDES:
        return TOPIC_OVERRIDES[canonical]
    # Product pages below /handys/ are unequivocally phones, even where older
    # editorial headlines use metaphors instead of a device name.
    if "/handys/" in canonical:
        return "smartphones"
    return infer_topic(title, date, format_id)


def normalize_format(value: object) -> tuple[str, str]:
    key = normalize_text(value).strip()
    return FORMAT_MAP.get(key, ("news", str(value or "News").strip() or "News"))


def stable_id(date_value: str, title: str, url: str) -> str:
    title_slug = re.sub(r"[^a-z0-9]+", "-", normalize_text(title)).strip("-")[:52]
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:8]
    return f"article-{date_value}-{title_slug}-{digest}"


def build_archive(source: Path) -> tuple[dict, dict]:
    frame = pd.read_excel(source)
    required = {"Kategorie", "Schlagzeile", "Datum", "Link"}
    missing_columns = sorted(required.difference(frame.columns))
    if missing_columns:
        raise ValueError(f"Fehlende Spalten: {', '.join(missing_columns)}")

    events = event_lookup()
    corrected_urls = corrected_url_lookup()
    articles: list[dict] = []
    undated: list[dict] = []

    for row_number, row in frame.iterrows():
        source_row = int(row_number + 2)
        title = str(row["Schlagzeile"]).strip()
        correction = corrected_urls.get(source_row)
        url = "" if correction and correction["offline"] else (correction["url"] if correction and correction["url"] else str(row["Link"]).strip())
        format_id, format_label = normalize_format(row["Kategorie"])
        date = pd.to_datetime(row["Datum"], dayfirst=True, errors="coerce")
        base = {
            "sourceRow": source_row,
            "title": title,
            "url": url,
            "format": format_id,
            "formatLabel": format_label,
            "topic": topic_for_article(title, url, None if pd.isna(date) else date, format_id),
        }

        if pd.isna(date):
            undated.append({**base, "rawDate": None if pd.isna(row["Datum"]) else str(row["Datum"])})
            continue

        date_value = date.strftime("%Y-%m-%d")
        article = {
            "id": stable_id(date_value, title, url),
            "title": title,
            "date": date_value,
            "url": url,
            "format": format_id,
            "formatLabel": format_label,
            "topic": base["topic"],
            "linkAvailable": bool(url),
        }
        event = events.get(canonical_url(url))
        if event:
            article["eventName"] = event["eventName"]
            article["location"] = event["location"]
        articles.append(article)

    articles.sort(key=lambda article: (article["date"], article["title"]))
    topic_counts = {topic["id"]: 0 for topic in TOPICS}
    format_counts = {key: 0 for key in ("news", "test", "guide")}
    for article in articles:
        topic_counts[article["topic"]] += 1
        format_counts[article["format"]] = format_counts.get(article["format"], 0) + 1

    archive = {
        "meta": {
            "title": "Artikelarchiv - Themen und Formate im Laufe der Zeit",
            "source": source.name,
            "totalRows": int(len(frame)),
            "includedArticles": len(articles),
            "excludedWithoutDate": len(undated),
            "dateStart": articles[0]["date"] if articles else None,
            "dateEnd": articles[-1]["date"] if articles else None,
        },
        "formats": [
            {"id": "news", "name": "News", "count": format_counts.get("news", 0)},
            {"id": "test", "name": "Tests", "count": format_counts.get("test", 0)},
            {"id": "guide", "name": "Ratgeber", "count": format_counts.get("guide", 0)},
        ],
        "topics": [
            {**topic, "count": topic_counts[topic["id"]]}
            for topic in TOPICS
        ],
        "articles": articles,
    }
    undated_payload = {
        "meta": {
            "source": source.name,
            "reason": "Kein verwertbares Veröffentlichungsdatum; nicht Teil der Zeitvisualisierung.",
            "count": len(undated),
        },
        "articles": undated,
    }
    return archive, undated_payload


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_browser_data(path: Path, payload: dict) -> None:
    """Write the same data as executable JavaScript for file:// previews."""
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    serialized = serialized.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    path.write_text(f"window.__ARTICLE_ARCHIVE_DATA__={serialized};\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Excel archive with category, title, date and link columns")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--undated-output", type=Path, default=DEFAULT_UNDATED_OUTPUT)
    parser.add_argument("--browser-output", type=Path, default=DEFAULT_BROWSER_OUTPUT)
    args = parser.parse_args()

    archive, undated = build_archive(args.source)
    write_json(args.output, archive)
    write_json(args.undated_output, undated)
    write_browser_data(args.browser_output, archive)
    print(
        f"{archive['meta']['includedArticles']} Artikel geschrieben, "
        f"{undated['meta']['count']} ohne Datum separat gespeichert."
    )


if __name__ == "__main__":
    main()
