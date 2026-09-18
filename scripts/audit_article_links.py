"""Audit and resolve inside-digital article URLs from Michael's Excel archive.

The script never guesses a replacement URL from a headline. It validates existing
URLs against their page metadata and, where necessary, uses inside-digital's own
site search to find a title-matching destination. Ambiguous results remain in the
review list instead of being applied automatically.

Usage:
    python scripts/audit_article_links.py path/to/archive.xlsx
"""

from __future__ import annotations

import argparse
import concurrent.futures
import html
import json
import re
import threading
import time
import unicodedata
from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AUDIT_OUTPUT = ROOT / "data" / "article-link-audit.json"
DEFAULT_CORRECTIONS_OUTPUT = ROOT / "data" / "article-link-corrections.json"
DEFAULT_REVIEW_OUTPUT = ROOT / "data" / "article-link-review.json"
DEFAULT_MANUAL_CORRECTIONS = ROOT / "data" / "article-link-manual-corrections.json"
SITE_ROOT = "https://www.inside-digital.de"
USER_AGENT = "Mozilla/5.0 (compatible; MichaelBuettnerPortfolioLinkAudit/1.0)"


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.casefold())
    text = "".join(character for character in text if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def canonicalize_url(url: str) -> str:
    return url.strip().rstrip("/")


def title_score(expected: str, actual: str) -> float:
    left = normalize(expected)
    right = normalize(actual)
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    sequence = SequenceMatcher(None, left, right).ratio()
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    overlap = len(left_tokens & right_tokens) / max(1, len(left_tokens | right_tokens))
    coverage = len(left_tokens & right_tokens) / max(1, len(left_tokens))
    return round(0.45 * sequence + 0.3 * overlap + 0.25 * coverage, 4)


class PageMetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_title = False
        self.title_parts: list[str] = []
        self.og_title = ""
        self.canonical = ""
        self.published_date = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {name.casefold(): value or "" for name, value in attrs}
        if tag.casefold() == "title":
            self.in_title = True
        elif tag.casefold() == "meta" and attributes.get("property", "").casefold() == "og:title":
            self.og_title = attributes.get("content", "").strip()
        elif tag.casefold() == "meta" and attributes.get("property", "").casefold() == "article:published_time":
            self.published_date = attributes.get("content", "").strip()
        elif tag.casefold() == "meta" and attributes.get("itemprop", "").casefold() == "datepublished":
            self.published_date = attributes.get("content", "").strip() or self.published_date
        elif tag.casefold() == "link" and "canonical" in attributes.get("rel", "").casefold():
            self.canonical = attributes.get("href", "").strip()

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)

    @property
    def page_title(self) -> str:
        title = self.og_title or " ".join(self.title_parts)
        return re.sub(r"\s+", " ", html.unescape(title)).strip()


@dataclass
class FetchResult:
    status: int | None
    final_url: str
    page_title: str = ""
    structured_title: str = ""
    canonical_url: str = ""
    published_date: str = ""
    error: str = ""


def json_string_from_page(body: str, key: str) -> str:
    match = re.search(rf'"{re.escape(key)}"\s*:\s*"((?:\\.|[^"\\])*)"', body)
    if not match:
        return ""
    try:
        return json.loads(f'"{match.group(1)}"')
    except json.JSONDecodeError:
        return html.unescape(match.group(1))


@dataclass
class Candidate:
    url: str
    title: str
    section: str
    score: float


@dataclass
class AuditRecord:
    sourceRow: int
    title: str
    date: str
    format: str
    linkStatus: str
    originalUrl: str
    directStatus: int | None
    directFinalUrl: str
    directTitle: str
    directScore: float
    resolution: str
    verifiedUrl: str
    verifiedTitle: str
    confidence: str
    candidates: list[dict] = field(default_factory=list)
    error: str = ""


class LinkAudit:
    def __init__(self, delay: float = 0.12) -> None:
        self.delay = delay
        self.lock = threading.Lock()
        self.last_request = 0.0

    def _pace(self) -> None:
        with self.lock:
            wait = self.delay - (time.monotonic() - self.last_request)
            if wait > 0:
                time.sleep(wait)
            self.last_request = time.monotonic()

    def fetch_page(self, url: str) -> FetchResult:
        self._pace()
        request = Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml",
                "Range": "bytes=0-98303",
            },
        )
        try:
            with urlopen(request, timeout=25) as response:
                body = response.read().decode("utf-8", "replace")
                parser = PageMetadataParser()
                parser.feed(body)
                return FetchResult(
                    status=response.getcode(),
                    final_url=response.geturl(),
                    page_title=parser.page_title,
                    structured_title=json_string_from_page(body, "headline"),
                    canonical_url=parser.canonical,
                    published_date=parser.published_date or json_string_from_page(body, "datePublished"),
                )
        except HTTPError as error:
            body = error.read(98304).decode("utf-8", "replace")
            parser = PageMetadataParser()
            parser.feed(body)
            return FetchResult(
                status=error.code,
                final_url=error.geturl() or url,
                page_title=parser.page_title,
                structured_title=json_string_from_page(body, "headline"),
                canonical_url=parser.canonical,
                published_date=parser.published_date or json_string_from_page(body, "datePublished"),
                error=f"HTTP {error.code}",
            )
        except (URLError, TimeoutError, OSError) as error:
            return FetchResult(status=None, final_url=url, error=str(error.reason if isinstance(error, URLError) else error))

    def search(self, title: str) -> list[Candidate]:
        search_url = f"{SITE_ROOT}/?s={quote(title)}"
        self._pace()
        request = Request(search_url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
        try:
            with urlopen(request, timeout=30) as response:
                body = response.read().decode("utf-8", "replace")
        except (HTTPError, URLError, TimeoutError, OSError):
            return []

        # The site's search result boxes expose both the intended title and URL.
        expression = re.compile(
            r"<div\s+class=['\"]text-result-box\s+([^'\"\s]+).*?"
            r"<a\s+href=['\"]([^'\"]+)['\"]\s+title=['\"]([^'\"]*)['\"]",
            re.IGNORECASE | re.DOTALL,
        )
        candidates: list[Candidate] = []
        seen: set[str] = set()
        for section, url, candidate_title in expression.findall(body):
            url = html.unescape(url).strip()
            candidate_title = html.unescape(candidate_title).strip()
            if not url.startswith(SITE_ROOT) or url in seen or not candidate_title:
                continue
            seen.add(url)
            candidates.append(Candidate(url=url, title=candidate_title, section=section, score=title_score(title, candidate_title)))
        return sorted(candidates, key=lambda candidate: candidate.score, reverse=True)


def normalized_date(value: str) -> str:
    iso_match = re.match(r"(\d{4}-\d{2}-\d{2})", value)
    if iso_match:
        return iso_match.group(1)
    parsed = pd.to_datetime(value, dayfirst=True, errors="coerce")
    return "" if pd.isna(parsed) else parsed.strftime("%Y-%m-%d")


def is_direct_match(record: FetchResult, expected_title: str, expected_date: str) -> tuple[bool, float]:
    if record.status not in {200, 206}:
        return False, 0.0
    score = max(title_score(expected_title, record.page_title), title_score(expected_title, record.structured_title))
    exact = normalize(expected_title) in {normalize(record.page_title), normalize(record.structured_title)}
    date_matches = normalized_date(record.published_date) == expected_date and bool(expected_date)
    # A canonical on the current domain plus a very high title match handles
    # editorially extended titles such as "X im Test: Y".
    return exact or score >= 0.9 or (date_matches and score >= 0.22), score


def choose_candidate(audit: LinkAudit, expected_title: str, expected_date: str) -> tuple[Candidate | None, FetchResult | None, list[Candidate]]:
    candidates = audit.search(expected_title)
    if not candidates:
        return None, None, []
    best = candidates[0]
    exact = normalize(best.title) == normalize(expected_title)
    if not exact and best.score < 0.93:
        return None, None, candidates[:5]

    verification = audit.fetch_page(best.url)
    verified_score = max(
        title_score(expected_title, verification.page_title or best.title),
        title_score(expected_title, verification.structured_title or best.title),
    )
    date_matches = normalized_date(verification.published_date) == expected_date and bool(expected_date)
    if verification.status not in {200, 206}:
        return None, verification, candidates[:5]
    if not exact and verified_score < 0.9:
        return None, verification, candidates[:5]
    if verification.published_date and not date_matches:
        return None, verification, candidates[:5]
    return best, verification, candidates[:5]


def make_record(row: dict, audit: LinkAudit) -> AuditRecord:
    expected_title = str(row["Schlagzeile"]).strip()
    expected_date = normalized_date(str(row["Datum"] or ""))
    original_url = str(row["Link"]).strip()
    direct = audit.fetch_page(original_url)
    direct_matches, direct_score = is_direct_match(direct, expected_title, expected_date)
    common = dict(
        sourceRow=int(row["sourceRow"]),
        title=expected_title,
        date=str(row["Datum"] or ""),
        format=str(row["Kategorie"]),
        linkStatus=str(row.get("Linkstatus") or ""),
        originalUrl=original_url,
        directStatus=direct.status,
        directFinalUrl=direct.final_url,
        directTitle=direct.page_title,
        directScore=direct_score,
    )

    if direct_matches:
        verified_url = canonicalize_url(direct.canonical_url or direct.final_url or original_url)
        resolution = "confirmed" if canonicalize_url(original_url) == verified_url else "redirected"
        return AuditRecord(
            **common,
            resolution=resolution,
            verifiedUrl=verified_url,
            verifiedTitle=direct.page_title,
            confidence="high",
            error=direct.error,
        )

    candidate, verification, suggestions = choose_candidate(audit, expected_title, expected_date)
    candidate_payload = [asdict(item) for item in suggestions]
    if candidate and verification:
        verified_url = canonicalize_url(verification.canonical_url or verification.final_url or candidate.url)
        return AuditRecord(
            **common,
            resolution="corrected",
            verifiedUrl=verified_url,
            verifiedTitle=verification.page_title or candidate.title,
            confidence="high" if normalize(candidate.title) == normalize(expected_title) else "medium",
            candidates=candidate_payload,
            error=direct.error,
        )

    resolution = "review" if suggestions else "unresolved"
    return AuditRecord(
        **common,
        resolution=resolution,
        verifiedUrl="",
        verifiedTitle="",
        confidence="none",
        candidates=candidate_payload,
        error=direct.error or (verification.error if verification else ""),
    )


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def serialize_records(records: Iterable[AuditRecord | dict], source: Path) -> dict:
    record_list = [asdict(record) if isinstance(record, AuditRecord) else record for record in records]
    counts: dict[str, int] = {}
    for record in record_list:
        counts[record["resolution"]] = counts.get(record["resolution"], 0) + 1
    return {
        "meta": {"source": source.name, "total": len(record_list), "resolutions": counts},
        "records": record_list,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--audit-output", type=Path, default=DEFAULT_AUDIT_OUTPUT)
    parser.add_argument("--corrections-output", type=Path, default=DEFAULT_CORRECTIONS_OUTPUT)
    parser.add_argument("--review-output", type=Path, default=DEFAULT_REVIEW_OUTPUT)
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--delay", type=float, default=0.16, help="Minimum seconds between requests to the site")
    parser.add_argument("--limit", type=int, default=0, help="Process only the first N rows for a test run")
    parser.add_argument("--source-row", type=int, action="append", default=[], help="Process one Excel row number; repeatable")
    parser.add_argument("--resume-from", type=Path, help="Recheck only unresolved/review records from an existing audit")
    parser.add_argument(
        "--manual-corrections",
        type=Path,
        default=DEFAULT_MANUAL_CORRECTIONS,
        help="Optional high-confidence human-verified URL replacements",
    )
    args = parser.parse_args()

    frame = pd.read_excel(args.source).fillna("")
    required = {"Kategorie", "Schlagzeile", "Datum", "Link"}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise ValueError(f"Fehlende Spalten: {', '.join(missing)}")
    frame["sourceRow"] = frame.index + 2
    rows = frame.to_dict(orient="records")
    if args.source_row:
        requested_rows = set(args.source_row)
        rows = [row for row in rows if row["sourceRow"] in requested_rows]
    if args.limit:
        rows = rows[: args.limit]

    preserved_records: list[dict] = []
    if args.resume_from:
        previous = json.loads(args.resume_from.read_text(encoding="utf-8")).get("records", [])
        previous_by_row = {record["sourceRow"]: record for record in previous}
        rows = [
            row for row in rows
            if previous_by_row.get(row["sourceRow"], {}).get("resolution") in {"review", "unresolved"}
        ]
        preserved_records = [
            record for record in previous
            if record.get("resolution") not in {"review", "unresolved"}
        ]

    audit = LinkAudit(delay=args.delay)
    records: list[AuditRecord] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [executor.submit(make_record, row, audit) for row in rows]
        for index, future in enumerate(concurrent.futures.as_completed(futures), start=1):
            records.append(future.result())
            if index % 25 == 0 or index == len(futures):
                print(f"{index}/{len(futures)} geprüft", flush=True)

    all_records: list[AuditRecord | dict] = [*preserved_records, *records]
    all_records.sort(key=lambda record: record.sourceRow if isinstance(record, AuditRecord) else record["sourceRow"])
    if args.manual_corrections.exists():
        manual_records = json.loads(args.manual_corrections.read_text(encoding="utf-8")).get("records", [])
        manual_by_row = {
            record.get("sourceRow"): record
            for record in manual_records
            if isinstance(record.get("sourceRow"), int)
            and (record.get("verifiedUrl") or record.get("resolution") == "offline")
        }
        reconciled_records: list[AuditRecord | dict] = []
        for record in all_records:
            payload = asdict(record) if isinstance(record, AuditRecord) else record
            manual = manual_by_row.get(payload["sourceRow"])
            if manual:
                payload = {
                    **payload,
                    "resolution": manual.get("resolution", "manual-corrected"),
                    "verifiedUrl": manual.get("verifiedUrl", ""),
                    "verifiedTitle": payload["title"],
                    "confidence": manual.get("confidence", "high"),
                }
            reconciled_records.append(payload)
        all_records = reconciled_records
    payload = serialize_records(all_records, args.source)
    write_json(args.audit_output, payload)
    corrections = [record for record in payload["records"] if record["resolution"] in {"corrected", "redirected", "manual-corrected"}]
    review = [record for record in payload["records"] if record["resolution"] in {"review", "unresolved"}]
    write_json(args.corrections_output, {"meta": {"count": len(corrections)}, "records": corrections})
    write_json(args.review_output, {"meta": {"count": len(review)}, "records": review})
    print(json.dumps(payload["meta"], ensure_ascii=False))


if __name__ == "__main__":
    main()
