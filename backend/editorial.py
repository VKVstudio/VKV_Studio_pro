"""Local, manual editorial ledger and approval-gated JSON export."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

SCHEMA_VERSION = 2
OWNER = "Valerii Karpov"
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
KINDS = {"source", "ours", "estimate", "unknown"}
ARTICLE_FIELDS = {
    "slug", "category", "title", "dek", "takeaway", "eventDate", "checkedAt",
    "minutes", "art", "evidence", "limits", "sections", "sources", "service",
    "author", "facts", "interpretation", "practicalDecision", "evidenceStatus",
    "language", "publishedAt", "canonicalUrl", "mediaRights", "previewImage",
}


class EditorialError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise EditorialError(message)


def nonempty(value: object, name: str) -> str:
    require(isinstance(value, str) and bool(value.strip()), f"{name} must be non-empty text")
    return value.strip()


def iso_date(value: object, name: str) -> str:
    text = nonempty(value, name)
    try:
        date.fromisoformat(text)
    except ValueError as exc:
        raise EditorialError(f"{name} must be an ISO date") from exc
    require(len(text) == 10, f"{name} must be YYYY-MM-DD")
    return text


def https_url(value: object, name: str, origin: str | None = None) -> str:
    text = nonempty(value, name)
    try:
        parsed = urlsplit(text)
    except ValueError as exc:
        raise EditorialError(f"{name} is not a valid URL") from exc
    require(parsed.scheme == "https" and bool(parsed.hostname), f"{name} must be an HTTPS URL")
    require(not parsed.username and not parsed.password and not parsed.fragment,
            f"{name} must not contain credentials or a fragment")
    require(not any(ord(char) < 32 for char in text), f"{name} contains control characters")
    if origin:
        require(parsed.netloc == origin, f"{name} must point to {origin}")
    return text


def plain_text(value: object, name: str) -> str:
    text = nonempty(value, name)
    require(len(text) <= 20000, f"{name} exceeds text limit")
    require("<" not in text and ">" not in text, f"{name} must not contain HTML")
    require(not any(ord(char) < 32 and char not in "\n\t" for char in text),
            f"{name} contains control characters")
    return text


def object_file(path: Path) -> dict:
    require(path.is_file() and not path.is_symlink(), "input must be a regular file")
    with path.open("rb") as source:
        raw = source.read(1024 * 1024 + 1)
    require(len(raw) <= 1024 * 1024, "input exceeds 1 MiB")
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, RecursionError) as exc:
        raise EditorialError("input must be bounded UTF-8 JSON") from exc
    require(isinstance(data, dict), "input must be a JSON object")
    return data


def canonical(data: object) -> bytes:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(data: object) -> str:
    return hashlib.sha256(canonical(data)).hexdigest()


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def validate_candidate(data: dict) -> dict:
    require(set(data) == {"id", "slug", "sourceUrl", "sourceDate", "topic", "reason", "sourceLicence", "sourceExcerpt"},
            "candidate needs id, slug, sourceUrl, sourceDate, topic, reason, sourceLicence, sourceExcerpt")
    ident = nonempty(data["id"], "id")
    slug = nonempty(data["slug"], "slug")
    require(ID_RE.fullmatch(ident) is not None and ID_RE.fullmatch(slug) is not None,
            "id and slug must be lowercase URL-safe names")
    return {
        "id": ident, "slug": slug, "sourceUrl": https_url(data["sourceUrl"], "sourceUrl"),
        "sourceDate": iso_date(data["sourceDate"], "sourceDate"),
        "topic": plain_text(data["topic"], "topic"),
        "reason": plain_text(data["reason"], "reason"),
        "sourceLicence": plain_text(data["sourceLicence"], "sourceLicence"),
        "sourceExcerpt": plain_text(data["sourceExcerpt"], "sourceExcerpt"),
    }


def validate_ledger(data: dict, candidate: dict) -> dict:
    require(set(data) == {"claims", "mediaRights", "clientMentionAllowed"},
            "ledger needs claims, mediaRights, clientMentionAllowed")
    require(isinstance(data["claims"], list) and 1 <= len(data["claims"]) <= 100, "claims must contain 1..100 items")
    claims = []
    seen = set()
    for index, raw in enumerate(data["claims"]):
        require(isinstance(raw, dict) and set(raw) == {"id", "kind", "claim", "sourceUrl", "support", "limit"},
                f"claim {index} has invalid fields")
        claim_id = nonempty(raw["id"], "claim id")
        require(ID_RE.fullmatch(claim_id) is not None and claim_id not in seen, "claim IDs must be unique and URL-safe")
        seen.add(claim_id)
        require(isinstance(raw["kind"], str) and raw["kind"] in KINDS,
                f"claim {claim_id} has invalid kind")
        source_url = https_url(raw["sourceUrl"], "claim sourceUrl") if raw["sourceUrl"] else None
        if raw["kind"] == "source":
            require(source_url is not None, f"source claim {claim_id} needs a source URL")
        if raw["kind"] == "unknown":
            require(source_url is None, f"unknown claim {claim_id} cannot claim source support")
        claims.append({
            "id": claim_id, "kind": raw["kind"], "claim": plain_text(raw["claim"], "claim"),
            "sourceUrl": source_url, "support": plain_text(raw["support"], "support"),
            "limit": plain_text(raw["limit"], "limit"),
        })
    require(any(item["kind"] == "source" and item["sourceUrl"] == candidate["sourceUrl"] for item in claims),
            "at least one source claim must cite the candidate primary source")
    require(isinstance(data["clientMentionAllowed"], bool), "clientMentionAllowed must be boolean")
    return {"claims": claims, "mediaRights": plain_text(data["mediaRights"], "mediaRights"),
            "clientMentionAllowed": data["clientMentionAllowed"]}


def validate_article(data: dict, candidate: dict, ledger: dict) -> dict:
    require(ARTICLE_FIELDS <= set(data) <= ARTICLE_FIELDS | {"eventLabel"},
            "draft article fields do not match contract v2")
    require(data["language"] == "en", "publication language must be en")
    iso_date(data["publishedAt"], "publishedAt")
    require(data["canonicalUrl"] == f"https://vkvstudio.pro/briefings/{candidate['slug']}/",
            "canonicalUrl must match the article route")
    plain_text(data["mediaRights"], "mediaRights")
    require(data["mediaRights"] == ledger["mediaRights"], "media rights must match reviewed ledger")
    require(isinstance(data["previewImage"], str) and re.fullmatch(r"/images/[a-zA-Z0-9/_-]+\.(?:webp|png|jpg)", data["previewImage"]) is not None,
            "previewImage must be a local image path")
    if "eventLabel" in data:
        plain_text(data["eventLabel"], "eventLabel")
    require(data["slug"] == candidate["slug"], "draft slug differs from candidate")
    require(data["author"] == OWNER, "author must be Valerii Karpov")
    for name in ("category", "title", "dek", "takeaway", "evidence", "limits", "facts",
                 "interpretation", "practicalDecision"):
        plain_text(data[name], name)
    require(isinstance(data["evidenceStatus"], str) and data["evidenceStatus"] in KINDS,
            "invalid evidenceStatus")
    checked = iso_date(data["checkedAt"], "checkedAt")
    if data["eventDate"] is not None:
        require(iso_date(data["eventDate"], "eventDate") <= checked, "eventDate follows checkedAt")
    require(type(data["minutes"]) is int and 1 <= data["minutes"] <= 60, "minutes must be 1..60")
    require(isinstance(data["art"], str) and data["art"] in {"feature", "ai", "performance", "performance-cache", "phone-mobile", "ai-search-fundamentals", "google-ai-search", "agents-api", "sponsored-agents", "shieldstral", "nemotron"},
            "invalid art token")
    require(isinstance(data["sections"], list) and 2 <= len(data["sections"]) <= 20, "2..20 sections required")
    for section in data["sections"]:
        require(isinstance(section, dict) and set(section) == {"heading", "paragraphs"}, "invalid section")
        plain_text(section["heading"], "heading")
        require(isinstance(section["paragraphs"], list) and 1 <= len(section["paragraphs"]) <= 30, "section needs 1..30 paragraphs")
        for paragraph in section["paragraphs"]:
            plain_text(paragraph, "paragraph")
    require(isinstance(data["sources"], list) and 1 <= len(data["sources"]) <= 100, "1..100 sources required")
    source_urls = set()
    for source in data["sources"]:
        require(isinstance(source, dict) and set(source) == {"label", "url"}, "invalid source")
        plain_text(source["label"], "source label")
        source_urls.add(https_url(source["url"], "source url"))
    require(candidate["sourceUrl"] in source_urls, "draft must cite candidate primary source")
    for claim in ledger["claims"]:
        if claim["kind"] == "source":
            require(claim["sourceUrl"] in source_urls, f"draft omits cited source for {claim['id']}")
    service = data["service"]
    require(isinstance(service, dict) and set(service) == {"label", "url", "reason"}, "invalid service CTA")
    plain_text(service["label"], "service label")
    plain_text(service["reason"], "service reason")
    https_url(service["url"], "service url", "vkvstudio.com")
    require(re.fullmatch(r"https://vkvstudio\.com/en/services/[a-z0-9-]+/", service["url"]) is not None,
            "CTA must reference a service route")
    return data


class EditorialStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS stories (
                id TEXT PRIMARY KEY, candidate TEXT NOT NULL, ledger TEXT, article TEXT
            );
            CREATE TABLE IF NOT EXISTS decisions (
                seq INTEGER PRIMARY KEY AUTOINCREMENT, story_id TEXT NOT NULL,
                action TEXT NOT NULL, content_sha256 TEXT NOT NULL, ledger_sha256 TEXT NOT NULL,
                actor TEXT NOT NULL, decided_at TEXT NOT NULL,
                FOREIGN KEY (story_id) REFERENCES stories(id)
            );
        """)
        # Additive migration; local legacy DBs retain their content and decisions.
        for table in ("stories", "decisions"):
            columns = {row[1] for row in self.db.execute(f"PRAGMA table_info({table})")}
            if "revision" not in columns:
                self.db.execute(f"ALTER TABLE {table} ADD COLUMN revision INTEGER NOT NULL DEFAULT 0")
        self.db.commit()

    def candidate(self, data: dict) -> None:
        record = validate_candidate(data)
        try:
            with self.db:
                self.db.execute("INSERT INTO stories (id, candidate) VALUES (?, ?)",
                                (record["id"], json.dumps(record, ensure_ascii=False)))
        except sqlite3.IntegrityError as exc:
            raise EditorialError("candidate ID already exists") from exc

    def record(self, ident: str) -> tuple[dict, dict | None, dict | None]:
        require(ID_RE.fullmatch(ident) is not None, "invalid story ID")
        row = self.db.execute("SELECT candidate, ledger, article FROM stories WHERE id = ?", (ident,)).fetchone()
        require(row is not None, "story not found")
        return tuple(json.loads(part) if part else None for part in row)

    def ledger(self, ident: str, data: dict) -> None:
        candidate, _, _ = self.record(ident)
        value = validate_ledger(data, candidate)
        with self.db:
            self.db.execute("UPDATE stories SET ledger = ?, article = NULL, revision = revision + 1 WHERE id = ?",
                            (json.dumps(value, ensure_ascii=False), ident))

    def draft(self, ident: str, data: dict) -> str:
        candidate, ledger, _ = self.record(ident)
        require(ledger is not None, "ledger required before draft")
        article = validate_article(data, candidate, ledger)
        with self.db:
            self.db.execute("UPDATE stories SET article = ?, revision = revision + 1 WHERE id = ?",
                            (json.dumps(article, ensure_ascii=False), ident))
        return digest(article)

    def current_digest(self, ident: str) -> str:
        _, _, article = self.record(ident)
        require(article is not None, "draft required")
        return digest(article)

    def decide(self, ident: str, action: str, supplied_digest: str, actor: str) -> None:
        require(action in {"approve", "reject"}, "invalid decision")
        require(actor == OWNER, "only the named owner can be recorded as approver")
        actual = self.current_digest(ident)
        require(supplied_digest == actual, "digest does not match current draft")
        _, ledger, _ = self.record(ident)
        require(ledger is not None, "ledger required")
        with self.db:
            revision = self.db.execute("SELECT revision FROM stories WHERE id = ?", (ident,)).fetchone()[0]
            self.db.execute("INSERT INTO decisions (story_id, action, content_sha256, ledger_sha256, actor, decided_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?)",
                            (ident, action, actual, digest(ledger), actor, timestamp(), revision))

    def export(self, ident: str, destination: Path) -> None:
        candidate, ledger, article = self.record(ident)
        require(ledger is not None and article is not None, "checked draft required")
        validate_article(article, candidate, ledger)
        current = digest(article)
        row = self.db.execute("SELECT action, content_sha256, ledger_sha256, actor, decided_at, revision FROM decisions WHERE story_id = ? ORDER BY seq DESC LIMIT 1",
                              (ident,)).fetchone()
        revision = self.db.execute("SELECT revision FROM stories WHERE id = ?", (ident,)).fetchone()[0]
        require(row is not None and row[0] == "approve" and row[1] == current
                and row[2] == digest(ledger) and row[3] == OWNER and row[5] == revision,
                "exact current draft needs latest owner approval")
        require(destination.suffix == ".json" and destination.name == f"{candidate['slug']}.json",
                "destination must be <slug>.json")
        require(not destination.exists(), "export destination already exists")
        destination.parent.mkdir(parents=True, exist_ok=True)
        bundle = {"schemaVersion": SCHEMA_VERSION, "approval": {
            "approvedBy": OWNER, "approvedAt": row[4], "contentSha256": current}, "article": article}
        # Exclusive creation avoids silently replacing a previously reviewed export.
        with destination.open("x", encoding="utf-8", newline="\n") as output:
            json.dump(bundle, output, ensure_ascii=False, sort_keys=True, indent=2)
            output.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path(__file__).with_name("editorial.sqlite3"))
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("candidate")
    create.add_argument("file", type=Path)
    for name in ("ledger", "draft"):
        command = commands.add_parser(name)
        command.add_argument("id")
        command.add_argument("file", type=Path)
    current = commands.add_parser("digest")
    current.add_argument("id")
    for name in ("approve", "reject"):
        command = commands.add_parser(name)
        command.add_argument("id")
        command.add_argument("--digest", required=True)
        command.add_argument("--actor", required=True)
    export = commands.add_parser("export")
    export.add_argument("id")
    export.add_argument("destination", type=Path)
    args = parser.parse_args()
    try:
        store = EditorialStore(args.db)
        if args.command == "candidate":
            store.candidate(object_file(args.file))
        elif args.command == "ledger":
            store.ledger(args.id, object_file(args.file))
        elif args.command == "draft":
            print(store.draft(args.id, object_file(args.file)))
        elif args.command == "digest":
            print(store.current_digest(args.id))
        elif args.command in {"approve", "reject"}:
            store.decide(args.id, args.command, args.digest, args.actor)
        elif args.command == "export":
            store.export(args.id, args.destination)
    except (EditorialError, OSError, json.JSONDecodeError, sqlite3.Error) as exc:
        parser.exit(2, f"Editorial error: {exc}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
