"""Fetch usage statistics for Michael Buettner's master thesis.

The OPUS statistics widget on pub.h-brs.de loads its values from a JSON
endpoint. Calling that endpoint directly is more stable than automating clicks
in a browser and does not require Playwright to be installed.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path


DEFAULT_IDENTIFIER = "hbrs-9485"
DEFAULT_STATS_URL = "https://pub.h-brs.de/oas/jsonloader.php"
DEFAULT_CSV_PATH = Path("assets/data/thesis_stats.csv")
DEFAULT_HTML_PATH = Path("masterarbeit.html")


def build_stats_url(identifier: str) -> str:
    params = {
        "until": "yesterday",
        "granularity": "month",
        "from": "2020-01-01",
        "informational": "true",
        "do": "basic",
        "identifier": identifier,
        "format": "json",
        "addemptyrecords": "true",
        "content": "counter,counter_abstract",
    }
    return f"{DEFAULT_STATS_URL}?{urllib.parse.urlencode(params)}"


def fetch_json(url: str, timeout: int) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "michael-buettner-website-stats/1.0",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                raise RuntimeError(f"Unexpected HTTP status: {response.status}")
            payload = response.read().decode("utf-8")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not fetch statistics: {exc}") from exc

    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Statistics endpoint did not return valid JSON.") from exc

    return data


def extract_totals(data: dict) -> dict:
    informational = data.get("informational")
    if not isinstance(informational, dict):
        raise RuntimeError("Missing 'informational' section in statistics JSON.")

    totals = informational.get("total-accesses")
    if not isinstance(totals, dict):
        raise RuntimeError("Missing 'total-accesses' section in statistics JSON.")

    downloads = totals.get("counter")
    frontdoor_views = totals.get("counter_abstract")
    if not isinstance(downloads, int) or not isinstance(frontdoor_views, int):
        raise RuntimeError("Statistics JSON does not contain integer totals.")

    return {
        "collected_at": date.today().isoformat(),
        "data_until": data.get("until", ""),
        "identifier": data.get("entries", [{}])[-1].get("identifier", DEFAULT_IDENTIFIER),
        "downloads": downloads,
        "frontdoor_views": frontdoor_views,
        "first_access": informational.get("first-access", ""),
    }


def save_csv(row: dict, csv_path: Path) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "collected_at",
        "data_until",
        "identifier",
        "downloads",
        "frontdoor_views",
        "first_access",
    ]

    rows = []
    if csv_path.exists():
        with csv_path.open("r", encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))

    rows = [old_row for old_row in rows if old_row.get("collected_at") != row["collected_at"]]
    rows.append({key: str(row.get(key, "")) for key in fieldnames})

    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def format_display_date(value: str) -> str:
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return value
    return parsed.strftime("%d.%m.%Y")


def update_html(row: dict, html_path: Path) -> None:
    if not html_path.exists():
        raise RuntimeError(f"HTML file not found: {html_path}")

    html = html_path.read_text(encoding="utf-8")

    replacements = [
        (
            r'(<span class="thesis-meta__number" data-stat="downloads">)\d+(</span>)',
            rf"\g<1>{row['downloads']}\2",
        ),
        (
            r'(<span class="thesis-meta__number" data-stat="frontdoor-views">)\d+(</span>)',
            rf"\g<1>{row['frontdoor_views']}\2",
        ),
        (
            r'(Quelle: pub H-BRS Statistik, Datenstand )[^<]+(\.)',
            rf"\g<1>{format_display_date(str(row['data_until']))}\2",
        ),
    ]

    for pattern, replacement in replacements:
        html, count = re.subn(pattern, replacement, html, count=1)
        if count != 1:
            raise RuntimeError(f"Could not update HTML pattern: {pattern}")

    html_path.write_text(html, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch H-BRS OPUS usage statistics.")
    parser.add_argument("--identifier", default=DEFAULT_IDENTIFIER, help="OPUS statistics identifier.")
    parser.add_argument("--csv", default=str(DEFAULT_CSV_PATH), help="CSV output path.")
    parser.add_argument("--html", default=str(DEFAULT_HTML_PATH), help="HTML file to update.")
    parser.add_argument("--no-html", action="store_true", help="Only write CSV, do not update HTML.")
    parser.add_argument("--timeout", type=int, default=20, help="HTTP timeout in seconds.")
    args = parser.parse_args()

    url = build_stats_url(args.identifier)

    try:
        data = fetch_json(url, args.timeout)
        row = extract_totals(data)
        save_csv(row, Path(args.csv))
        if not args.no_html:
            update_html(row, Path(args.html))
    except RuntimeError as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        return 1

    print(
        "Masterarbeit-Statistik: "
        f"{row['downloads']} Downloads, "
        f"{row['frontdoor_views']} Frontdoor-Views "
        f"(Datenstand: {row['data_until']}, gespeichert in {args.csv})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
