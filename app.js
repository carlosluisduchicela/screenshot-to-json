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
 */

var SAMPLES = {
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
  for (var i = 0; i < lines.length; i++) {
    if (street.test(lines[i])) return lines[i].replace(/,$/, "");
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

/* ---------- UI ---------- */

var lastResult = null;
var selectedImage = null;

function el(id) { return document.getElementById(id); }

function setStatus(message, isError) {
  var status = el("status");
  status.textContent = message || "";
  status.className = isError ? "status error" : "status";
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
    el("sample-" + key).addEventListener("click", function () {
      el("input-text").value = SAMPLES[key];
      setStatus("Sample loaded. Click Extract.");
    });
  });

  el("image-input").addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    selectedImage = file || null;
    var preview = el("preview");
    if (!file) { preview.hidden = true; preview.removeAttribute("src"); return; }
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    setStatus("Image selected. Click \u201cOCR my image\u201d, or paste text below instead.");
  });

  el("ocr-button").addEventListener("click", function () {
    if (!selectedImage) {
      setStatus("Choose an image first \u2014 or paste text below; that path works fully offline.", true);
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
        setStatus("OCR done \u2014 text is in the box below. Review it, then click Extract.");
      })
      .catch(function () {
        setStatus("OCR could not load or run (offline, CDN blocked, or unsupported image). " +
                  "No problem: paste the text from the screenshot into the box below \u2014 " +
                  "that path works fully offline.", true);
      });
  });

  el("extract-button").addEventListener("click", function () {
    var text = el("input-text").value;
    if (!text.trim()) {
      setStatus("Paste some text (or load a sample) first.", true);
      return;
    }
    lastResult = extract(text);
    el("output").textContent = JSON.stringify(lastResult, null, 2);
    el("result-actions").hidden = false;
    setStatus("Extracted. Fields marked \u201cnot found\u201d were not explicit in the text.");
  });

  el("copy-button").addEventListener("click", function () {
    if (!lastResult) return;
    var payload = JSON.stringify(lastResult, null, 2);
    function done() { setStatus("JSON copied to clipboard."); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(done, function () { setStatus("Copy failed \u2014 select the JSON and copy it manually.", true); });
    } else {
      setStatus("Clipboard is unavailable in this browser \u2014 select the JSON and copy it manually.", true);
    }
  });

  el("download-button").addEventListener("click", function () {
    if (!lastResult) return;
    var blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "screenshot-to-json.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatus("JSON downloaded.");
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}
