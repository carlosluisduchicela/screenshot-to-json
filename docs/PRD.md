# PRD — screenshot-to-json

**Problem.** People save places, events, and products as screenshots and
share-sheet dumps. The information is trapped as pixels or messy text:
unsearchable, undedupable, and impossible to pipe into a list, calendar,
or spreadsheet without retyping it by hand.

**User.** Anyone with a camera roll / saves folder full of screenshots —
starting with the author’s own saved-places workflow.

**Job to be done.** “Turn this screenshot into a record I can use, in
seconds, without sending my data to a server.”

## V1 scope (this repo)

- Static web demo, no server, no build step, no accounts, no API keys.
- Input paths, in priority order:
  1. **Paste text** (copied or OCR’d elsewhere) — must work fully offline.
  2. **Optional in-browser OCR** — Tesseract.js loaded dynamically from a
     CDN only on explicit click; graceful, plain-language failure if
     offline/blocked. OCR is a convenience, never a dependency.
- Deterministic heuristic extraction, implemented twice from one rule set:
  `extractor.py` (Python, stdlib only, CLI + importable) and a JS port in
  `app.js`. Same input → same output.
- Output: one JSON record — `type` (`place` / `event` / `product` /
  `unknown`), `title`, `date`, `time`, `price`, `phone`, `email`, `url`,
  `address` — plus a `confidence_notes` entry **for every field**.
- Three fake sample saves (restaurant, concert, product) shared by the web
  demo, the CLI, and the tests. All sample data is fake.
- Copy JSON and Download JSON from the demo.

## Non-goals

- No server-side LLM, no hosted OCR, no analytics, no storage. Nothing the
  user pastes or uploads leaves the browser.
- No attempt to “understand” a page: no layout analysis, no multi-record
  extraction, no non-US formats in v1. One record, first match per field.
- No accuracy claims the heuristics can’t back up.

## Success criteria

- Each sample extracts its expected type and key fields (enforced by
  `tests/test_extractor.py`): price in the product sample, date/time in
  the event sample, phone/address in the place sample.
- Empty or unclassifiable input returns `type: "unknown"` — never a crash.
- A first-time visitor can go from page load to copied JSON in under a
  minute using a sample, without reading documentation.
- Limitations are stated in the README in plain language, next to the
  feature claims — not buried.

## Design principles

- **Honesty over magic.** Every field says how sure the extractor is and
  why. The title and type are always labeled guesses.
- **Offline-first core.** The valuable path (paste → extract) has zero
  network dependencies; network features degrade with a clear message.
- **Heuristics as the floor, not the ceiling.** The production path is an
  LLM structured-extraction pass (schema-constrained, bring-your-own-key)
  layered on top, with these heuristics kept as a cheap verifier. The JSON
  contract does not change when that layer arrives.

## Risks

- OCR quality varies wildly by screenshot; mitigated by making OCR
  optional and by showing the OCR’d text for review before extraction.
- Keyword classification will misfire on hybrid saves (a restaurant
  concert); mitigated by publishing the signal counts in the type’s
  confidence note.
