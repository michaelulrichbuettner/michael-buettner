#!/usr/bin/env python3
"""Convert an eBird life-list CSV into privacy-safe website data."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path


REQUIRED_COLUMNS = {
    "Common Name",
    "Scientific Name",
    "Location",
    "Date",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Import an eBird life-list CSV without publishing exact locations."
        )
    )
    parser.add_argument("csv_path", type=Path, help="Path to the eBird CSV export")
    parser.add_argument(
        "--locations",
        type=Path,
        default=Path("data/vogelorte.json"),
        help="JSON file containing public city coordinates",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/vogelbeobachtungen.json"),
        help="Path for the privacy-safe website JSON",
    )
    return parser.parse_args()


def city_from_location(value: str) -> str:
    parts = [part.strip() for part in value.split(",") if part.strip()]
    if len(parts) < 2:
        raise ValueError(f"Stadt konnte nicht aus dem Ort abgeleitet werden: {value!r}")
    return parts[-2]


def normalized_date(value: str) -> str:
    return datetime.strptime(value.strip(), "%d %b %Y").date().isoformat()


def main() -> None:
    args = parse_args()

    with args.locations.open(encoding="utf-8") as handle:
        location_data = json.load(handle)

    public_locations = {
        item["city"]: item for item in location_data.get("locations", [])
    }

    with args.csv_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = REQUIRED_COLUMNS.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(
                "Pflichtspalten fehlen: " + ", ".join(sorted(missing))
            )
        rows = list(reader)

    observations = []
    unknown_cities = set()

    for row in rows:
        city = city_from_location(row["Location"])
        public_location = public_locations.get(city)
        if not public_location:
            unknown_cities.add(city)
            continue

        observations.append(
            {
                "commonName": row["Common Name"].strip(),
                "scientificName": row["Scientific Name"].strip(),
                "date": normalized_date(row["Date"]),
                "city": city,
                "latitude": public_location["latitude"],
                "longitude": public_location["longitude"],
            }
        )

    if unknown_cities:
        raise ValueError(
            "Für diese Städte fehlen öffentliche Kartenpositionen in "
            f"{args.locations}: {', '.join(sorted(unknown_cities))}"
        )

    observations.sort(
        key=lambda item: (item["city"], item["commonName"].casefold(), item["date"])
    )

    payload = {
        "schemaVersion": 1,
        "source": "eBird Life List",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "privacy": "Nur Stadtpositionen; keine exakten Beobachtungsorte.",
        "observations": observations,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(
        f"{len(observations)} Beobachtungen aus {len(rows)} CSV-Zeilen "
        f"nach {args.output} geschrieben."
    )


if __name__ == "__main__":
    main()
