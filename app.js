"use strict";

/* screenshot-to-json — browser demo.
 *
 * Honest pipeline: there is NO server and NO server-side LLM.
 * 1. Optional in-browser OCR: Tesseract.js is loaded dynamically from a
 *    CDN only when you click "OCR my image". If it is offline/blocked,
 *    you get a clear failure message and the paste-text path still works.
 * 2. A deterministic heuristic extractor (a JS port of extractor.py).
 *    You can also paste OCR'd / copied text directly — that path works
 *    fully offline.
 * 3. The workbench layer: per-field confidence bars, an "uncertain
 *    fields" review list, and hover-to-source highlighting that shows
 *    where each field was found in the raw text.
 */

var SAMPLES = {
  checkout:
    "Checkout \u2014 Northwind Supply\n" +
    "Canvas Field Jacket \u2014 Large, Olive\n" +
    "Total $128.00\n" +
    "Subtotal $112.00 \u00b7 Shipping $16.00 \u00b7 Free returns\n" +
    "Receipt email: buyer@example.com\n" +
    "Ship to 418 Mercer Street, New York, NY 10012\n" +
    "Pay now: https://example.com/checkout/confirm\n",
  settings:
    "Settings \u2014 Account\n" +
    "Profile\n" +
    "Name: Robin Ellis\n" +
    "Email: robin.ellis@example.com\n" +
    "Phone: (646) 555-0183\n" +
    "Notifications: On\n" +
    "Language: English\n" +
    "Privacy & security\n" +
    "Support: https://example.com/support\n" +
    "Version 4.2.0\n",
  profile:
    "Maya Chen\n" +
    "Product Designer \u2014 Studio North\n" +
    "maya@mayachen.example\n" +
    "(917) 555-0119\n" +
    "Portfolio: https://example.com/maya-chen\n" +
    "Brooklyn, New York\n" +
    "Available for freelance projects\n",
  place:
    "La Norte\u00f1a Taqueria\n" +
    "Saved from Instagram \u2014 Mexican restaurant, tacos, mezcal, mariscos\n" +
    "214 Grand Street, New York, NY 10002\n" +
    "(212) 555-0147\n" +
    "Open for dinner \u2014 reservations for a table for 2\n" +
    "https://example.com/la-nortena\n",
  event:
    "The Night Owls \u2014 Live at Warsaw\n" +
    "Live music \u2014 concert tickets\n" +
    "Saturday, November 21, 2026\n" +
    "Doors 7:00 PM, Show 8:00 PM\n" +
    "261 Driggs Avenue, Brooklyn, NY 11222\n" +
    "Tickets $35\n" +
    "https://example.com/tickets/night-owls\n",
  product:
    "Canvas Field Jacket\n" +
    "Shop \u2014 Add to cart\n" +
    "Price: $128.00\n" +
    "In stock \u2014 free shipping and returns\n" +
    "Size: Large, Color: Olive\n" +
    "Buy now at https://example.com/shop/field-jacket\n" +
    "Questions: care@example.com\n"
};

/* ---------- Heuristic extractor (JS port of extractor.py) ---------- */

var MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9,
  sept: 9, oct: 10, nov: 11, dec: 12
};

var PLACE_KEYWORDS = [
  "restaurant", "taqueria", "cafe", "caf\u00e9", "coffee", "bakery",
  "bar", "tacos", "mezcal", "ramen", "sushi", "pizza", "dinner",
  "lunch", "brunch", "reservation", "reservations", "table for",
  "cuisine", "tasting menu", "diner", "bistro", "trattoria"
];
var EVENT_KEYWORDS = [
  "concert", "ticket", "tickets", "doors", "show", "live at",
  "live music", "theatre", "theater", "film", "screening",
  "festival", "performance", "admission", "doors at"
];
var PRODUCT_KEYWORDS = [
  "add to cart", "buy now", "in stock", "shipping", "returns",
  "size:", "color:", "colour:", "sku", "shop", "price:",
  "add to bag", "checkout"
];
var KEYWORDS_BY_TYPE = { place: PLACE_KEYWORDS, event: EVENT_KEYWORDS, product: PRODUCT_KEYWORDS };

function countOccurrences(haystack, needle) {
  var count = 0, idx = 0;
  while (true) {
    idx = haystack.indexOf(needle, idx);
    if (idx === -1) break;
    count += 1;
    idx += needle.length;
  }
  return count;
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }

function findDate(text) {
  var m = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
  if (m) {
    var month = MONTHS[m[1].toLowerCase().replace(".", "")];
    return m[3] + "-" + pad2(month) + "-" + pad2(parseInt(m[2], 10));
  }
  m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return m[0];
  m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/);
  if (m) {
    var year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    return year + "-" + pad2(parseInt(m[1], 10)) + "-" + pad2(parseInt(m[2], 10));
  }
  return null;
}

function findTime(text) {
  var m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?\b/);
  if (m) return parseInt(m[1], 10) + ":" + (m[2] || "00") + " " + m[3].toUpperCase() + "M";
  m = text.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  if (m) return m[0];
  return null;
}

function findPrice(text) {
  var m = text.match(/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b|\$\s?\d+(?:\.\d{2})?\b/);
  if (!m) return null;
  var value = parseFloat(m[0].replace("$", "").replace(/,/g, "").trim());
  return isNaN(value) ? null : "$" + value.toFixed(2);
}

function findPhone(text) {
  var m = text.match(/\(?\b\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/);
  if (!m) return null;
  var digits = m[0].replace(/\D/g, "");
  if (digits.length === 10) {
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6, 10);
  }
  return m[0].trim();
}

function findAddress(lines) {
  var street = /\b\d{1,5}\s+\S.*\b(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Place|Pl|Court|Ct|Parkway|Pkwy|Highway|Hwy)\b/i;
  var label = /^(?:ship(?:ping)?\s+(?:to|address)|deliver\s+to|address|location)\s*:?\s+/i;
  for (var i = 0; i < lines.length; i++) {
    if (street.test(lines[i])) return lines[i].replace(/,$/, "").replace(label, "");
  }
  return null;
}

function classify(lowered) {
  var scores = { place: 0, event: 0, product: 0 }, i;
  for (i = 0; i < PLACE_KEYWORDS.length; i++) scores.place += countOccurrences(lowered, PLACE_KEYWORDS[i]);
  for (i = 0; i < EVENT_KEYWORDS.length; i++) scores.event += countOccurrences(lowered, EVENT_KEYWORDS[i]);
  for (i = 0; i < PRODUCT_KEYWORDS.length; i++) scores.product += countOccurrences(lowered, PRODUCT_KEYWORDS[i]);
  var order = ["event", "product", "place"]; // deterministic tie-break
  var best = "unknown", bestScore = 0;
  for (i = 0; i < order.length; i++) {
    if (scores[order[i]] > bestScore) { best = order[i]; bestScore = scores[order[i]]; }
  }
  return { type: best, scores: scores };
}

function extract(text) {
  var notes, i;
  if (!text || !String(text).trim()) {
    notes = { type: "low - no text to classify", title: "not found - no text" };
    ["date", "time", "price", "phone", "email", "url", "address"].forEach(function (k) { notes[k] = "not found"; });
    return { type: "unknown", title: null, date: null, time: null, price: null,
             phone: null, email: null, url: null, address: null, confidence_notes: notes };
  }
  text = String(text);
  var lines = text.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  var lowered = text.toLowerCase();
  var cls = classify(lowered);
  var emailM = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  var urlM = text.match(/\b(?:https?:\/\/|www\.)[^\s<>()\[\]"']+/i);
  var fields = {
    date: findDate(text),
    time: findTime(text),
    price: findPrice(text),
    phone: findPhone(text),
    email: emailM ? emailM[0].toLowerCase() : null,
    url: urlM ? urlM[0].replace(/[.,;]+$/, "") : null,
    address: findAddress(lines)
  };
  notes = {};
  notes.type = cls.type === "unknown"
    ? "low - no classification keywords found"
    : "medium - " + cls.scores[cls.type] + " keyword signal(s) for '" + cls.type +
      "' (place=" + cls.scores.place + ", event=" + cls.scores.event +
      ", product=" + cls.scores.product + "); keyword classification, verify";
  notes.title = "low - guessed from the first non-empty line; verify";
  Object.keys(fields).forEach(function (k) {
    notes[k] = fields[k] ? "high - explicit pattern found in the text" : "not found";
  });
  return {
    type: cls.type,
    title: lines.length ? lines[0] : null,
    date: fields.date, time: fields.time, price: fields.price,
    phone: fields.phone, email: fields.email, url: fields.url,
    address: fields.address, confidence_notes: notes
  };
}

/* ---------- Evidence: where each field was found ---------- */

var FIELD_ORDER = ["type", "title", "date", "time", "price", "phone", "email", "url", "address"];

function rangeOf(m) { return m ? { start: m.index, end: m.index + m[0].length } : null; }

function findEvidence(text, result) {
  var ev = {};
  FIELD_ORDER.forEach(function (k) { ev[k] = []; });
  if (!text || !result) return ev;

  var m;
  m = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i)
    || text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
    || text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/);
  if (result.date && m) ev.date.push(rangeOf(m));

  m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?\b/) || text.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  if (result.time && m) ev.time.push(rangeOf(m));

  m = text.match(/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b|\$\s?\d+(?:\.\d{2})?\b/);
  if (result.price && m) ev.price.push(rangeOf(m));

  m = text.match(/\(?\b\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/);
  if (result.phone && m) ev.phone.push(rangeOf(m));

  m = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (result.email && m) ev.email.push(rangeOf(m));

  m = text.match(/\b(?:https?:\/\/|www\.)[^\s<>()\[\]"']+/i);
  if (result.url && m) ev.url.push({ start: m.index, end: m.index + m[0].replace(/[.,;]+$/, "").length });

  // title: first non-empty line
  var rawLines = text.split("\n");
  var offset = 0, i, line;
  for (i = 0; i < rawLines.length; i++) {
    line = rawLines[i];
    var trimmed = line.trim();
    if (trimmed) {
      if (result.title) {
        var tStart = offset + line.indexOf(trimmed);
        ev.title.push({ start: tStart, end: tStart + trimmed.length });
      }
      break;
    }
    offset += line.length + 1;
  }
  // address: the line the extractor picked
  if (result.address) {
    offset = 0;
    var street = /\b\d{1,5}\s+\S.*\b(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Place|Pl|Court|Ct|Parkway|Pkwy|Highway|Hwy)\b/i;
    for (i = 0; i < rawLines.length; i++) {
      line = rawLines[i];
      var lt = line.trim();
      if (lt && street.test(lt)) {
        var rel = lt.indexOf(result.address);
        var aStart = offset + line.indexOf(lt) + (rel === -1 ? 0 : rel);
        ev.address.push({ start: aStart, end: aStart + result.address.length });
        break;
      }
      offset += line.length + 1;
    }
  }
  // type: the keyword signals that drove the classification
  if (result.type && result.type !== "unknown" && KEYWORDS_BY_TYPE[result.type]) {
    var lowered = text.toLowerCase();
    KEYWORDS_BY_TYPE[result.type].forEach(function (kw) {
      var idx = 0, guard = 0;
      while (guard < 8) {
        idx = lowered.indexOf(kw, idx);
        if (idx === -1) break;
        ev.type.push({ start: idx, end: idx + kw.length });
        idx += kw.length; guard += 1;
      }
    });
  }
  return ev;
}

/* ---------- Confidence ---------- */

function confidenceOf(note) {
  if (!note) return { level: "missing", label: "Missing", pct: 0 };
  if (note.indexOf("high") === 0) return { level: "high", label: "High", pct: 94 };
  if (note.indexOf("medium") === 0) return { level: "medium", label: "Medium", pct: 62 };
  if (note.indexOf("low") === 0) return { level: "low", label: "Low", pct: 32 };
  return { level: "missing", label: "Missing", pct: 0 };
}

function shortReason(field, result, note) {
  if (result[field] === null || result[field] === undefined) return "not in the text";
  if (field === "title") return "guessed from line 1";
  if (field === "type") return result.type === "unknown" ? "no signal found" : "keyword guess — check it";
  return note ? note.split(" - ")[1] || "" : "";
}

/* ---------- UI ---------- */

var lastResult = null;
var lastEvidence = null;
var selectedImage = null;
var debounceTimer = null;

function el(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function setStatus(message, isError) {
  var status = el("status");
  status.textContent = message || "";
  status.className = isError ? "status error" : "status";
}

/* --- source viewer with per-line evidence marks --- */

function renderSource(text, evidence) {
  var view = el("source-view");
  if (!text || !text.trim()) {
    view.innerHTML = '<p class="source-empty">Load a sample or paste text \u2014 found fields light up here.</p>';
    return;
  }
  // flatten evidence ranges with their field names
  var ranges = [];
  if (evidence) {
    FIELD_ORDER.forEach(function (f) {
      (evidence[f] || []).forEach(function (r) { ranges.push({ start: r.start, end: r.end, field: f }); });
    });
  }
  var lines = text.split("\n");
  var offset = 0;
  var html = lines.map(function (line, li) {
    var lineStart = offset;
    offset += line.length + 1;
    var lineRanges = ranges
      .filter(function (r) { return r.end > lineStart && r.start < lineStart + line.length; })
      .map(function (r) {
        return {
          start: Math.max(r.start, lineStart) - lineStart,
          end: Math.min(r.end, lineStart + line.length) - lineStart,
          field: r.field
        };
      })
      .filter(function (r) { return r.end > r.start; })
      .sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    var out = "", pos = 0;
    lineRanges.forEach(function (r) {
      if (r.start < pos) return; // skip overlaps; first field wins
      out += escapeHtml(line.slice(pos, r.start));
      out += '<mark class="ev" data-field="' + r.field + '">' + escapeHtml(line.slice(r.start, r.end)) + "</mark>";
      pos = r.end;
    });
    out += escapeHtml(line.slice(pos));
    if (!out) out = "&nbsp;";
    return '<div class="src-line"><span class="ln">' + (li + 1) + '</span><span class="src-text">' + out + "</span></div>";
  }).join("");
  view.innerHTML = html;
}

function highlightField(field) {
  var marks = el("source-view").querySelectorAll("mark.ev");
  var first = null;
  marks.forEach(function (mk) {
    var on = field && mk.getAttribute("data-field") === field;
    mk.classList.toggle("active", !!on);
    if (on && !first) first = mk;
  });
  if (first) first.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* --- field list with animated confidence bars --- */

function renderFields(result) {
  var list = el("fields");
  list.innerHTML = "";
  FIELD_ORDER.forEach(function (field, i) {
    var conf = confidenceOf(result.confidence_notes[field]);
    var value = result[field];
    var li = document.createElement("li");
    li.className = "field";
    li.tabIndex = 0;
    li.style.transitionDelay = (i * 45) + "ms";
    li.setAttribute("aria-label", field + ": " + (value === null ? "not found" : value) + ", confidence " + conf.label);
    var display = value === null
      ? '<span class="field-value missing">not found</span>'
      : '<span class="field-value" title="' + escapeHtml(value) + '">' + escapeHtml(value) + "</span>";
    li.innerHTML =
      '<span class="field-name">' + field + "</span>" +
      display +
      '<span class="field-conf"><span class="bar"><i class="' + conf.level + '" data-pct="' + conf.pct + '"></i></span>' +
      '<span class="conf-label ' + conf.level + '">' + conf.label + "</span></span>";
    li.addEventListener("mouseenter", function () { highlightField(field); });
    li.addEventListener("mouseleave", function () { highlightField(null); });
    li.addEventListener("focus", function () { highlightField(field); });
    li.addEventListener("blur", function () { highlightField(null); });
    list.appendChild(li);
  });
  // animate in on the next frame
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      list.querySelectorAll(".field").forEach(function (row) { row.classList.add("in"); });
      list.querySelectorAll(".bar i").forEach(function (bar) {
        bar.style.width = bar.getAttribute("data-pct") + "%";
      });
    });
  });
}

/* --- "needs a second look" panel: designed, not broken --- */

function renderUncertain(result) {
  var panel = el("uncertain");
  var shaky = [], missing = [];
  FIELD_ORDER.forEach(function (field) {
    var conf = confidenceOf(result.confidence_notes[field]);
    if (result[field] === null) missing.push(field);
    else if (conf.level === "low" || conf.level === "medium") shaky.push(field);
  });
  if (!shaky.length && !missing.length) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  var items = "";
  shaky.forEach(function (f) {
    items += '<li data-field="' + f + '"><b>' + f + "</b> · " + escapeHtml(shortReason(f, result, result.confidence_notes[f])) + "</li>";
  });
  missing.forEach(function (f) {
    items += '<li data-field="' + f + '"><b>' + f + "</b> · not in the text</li>";
  });
  var lead = missing.length && !shaky.length
    ? "Nothing shaky \u2014 but these fields simply aren\u2019t in this screen. They stay null rather than guessed."
    : "These are guesses or gaps, kept visible on purpose. Hover any item to check it against the source.";
  panel.innerHTML =
    '<h3><span class="badge-warn">!</span> Needs a second look</h3>' +
    "<p>" + lead + "</p><ul>" + items + "</ul>";
  panel.hidden = false;
  panel.querySelectorAll("li").forEach(function (li) {
    li.addEventListener("mouseenter", function () { highlightField(li.getAttribute("data-field")); });
    li.addEventListener("mouseleave", function () { highlightField(null); });
  });
}

/* --- syntax-highlighted JSON --- */

function highlightJson(json) {
  var esc = escapeHtml(json);
  return esc.replace(/("(\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(\.\d+)?([eE][+-]?\d+)?/g, function (match, str, _e, colon, kw, _f, _exp) {
    if (str) return colon ? '<span class="k">' + str + "</span>" + colon : '<span class="s">' + str + "</span>";
    if (kw) return '<span class="n">' + match + "</span>";
    if (match === "null") return '<span class="null">null</span>';
    return '<span class="n">' + match + "</span>";
  });
}

function renderJson(result) {
  el("output").innerHTML = highlightJson(JSON.stringify(result, null, 2));
}

function renderSummary(result) {
  var found = FIELD_ORDER.filter(function (f) { return result[f] !== null; }).length;
  el("summary").innerHTML = "<b>" + found + " of " + FIELD_ORDER.length + "</b> fields found";
}

/* --- extraction run --- */

function runExtraction(announce) {
  var text = el("input-text").value;
  el("char-count").textContent = text.length ? text.length + " chars" : "";
  if (!text.trim()) {
    lastResult = null; lastEvidence = null;
    renderSource("", null);
    el("fields").innerHTML = "";
    el("uncertain").hidden = true;
    el("summary").textContent = "";
    el("output").textContent = "{ }\nPaste text or load a sample \u2014 the record appears here.";
    if (announce) setStatus("Paste some text (or load a sample) first.", true);
    return;
  }
  lastResult = extract(text);
  lastEvidence = findEvidence(text, lastResult);
  renderFields(lastResult);
  renderUncertain(lastResult);
  renderJson(lastResult);
  renderSummary(lastResult);
  renderSource(text, lastEvidence);
  if (announce) {
    var found = FIELD_ORDER.filter(function (f) { return lastResult[f] !== null; }).length;
    setStatus("Extracted \u2014 " + found + " of " + FIELD_ORDER.length + " fields found. Hover a field to see where it came from.");
  }
}

function scheduleExtraction() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function () { runExtraction(false); }, 450);
}

function selectSampleCard(key) {
  document.querySelectorAll(".sample-card, .chip").forEach(function (b) {
    b.classList.toggle("selected", b.id === "sample-" + key);
  });
}

function loadSample(key) {
  el("input-text").value = SAMPLES[key];
  selectSampleCard(key);
  runExtraction(false);
  setStatus("Sample extracted. Hover any field to see where it was found.");
}

function loadScript(src) {
  return new Promise(function (resolve, reject) {
    var script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function init() {
  Object.keys(SAMPLES).forEach(function (key) {
    var btn = el("sample-" + key);
    if (btn) btn.addEventListener("click", function () { loadSample(key); });
  });

  el("input-text").addEventListener("input", function () {
    selectSampleCard("__none__");
    el("char-count").textContent = el("input-text").value.length + " chars";
    renderSource(el("input-text").value, null);
    scheduleExtraction();
  });
  el("input-text").addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") runExtraction(true);
  });
  el("extract-button").addEventListener("click", function () { runExtraction(true); });

  el("image-input").addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    selectedImage = file || null;
    var preview = el("preview");
    if (!file) { preview.hidden = true; preview.removeAttribute("src"); return; }
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    setStatus("Image selected. Click \u201cOCR my image\u201d, or paste text instead.");
  });

  el("ocr-button").addEventListener("click", function () {
    if (!selectedImage) {
      setStatus("Choose an image first \u2014 or paste text; that path works fully offline.", true);
      return;
    }
    setStatus("Loading OCR engine from CDN\u2026");
    // Loaded dynamically, only on this click \u2014 never on page load.
    loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.0.5/dist/tesseract.min.js")
      .then(function () {
        if (!window.Tesseract || !window.Tesseract.recognize) {
          throw new Error("Tesseract.js unavailable");
        }
        setStatus("Running OCR in your browser\u2026 this can take a few seconds.");
        return window.Tesseract.recognize(selectedImage, "eng");
      })
      .then(function (result) {
        var text = result && result.data ? result.data.text : "";
        if (!text || !text.trim()) {
          setStatus("OCR finished but found no readable text. Try a clearer image, or paste the text instead.", true);
          return;
        }
        el("input-text").value = text;
        runExtraction(false);
        setStatus("OCR done \u2014 review the text, the record is already extracted.");
      })
      .catch(function () {
        setStatus("OCR could not load or run (offline, CDN blocked, or unsupported image). " +
                  "No problem: paste the text from the screenshot instead \u2014 " +
                  "that path works fully offline.", true);
      });
  });

  el("copy-button").addEventListener("click", function () {
    if (!lastResult) { setStatus("Nothing to copy yet \u2014 extract something first.", true); return; }
    var payload = JSON.stringify(lastResult, null, 2);
    function done() { setStatus("JSON copied to clipboard."); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(done, function () { setStatus("Copy failed \u2014 select the JSON and copy it manually.", true); });
    } else {
      setStatus("Clipboard is unavailable in this browser \u2014 select the JSON and copy it manually.", true);
    }
  });

  el("download-button").addEventListener("click", function () {
    if (!lastResult) { setStatus("Nothing to download yet \u2014 extract something first.", true); return; }
    var blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "screenshot-to-json.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatus("JSON downloaded.");
  });

  // Land on a worked example: a stranger should get it in five seconds.
  loadSample("checkout");
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}
