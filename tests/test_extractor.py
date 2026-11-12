import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from extractor import extract  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
SAMPLE = os.path.join(ROOT, "sample")


def read_sample(name):
    with open(os.path.join(SAMPLE, name), encoding="utf-8") as fh:
        return fh.read()


class TestSamples(unittest.TestCase):
    def test_place_restaurant(self):
        rec = extract(read_sample("place-restaurant.txt"))
        self.assertEqual(rec["type"], "place")
        self.assertEqual(rec["title"], "La Norteña Taqueria")
        self.assertEqual(rec["phone"], "(212) 555-0147")
        self.assertEqual(rec["address"], "214 Grand Street, New York, NY 10002")
        self.assertEqual(rec["url"], "https://example.com/la-nortena")
        self.assertIn("confidence_notes", rec)

    def test_event_concert(self):
        rec = extract(read_sample("event-concert.txt"))
        self.assertEqual(rec["type"], "event")
        self.assertEqual(rec["date"], "2026-11-21")
        self.assertEqual(rec["time"], "7:00 PM")
        self.assertEqual(rec["price"], "$35.00")
        self.assertEqual(rec["address"], "261 Driggs Avenue, Brooklyn, NY 11222")

    def test_product_jacket(self):
        rec = extract(read_sample("product-jacket.txt"))
        self.assertEqual(rec["type"], "product")
        self.assertEqual(rec["title"], "Canvas Field Jacket")
        self.assertEqual(rec["price"], "$128.00")
        self.assertEqual(rec["email"], "care@example.com")
        self.assertEqual(rec["url"], "https://example.com/shop/field-jacket")

    def test_empty_text(self):
        for text in ("", "   ", "\n\n"):
            rec = extract(text)
            self.assertEqual(rec["type"], "unknown")
            self.assertIsNone(rec["title"])
            self.assertIsNone(rec["date"])
            self.assertIsNone(rec["price"])

    def test_unclassifiable_text_does_not_crash(self):
        rec = extract("just some words with no signals at all")
        self.assertEqual(rec["type"], "unknown")
        self.assertEqual(rec["title"], "just some words with no signals at all")


if __name__ == "__main__":
    unittest.main()
