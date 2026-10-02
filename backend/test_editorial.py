import json
import io
import unittest
from pathlib import Path
from unittest.mock import patch

from editorial import EditorialError, EditorialStore, OWNER


class Capture(io.StringIO):
    def close(self):
        pass


def candidate():
    return {
        "id": "story-one", "slug": "story-one", "sourceUrl": "https://example.org/announcement",
        "sourceDate": "2026-09-26", "topic": "Local AI", "reason": "Potential business impact",
        "sourceLicence": "Link and short paraphrase only", "sourceExcerpt": "The vendor announced a tool.",
    }


def ledger():
    return {
        "claims": [
            {"id": "announced", "kind": "source", "claim": "A tool was announced",
             "sourceUrl": "https://example.org/announcement", "support": "Official announcement",
             "limit": "Availability not independently tested"},
            {"id": "availability", "kind": "unknown", "claim": "Availability to customers",
             "sourceUrl": None, "support": "No direct access test", "limit": "Do not claim deployment"},
        ],
        "mediaRights": "No third-party media used", "clientMentionAllowed": False,
    }


def article():
    return {
        "slug": "story-one", "category": "Update · local AI", "title": "An AI tool was announced",
        "dek": "What the announcement means for buyers", "takeaway": "Wait for a measured release.",
        "eventDate": "2026-09-26", "checkedAt": "2026-09-27", "minutes": 2,
        "art": "ai", "evidence": "The official announcement describes the tool.",
        "limits": "We have not tested availability or performance.",
        "sections": [
            {"heading": "What happened", "paragraphs": ["The company announced a tool."]},
            {"heading": "What to do", "paragraphs": ["Check release status before buying."]},
        ],
        "sources": [{"label": "Official announcement", "url": "https://example.org/announcement"}],
        "service": {"label": "Explore on-prem AI", "url": "https://vkvstudio.com/en/services/on-prem-ai/",
                    "reason": "A scoped pilot can test this on your own data."},
        "author": OWNER, "facts": "An announcement exists.",
        "interpretation": "This might matter to buyers.", "practicalDecision": "Wait for a test.",
        "evidenceStatus": "source",
        "language": "en", "publishedAt": "2026-09-28",
        "canonicalUrl": "https://vkvstudio.pro/briefings/story-one/",
        "mediaRights": "No third-party media used", "previewImage": "/images/story-one.webp",
    }


class EditorialWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.store = EditorialStore(Path(":memory:"))
        self.addCleanup(self.store.db.close)
        self.store.candidate(candidate())

    def prepare(self):
        self.store.ledger("story-one", ledger())
        return self.store.draft("story-one", article())

    def test_only_exact_approved_copy_exports(self):
        content_hash = self.prepare()
        output = Path("story-one.json")
        with self.assertRaises(EditorialError):
            self.store.export("story-one", output)
        with self.assertRaises(EditorialError):
            self.store.decide("story-one", "approve", "0" * 64, OWNER)
        self.store.decide("story-one", "approve", content_hash, OWNER)
        stream = Capture()
        with patch.object(Path, "open", return_value=stream), patch.object(Path, "exists", return_value=False):
            self.store.export("story-one", output)
        bundle = json.loads(stream.getvalue())
        self.assertEqual(bundle["schemaVersion"], 2)
        self.assertEqual(bundle["approval"]["contentSha256"], content_hash)
        self.assertEqual(bundle["article"]["title"], article()["title"])
        with patch.object(Path, "exists", return_value=True):
            with self.assertRaises(EditorialError):
                self.store.export("story-one", output)

    def test_revision_and_rejection_block_export(self):
        old_hash = self.prepare()
        self.store.decide("story-one", "approve", old_hash, OWNER)
        revised = article()
        revised["takeaway"] = "Check availability and measure before buying."
        new_hash = self.store.draft("story-one", revised)
        self.assertNotEqual(new_hash, old_hash)
        with self.assertRaises(EditorialError):
            self.store.export("story-one", Path("story-one.json"))
        self.store.decide("story-one", "reject", new_hash, OWNER)
        with self.assertRaises(EditorialError):
            self.store.export("story-one", Path("story-one.json"))

    def test_restoring_old_text_does_not_restore_old_approval(self):
        old_hash = self.prepare()
        self.store.decide("story-one", "approve", old_hash, OWNER)
        revised = article()
        revised["takeaway"] = "Revised decision."
        self.store.draft("story-one", revised)
        self.assertEqual(self.store.draft("story-one", article()), old_hash)
        with self.assertRaises(EditorialError):
            self.store.export("story-one", Path("story-one.json"))

    def test_invalid_source_and_unsafe_article_rejected(self):
        bad = ledger()
        bad["claims"][0]["sourceUrl"] = "http://example.org/announcement"
        with self.assertRaises(EditorialError):
            self.store.ledger("story-one", bad)
        self.store.ledger("story-one", ledger())
        bad_article = article()
        bad_article["sections"][0]["paragraphs"][0] = "<script>alert(1)</script>"
        with self.assertRaises(EditorialError):
            self.store.draft("story-one", bad_article)
        bad_article = article()
        bad_article["service"]["url"] = "https://evil.example/en/services/"
        with self.assertRaises(EditorialError):
            self.store.draft("story-one", bad_article)

    def test_ledger_change_requires_new_draft(self):
        content_hash = self.prepare()
        self.store.decide("story-one", "approve", content_hash, OWNER)
        changed = ledger()
        changed["claims"][0]["limit"] = "New caveat"
        self.store.ledger("story-one", changed)
        with self.assertRaises(EditorialError):
            self.store.export("story-one", Path("story-one.json"))
        self.assertEqual(self.store.draft("story-one", article()), content_hash)
        with self.assertRaises(EditorialError):
            self.store.export("story-one", Path("story-one.json"))

    def test_malformed_kind_is_rejected_cleanly(self):
        bad = ledger()
        bad["claims"][0]["kind"] = ["source"]
        with self.assertRaises(EditorialError):
            self.store.ledger("story-one", bad)

    def test_optional_event_label_is_part_of_approved_digest(self):
        self.store.ledger("story-one", ledger())
        labelled = article()
        labelled["eventLabel"] = "GLOBAL ROLLOUT"
        labelled_hash = self.store.draft("story-one", labelled)
        self.assertNotEqual(labelled_hash, self.store.draft("story-one", article()))


if __name__ == "__main__":
    unittest.main()
