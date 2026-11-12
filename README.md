# screenshot-to-json

Screenshot in, structured record out — an extraction workbench: paste or OCR the text from any app screen and get clean JSON, with a confidence bar on every field and hover-to-source highlighting that shows where each field was found.

**Live demo:** open `index.html` in a browser (or serve this folder with any static host / GitHub Pages). No build step, no server.

## Pipeline

```
  Screenshot / image                Pasted text (copied or OCR'd elsewhere)
        |                                     |
        v                                     |
  [Optional, in-browser]                      |
  read my screenshot                          |
  Tesseract.js loads from a CDN               |
  ONLY when you click the button              |
  (clear failure message if                   |
   offline / blocked)                         |
        |                                     |
        +------------------+------------------+
                           v
                     Raw text
                           |
                           v
        Deterministic heuristic extractor
        (app.js in the browser \u2014 a port of
         extractor.py, stdlib Python)
                           |
                           v
        Structured JSON: type, title, date,
        time, price, phone, email, url,
        address + confidence_notes
                           |
                           v
              Copy JSON / Download JSON
```

**Honesty note:** the public demo does **not** run a server-side LLM, and
nothing you paste or upload leaves your browser. The paste-text path works
fully offline.

## What it does

- **Own screen first:** a drop zone takes a screenshot (drag-and-drop or
  click to upload) or pasted text — pasting anywhere on the page extracts on
  the spot. Image upload comes with a preview and a **“read my screenshot”**
  button. Tesseract.js is loaded dynamically from a CDN only on that click;
  if the load or the OCR fails, you get a plain-language message and can
  paste text instead.
- **Paste-text extraction** from anything: a screenshot’s copied text, a
  share-sheet dump, OCR output from another tool. Extraction runs as you
  type — no button required.
- **Sample chips** under the drop zone, for anyone without a screen handy:
  a checkout screen, a settings page, and a profile card. All sample data is
  fake; the files live in `sample/`.
- **A workbench, not a text box:** per-field confidence bars that animate
  in, a “Needs a second look” panel that treats guesses and gaps as a
  designed review state, and hover-any-field highlighting that shows exactly
  where in the source text each value was found.
- **Structured output** as syntax-highlighted JSON, with **Copy JSON** and
  **Download** buttons in the JSON pane.

## What the extractor finds

| Field | How |
|---|---|
| `type` | Keyword classification: `place`, `event`, `product`, or `unknown` |
| `title` | Guess: the first non-empty line (always verify) |
| `date` | “November 21, 2026”, `2026-11-21`, or `11/21/2026` → normalized to ISO `YYYY-MM-DD` |
| `time` | `7:00 PM` / `7 PM`, or 24-hour `19:30` |
| `price` | First `$…` amount, normalized to `$128.00` |
| `phone` | US-style numbers, normalized to `(212) 555-0147` |
| `email` | First email address, lowercased |
| `url` | First `http(s)://` / `www.` link |
| `address` | A line containing a street number and a street suffix (St, Ave, …), kept whole |
| `confidence_notes` | Per-field note: `high` = explicit pattern found; title/type are always marked as guesses |

## How to run

**Web demo**

```bash
# any static server works; e.g.
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` directly in a browser — OCR is the only feature
that prefers being served over http(s).

**Python core (stdlib only)**

```bash
python3 extractor.py sample/event-concert.txt
python3 extractor.py --help
```

```json
{
  "type": "event",
  "title": "The Night Owls — Live at Warsaw",
  "date": "2026-11-21",
  "time": "7:00 PM",
  "price": "$35.00",
  "phone": null,
  "email": null,
  "url": "https://example.com/tickets/night-owls",
  "address": "261 Driggs Avenue, Brooklyn, NY 11222",
  "confidence_notes": { "date": "high - explicit pattern found in the text", "…": "…" }
}
```

**Tests**

```bash
python3 -m unittest discover -s tests -v
```

## Limitations — stated plainly

- **This is heuristic extraction.** It only finds what is explicitly
  written, in the formats listed above. It will miss dates in other
  formats, non-US phone numbers, prices in other currencies, addresses
  without a recognized street suffix, and plenty of titles (the title is a
  first-line guess, not an understanding of the page).
- **Classification is keyword counting.** A restaurant hosting a concert
  can land on either side of `place` vs. `event`; the confidence note shows
  the signal counts so you can see why.
- **OCR quality is Tesseract’s quality.** Blurry, rotated, or stylized
  screenshots OCR poorly, and the extractor inherits every OCR mistake.
- **One of each field.** If a save lists two dates, two prices, or a venue
  address *and* a billing address, you get the first match only.
- A production version would add an **LLM structured-extraction pass**
  (schema-constrained, bring-your-own-key) after the heuristic pass, use
  the heuristics as a cheap verifier, and keep the same
  confidence-note contract. That pass is intentionally not in this demo:
  no keys, no server, nothing leaves the browser.

## Files

- `index.html` / `app.js` / `styles.css` — the static web demo (JS extractor included)
- `extractor.py` — the Python core, same rules, CLI + importable `extract(text)`
- `sample/*.txt` — fake texts: the three screens power the demo's chips; the
  three saves (restaurant, concert, product) serve the CLI and the tests
- `tests/test_extractor.py` — `unittest` coverage for the samples and empty input
- `docs/PRD.md` — the one-page product spec

## License

MIT — see `LICENSE`.
