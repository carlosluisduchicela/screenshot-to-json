#!/usr/bin/env python3
"""screenshot-to-json: deterministic heuristic extraction from messy text.

Stdlib only. Takes text copied (or OCR'd) from a screenshot / save and
returns a structured record: type, title guess, date, time, price, phone,
email, url, address, plus a confidence note for every field.

This is a heuristic extractor, not a model. It finds patterns that are
explicitly written in the text (dates, prices, phone numbers, ...) and
classifies the record from keywords. It will miss things — see the
"Limitations" section of README.md.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5,
    "june": 6, "july": 7, "august": 8, "september": 9, "october": 10,
    "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
    "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

PLACE_KEYWORDS = [
    "restaurant", "taqueria", "cafe", "café", "coffee", "bakery",
    "bar", "tacos", "mezcal", "ramen", "sushi", "pizza", "dinner",
    "lunch", "brunch", "reservation", "reservations", "table for",
    "cuisine", "tasting menu", "diner", "bistro", "trattoria",
]
EVENT_KEYWORDS = [
    "concert", "ticket", "tickets", "doors", "show", "live at",
    "live music", "theatre", "theater", "film", "screening",
    "festival", "performance", "admission", "doors at",
]
PRODUCT_KEYWORDS = [
    "add to cart", "buy now", "in stock", "shipping", "returns",
    "size:", "color:", "colour:", "sku", "shop", "price:",
    "add to bag", "checkout",
]

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
URL_RE = re.compile(r"\b(?:https?://|www\.)[^\s<>()\[\]\"']+", re.IGNORECASE)
PHONE_RE = re.compile(r"\(?\b\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b")
PRICE_RE = re.compile(r"\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b|\$\s?\d+(?:\.\d{2})?\b")
TIME_RE = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?\b")
TIME_24H_RE = re.compile(r"\b([01]\d|2[0-3]):([0-5]\d)\b")
STREET_RE = re.compile(
    r"\b\d{1,5}\s+\S.*\b(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|"
    r"Lane|Ln|Drive|Dr|Place|Pl|Court|Ct|Parkway|Pkwy|Highway|Hwy)\b",
    re.IGNORECASE,
)
DATE_MONTH_RE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|"
    r"October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|"
    r"Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b",
    re.IGNORECASE,
)
DATE_ISO_RE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
DATE_US_RE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})\b")


def _find_date(text):
    m = DATE_MONTH_RE.search(text)
    if m:
        month = MONTHS[m.group(1).lower().rstrip(".")]
        try:
            return datetime(int(m.group(3)), month, int(m.group(2))).strftime("%Y-%m-%d")
        except ValueError:
            return None
    m = DATE_ISO_RE.search(text)
    if m:
        return m.group(0)
    m = DATE_US_RE.search(text)
    if m:
        year = int(m.group(3))
        if year < 100:
            year += 2000
        try:
            return datetime(year, int(m.group(1)), int(m.group(2))).strftime("%Y-%m-%d")
        except ValueError:
            return None
    return None


def _find_time(text):
    m = TIME_RE.search(text)
    if m:
        minutes = m.group(2) or "00"
        return "%s:%s %sM" % (int(m.group(1)), minutes, m.group(3).upper())
    m = TIME_24H_RE.search(text)
    if m:
        return m.group(0)
    return None


def _find_price(text):
    m = PRICE_RE.search(text)
    if not m:
        return None
    raw = m.group(0).replace("$", "").replace(",", "").strip()
    try:
        return "$%.2f" % float(raw)
    except ValueError:
        return None


def _find_phone(text):
    m = PHONE_RE.search(text)
    if not m:
        return None
    digits = re.sub(r"\D", "", m.group(0))
    if len(digits) == 10:
        return "(%s) %s-%s" % (digits[0:3], digits[3:6], digits[6:10])
    return m.group(0).strip()


def _find_address(lines):
    for line in lines:
        if STREET_RE.search(line):
            return line.strip().strip(",")
    return None


def _classify(lowered):
    scores = {
        "place": sum(lowered.count(k) for k in PLACE_KEYWORDS),
        "event": sum(lowered.count(k) for k in EVENT_KEYWORDS),
        "product": sum(lowered.count(k) for k in PRODUCT_KEYWORDS),
    }
    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return "unknown", scores
    # Deterministic tie-break: event > product > place.
    for kind in ("event", "product", "place"):
        if scores[kind] == scores[best]:
            return kind, scores
    return best, scores


def extract(text):
    """Extract a structured record from raw text. Never raises on bad input."""
    if not text or not str(text).strip():
        notes = {
            "type": "low - no text to classify",
            "title": "not found - no text",
            "date": "not found", "time": "not found", "price": "not found",
            "phone": "not found", "email": "not found", "url": "not found",
            "address": "not found",
        }
        return {
            "type": "unknown", "title": None, "date": None, "time": None,
            "price": None, "phone": None, "email": None, "url": None,
            "address": None, "confidence_notes": notes,
        }

    text = str(text)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    lowered = text.lower()

    record_type, scores = _classify(lowered)
    title = lines[0] if lines else None

    email_m = EMAIL_RE.search(text)
    url_m = URL_RE.search(text)

    fields = {
        "date": _find_date(text),
        "time": _find_time(text),
        "price": _find_price(text),
        "phone": _find_phone(text),
        "email": email_m.group(0).lower() if email_m else None,
        "url": url_m.group(0).rstrip(".,;") if url_m else None,
        "address": _find_address(lines),
    }

    notes = {}
    if record_type == "unknown":
        notes["type"] = "low - no classification keywords found"
    else:
        notes["type"] = (
            "medium - %d keyword signal(s) for '%s' "
            "(place=%d, event=%d, product=%d); keyword classification, verify"
            % (scores[record_type], record_type, scores["place"],
               scores["event"], scores["product"])
        )
    notes["title"] = "low - guessed from the first non-empty line; verify"
    for name, value in fields.items():
        notes[name] = "high - explicit pattern found in the text" if value else "not found"

    return {
        "type": record_type,
        "title": title,
        "date": fields["date"],
        "time": fields["time"],
        "price": fields["price"],
        "phone": fields["phone"],
        "email": fields["email"],
        "url": fields["url"],
        "address": fields["address"],
        "confidence_notes": notes,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="extractor.py",
        description="Extract a structured JSON record from a .txt file "
                    "containing text copied or OCR'd from a screenshot/save.",
    )
    parser.add_argument("file", help="path to a UTF-8 .txt file to extract from")
    args = parser.parse_args(argv)

    try:
        with open(args.file, "r", encoding="utf-8") as fh:
            text = fh.read()
    except OSError as exc:
        print("error: cannot read %s: %s" % (args.file, exc), file=sys.stderr)
        return 2

    print(json.dumps(extract(text), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
