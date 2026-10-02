"""Persistent offline editorial stages with exact-review and budget boundaries.

No network provider is supplied. Only injected fake providers run in this slice.
SQLite is private state, not public export. Never copy it into the frontend.
"""
from __future__ import annotations

import copy
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from editorial import (EditorialError, OWNER, canonical, digest, plain_text, require,
                       validate_candidate, validate_ledger, validate_article)
from news_checks import validate_news_record, validate_skeptic


class DisabledProvider:
    fixture = False
    def generate(self, stage, data):
        raise EditorialError("Provider is disabled")


class Pipeline:
    def __init__(self, path: Path, *, provider=None, monthly_micro_usd=0,
                 stage_caps=None, clock=None):
        self.db = sqlite3.connect(path, check_same_thread=False, timeout=2)
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS packs (
              id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS audit (
              seq INTEGER PRIMARY KEY, pack_id TEXT NOT NULL, revision INTEGER NOT NULL,
              action TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, snapshot_sha256 TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts (
              pack_id TEXT NOT NULL, stage TEXT NOT NULL, revision INTEGER NOT NULL,
              month TEXT NOT NULL, reserved INTEGER NOT NULL, charged INTEGER,
              status TEXT NOT NULL, PRIMARY KEY(pack_id,stage,revision));
            CREATE TABLE IF NOT EXISTS snapshots (
              pack_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL,
              status TEXT NOT NULL, sha256 TEXT NOT NULL, PRIMARY KEY(pack_id,revision));
            CREATE TRIGGER IF NOT EXISTS snapshots_no_update BEFORE UPDATE ON snapshots
              BEGIN SELECT RAISE(ABORT,'snapshots are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS snapshots_no_delete BEFORE DELETE ON snapshots
              BEGIN SELECT RAISE(ABORT,'snapshots are immutable'); END;
        """)
        # An older DB contributes only its current version; absent historical
        # snapshots cannot be reconstructed and are never invented.
        with self.db:
            for ident, raw, revision, status in self.db.execute("SELECT id,data,revision,status FROM packs").fetchall():
                self.db.execute("INSERT OR IGNORE INTO snapshots VALUES(?,?,?,?,?)", (ident, revision, raw, status, digest(json.loads(raw))))
        self.provider = provider or DisabledProvider()
        # Production-provider implementations are deliberately not enabled here.
        require(isinstance(self.provider, DisabledProvider) or self.provider.fixture is True,
                "Only offline fixture providers are enabled")
        require(type(monthly_micro_usd) is int and 0 <= monthly_micro_usd <= 100_000_000,
                "invalid monthly budget")
        self.monthly = monthly_micro_usd
        self.caps = stage_caps or {}
        require(set(self.caps) <= {"extract", "draft", "images", "social", "skeptic", "repair"}, "invalid stage caps")
        require(all(type(v) is int and 0 < v <= 10_000_000 for v in self.caps.values()), "invalid stage caps")
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def get(self, ident):
        require(isinstance(ident, str) and len(ident) <= 100, "invalid ID")
        row = self.db.execute("SELECT data,revision,status FROM packs WHERE id=?", (ident,)).fetchone()
        require(row is not None, "pack not found")
        return {"id": ident, "revision": row[1], "status": row[2], "pack": json.loads(row[0])}

    def queue(self, after=''):
        require(isinstance(after,str) and (after=='' or re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',after)) and len(after)<=100,'invalid queue cursor')
        rows=self.db.execute('SELECT id,data,revision,status FROM packs WHERE id>? ORDER BY id LIMIT 26',(after,)).fetchall()
        items=[]
        for ident,raw,revision,status in rows[:25]:
            data=json.loads(raw)
            items.append({'id':ident,'revision':revision,'status':status,'fixture':data.get('fixture'),
                          'title':data.get('article',{}).get('title',data['candidate']['reason']),
                          'sourceUrl':data['candidate']['sourceUrl']})
        return {'items':items,'nextCursor':rows[24][0] if len(rows)>25 else None}

    def usage(self):
        month=self.clock().strftime('%Y-%m')
        rows=self.db.execute('SELECT stage,SUM(COALESCE(charged,reserved)),COUNT(*),SUM(status<>\'completed\') FROM attempts WHERE month=? GROUP BY stage',(month,)).fetchall()
        return {'month':month,'monthlyCapMicroUsd':self.monthly,
                'usedOrReservedMicroUsd':sum(row[1] for row in rows),
                'stages':[{'stage':stage,'usedOrReservedMicroUsd':spent,'attempts':count,'unreconciled':unresolved} for stage,spent,count,unresolved in rows]}

    def _write(self, ident, data, revision, status, action, actor, *, old_revision=None):
        payload = canonical(data).decode("utf-8")
        require(len(payload.encode("utf-8")) <= 1024 * 1024, "pack too large")
        if old_revision is None:
            self.db.execute("INSERT INTO packs VALUES(?,?,?,?)", (ident, payload, revision, status))
        else:
            result = self.db.execute("UPDATE packs SET data=?,revision=?,status=? WHERE id=? AND revision=?",
                                     (payload, revision, status, ident, old_revision))
            require(result.rowcount == 1, "revision conflict")
        self.db.execute("INSERT INTO audit(pack_id,revision,action,actor,at,snapshot_sha256) VALUES(?,?,?,?,?,?)",
                        (ident, revision, action, actor, self.clock().isoformat(), digest(data)))
        self.db.execute("INSERT INTO snapshots VALUES(?,?,?,?,?)", (ident, revision, payload, status, digest(data)))

    def snapshot(self, ident, revision):
        row = self.db.execute("SELECT data,status,sha256 FROM snapshots WHERE pack_id=? AND revision=?", (ident,revision)).fetchone()
        require(row is not None, "snapshot unavailable")
        data = json.loads(row[0])
        require(digest(data) == row[2], "snapshot integrity mismatch")
        return {"id": ident, "revision": revision, "status": row[1], "pack": data}

    def backup_to(self, destination: Path):
        require(destination.suffix == ".sqlite3" and not destination.exists() and not destination.is_symlink(), "new private .sqlite3 destination required")
        require(destination.parent.is_dir() and not destination.parent.is_symlink(), "trusted existing parent required")
        # Exclusive creation; never overwrite or remove an existing backup.
        with destination.open("xb"):
            pass
        backup = sqlite3.connect(destination)
        try:
            self.db.backup(backup)
            require(backup.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "backup integrity failure")
        finally:
            backup.close()

    @staticmethod
    def restore_to(source: Path, destination: Path):
        require(source.is_file() and not source.is_symlink() and source.suffix == ".sqlite3"
                and source.stat().st_size <= 256 * 1024 * 1024, "bounded private backup required")
        require(not destination.exists() and destination.suffix == ".sqlite3" and not destination.is_symlink()
                and destination.parent.is_dir() and not destination.parent.is_symlink(), "new private restore destination required")
        origin = sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)
        try:
            require(origin.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "backup invalid")
            require({"packs","snapshots","audit","attempts"} <= {x[0] for x in origin.execute("SELECT name FROM sqlite_master WHERE type='table'")}, "backup schema mismatch")
            with destination.open("xb"):
                pass
            restored = sqlite3.connect(destination)
            try:
                origin.backup(restored)
                require(restored.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "restore invalid")
                tables={x[0] for x in restored.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if "publication_control" in tables:
                    with restored:
                        restored.execute("UPDATE publication_control SET mode='pilot',killed=1,confirmation=NULL")
                        if "publication_intents" in tables:
                            restored.execute("UPDATE publication_intents SET status='vetoed' WHERE status='dry-run-ready'")
            finally:
                restored.close()
        finally:
            origin.close()

    def discover(self, body, actor):
        require({"candidate", "sourceText"} <= set(body) <= {"candidate", "sourceText", "newsRecord"}, "invalid discovery fields")
        candidate = validate_candidate(body["candidate"])
        require(len(candidate["id"]) <= 100 and len(candidate["slug"]) <= 100, "ID too long")
        source = plain_text(body["sourceText"], "sourceText")
        require(candidate["sourceExcerpt"] in source, "excerpt must occur in imported source")
        ident = candidate["id"]
        data = {"candidate": candidate, "sourceText": source, "sourceSha256": digest(source),
                "importedAt": self.clock().isoformat(), "fixture": False}
        if "newsRecord" in body: data["newsRecord"] = validate_news_record(body["newsRecord"],source,candidate['sourceUrl'])
        with self.db:
            existing = self.db.execute("SELECT data FROM packs WHERE id=?", (ident,)).fetchone()
            if existing:
                old = json.loads(existing[0])
                require(old["candidate"] == candidate and old["sourceSha256"] == digest(source)
                        and old.get("newsRecord")==data.get("newsRecord"), "discovery collision")
                return self.get(ident)
            require(self.db.execute("SELECT COUNT(*) FROM packs").fetchone()[0] < 1000, "local pack admission limit")
            # Same URL + imported content is the same event, even with a new ID.
            for (raw,) in self.db.execute("SELECT data FROM packs"):
                previous = json.loads(raw)
                if "newsRecord" in data and "newsRecord" in previous:
                    require(not (previous["newsRecord"]["eventId"]==data["newsRecord"]["eventId"]
                                 and previous["sourceSha256"]==data["sourceSha256"]),"duplicate event snapshot")
                elif "newsRecord" not in data and "newsRecord" not in previous:
                    require(not (previous["candidate"]["sourceUrl"] == candidate["sourceUrl"]
                                 and previous["sourceSha256"] == digest(source)), "duplicate legacy source snapshot; event metadata needed")
            self._write(ident, data, 1, "sourced", "discover", actor)
        return self.get(ident)

    def _generate(self, ident, stage, revision, data):
        cap = self.caps.get(stage, 0)
        require(cap > 0 and self.monthly > 0, "provider budget disabled")
        require(getattr(self.provider, "fixture", False) is True, "only offline providers allowed")
        month = self.clock().strftime("%Y-%m")
        # Reserve durably BEFORE provider; unknown outcome remains reserved and
        # duplicate requests at this revision cannot charge again.
        self.db.execute("BEGIN IMMEDIATE")
        try:
            used = self.db.execute("SELECT COALESCE(SUM(COALESCE(charged,reserved)),0) FROM attempts WHERE month=?", (month,)).fetchone()[0]
            require(used + cap <= self.monthly, "monthly budget exhausted")
            require(self.db.execute("SELECT 1 FROM attempts WHERE pack_id=? AND stage=? AND revision=?", (ident, stage, revision)).fetchone() is None,
                    "attempt exists; ambiguous/failed attempts require operator reconciliation")
            self.db.execute("INSERT INTO attempts VALUES(?,?,?,?,?,NULL,'reserved')", (ident, stage, revision, month, cap))
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise
        try:
            result, cost = self.provider.generate(stage, copy.deepcopy(data))
            require(type(cost) is int and 0 <= cost <= cap, "provider exceeded reserved budget")
            require(len(canonical(result)) <= 1024 * 1024, "provider result too large")
        except Exception:
            with self.db:
                self.db.execute("UPDATE attempts SET status='ambiguous' WHERE pack_id=? AND stage=? AND revision=?", (ident, stage, revision))
            raise EditorialError("Provider attempt failed; reservation retained")
        # Validation and state transition are done before marking completion.
        return result, cost

    def transition(self, ident, action, body, actor):
        fields = {
            "extract": set(), "facts-review": {"snapshotSha256", "accepted", "notes"},
            "draft": set(), "edit": {"article"}, "images": set(),
            "visual-review": {"snapshotSha256", "imageId", "rightsAccepted", "notes"},
            "social": set(), "approve": {"snapshotSha256"}, "reject": {"snapshotSha256", "notes"},
            "export": {"snapshotSha256"},
            "revise-source": {"candidate", "sourceText"}, "revise-ledger": {"ledger"},
            "skeptic": set(), "repair": set(),
        }
        require(action in fields, "invalid action")
        required={"expectedRevision"}|fields[action]
        require(required <= set(body) <= required|({"newsRecord"} if action=="revise-source" else set()), "invalid action fields")
        require(type(body["expectedRevision"]) is int, "revision must be integer")
        current = self.get(ident)
        revision, status, data = current["revision"], current["status"], current["pack"]
        require(body["expectedRevision"] == revision, "stale revision")
        if action in {"facts-review", "visual-review", "approve", "reject", "export"}:
            require(body["snapshotSha256"] == digest(data), "review snapshot mismatch")
        cost = None
        if action == "revise-source":
            previous_news=data.get("newsRecord")
            candidate = validate_candidate(body["candidate"])
            require(candidate["id"] == ident and candidate["slug"] == data["candidate"]["slug"], "stable identity required")
            source = plain_text(body["sourceText"], "sourceText")
            require(candidate["sourceExcerpt"] in source, "excerpt must occur in source")
            data = {"candidate": candidate, "sourceText": source, "sourceSha256": digest(source),
                    "importedAt": self.clock().isoformat(), "fixture": False}
            if previous_news is not None:
                require("newsRecord" in body,"news source update requires explicit date/event metadata")
            if "newsRecord" in body:
                news=validate_news_record(body["newsRecord"],source,candidate['sourceUrl'])
                require(previous_news is None or news["eventId"]==previous_news["eventId"],"existing event identity cannot change")
                data["newsRecord"]=news
            status = "sourced"
        elif action == "revise-ledger":
            data["ledger"] = validate_ledger(body["ledger"], data["candidate"])
            for key in ("factReview", "article", "textReview", "skeptic", "repairCycles", "exception", "images", "visualReview", "social", "approval", "rejection"):
                data.pop(key, None)
            status = "facts_pending"
        elif action == "extract":
            require(status == "sourced", "source required")
            result, cost = self._generate(ident, action, revision, data)
            data["ledger"] = validate_ledger(result, data["candidate"])
            data["fixture"] = True
            status = "facts_pending"
        elif action == "facts-review":
            require(status == "facts_pending", "facts review not ready")
            require(type(body["accepted"]) is bool, "accepted must be boolean")
            data["factReview"] = {"actor": actor, "notes": plain_text(body["notes"], "notes"),
                                  "sourceSha256": data["sourceSha256"], "ledgerSha256": digest(data["ledger"]),
                                  "accepted": body["accepted"]}
            status = "evidence_checked" if body["accepted"] else "rejected"
        elif action == "draft":
            require(status == "evidence_checked", "human semantic fact review required before text")
            review = data["factReview"]
            require(review["accepted"] is True and review["sourceSha256"] == data["sourceSha256"]
                    and review["ledgerSha256"] == digest(data["ledger"]), "evidence changed")
            result, cost = self._generate(ident, action, revision, data)
            data["article"] = validate_article(result, data["candidate"], data["ledger"])
            status = "drafted"
        elif action == "skeptic":
            require(status=="drafted", "draft required for skeptic")
            try:
                result,generated_cost=self._generate(ident,action,revision,data)
                data["skeptic"]=validate_skeptic(result,data)
                cost=generated_cost
                data["skeptic"]["reviewedArticleSha256"]=digest(data["article"])
                if result["verdict"]=="pass":
                    status="edited" if data.get('textReview',{}).get('articleSha256')==digest(data['article']) else "skeptic_passed"
                elif result["verdict"]=="human" or data.get("repairCycles",0)>=1: status="quarantined"
                else: status="repair_pending"
            except (EditorialError,TypeError,KeyError):
                status="quarantined"
                data["exception"]={"stage":"skeptic","reason":"Invalid, ambiguous or budget-blocked checker; human review required"}
        elif action == "repair":
            require(status=="repair_pending" and data.get("repairCycles",0)==0,"one repair cycle only")
            data["repairCycles"]=1
            try:
                result,generated_cost=self._generate(ident,action,revision,data)
                data["article"]=validate_article(result,data["candidate"],data["ledger"])
                cost=generated_cost
                data.pop("skeptic",None)
                status="drafted"
            except (EditorialError,TypeError,KeyError):
                status="quarantined"
                data["exception"]={"stage":"repair","reason":"Invalid, ambiguous or budget-blocked repair; human review required"}
        elif action == "edit":
            require("article" in data, "draft required")
            data["article"] = validate_article(body["article"], data["candidate"], data["ledger"])
            for key in ("images", "visualReview", "social", "approval"):
                data.pop(key, None)
            data['textReview']={'subject':actor,'articleSha256':digest(data['article'])}
            if data.get('skeptic',{}).get('verdict')=='pass' and data['skeptic'].get('reviewedArticleSha256')==digest(data['article']):
                status = "edited"
            else:
                data.pop('skeptic',None)
                status = "drafted"
        elif action == "images":
            require(status == "edited", "owner text edit/review required")
            require(data.get('skeptic',{}).get('verdict')=='pass' and data['skeptic'].get('reviewedArticleSha256')==digest(data['article']),"current skeptic pass required")
            result, cost = self._generate(ident, action, revision, data)
            require(isinstance(result, list) and 2 <= len(result) <= 3, "2..3 image candidates required")
            seen = set()
            for image in result:
                require(isinstance(image, dict) and set(image) == {"id", "sha256", "rights", "alt", "provider", "model", "prompt", "seed", "fixture"}, "invalid image candidate")
                require(image["fixture"] is True, "real generated media not enabled")
                for key in ("id", "rights", "alt", "provider", "model", "prompt", "seed"):
                    plain_text(image[key], key)
                require(image["id"] not in seen, "duplicate image ID")
                seen.add(image["id"])
                require(isinstance(image["sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", image["sha256"]), "invalid media digest")
            data["images"] = result
            status = "visual_pending"
        elif action == "visual-review":
            require(status == "visual_pending", "visual review not ready")
            require(body["rightsAccepted"] is True, "rights must be accepted explicitly")
            require(body["imageId"] in {x["id"] for x in data["images"]}, "unknown image")
            data["visualReview"] = {"actor": actor, "imageId": body["imageId"],
                                    "imagesSha256": digest(data["images"]), "notes": plain_text(body["notes"], "notes")}
            status = "visual_approved"
        elif action == "social":
            require(status == "visual_approved", "visual selection required")
            result, cost = self._generate(ident, action, revision, data)
            require(isinstance(result, dict) and set(result) == {"linkedin"}, "invalid social package")
            plain_text(result["linkedin"], "linkedin")
            require(data["article"]["canonicalUrl"] in result["linkedin"], "social needs exact canonical URL")
            data["social"] = result
            status = "social_ready"
        elif action == "approve":
            require(status == "social_ready", "complete pack required")
            data["approval"] = {"subject": actor, "revision": revision + 1,
                                "reviewedSnapshotSha256": digest(data), "approvedAt": self.clock().isoformat()}
            status = "approved"
        elif action == "reject":
            require(status != "exported", "exported pack cannot be edited here")
            data.pop("approval", None)
            data["rejection"] = {"actor": actor, "notes": plain_text(body["notes"], "notes")}
            status = "rejected"
        elif action == "export":
            require(status == "approved", "current approval required")
            # Fixture packs never become publishable, even with a test owner.
            require(data["fixture"] is False, "fixture output cannot be exported for publication")
            raise EditorialError("Production export/signing adapter is disabled")
        if cost is not None:
            # A manually imported ledger can skip extraction, but any generated
            # downstream fixture still makes the entire pack nonpublishable.
            data["fixture"] = True
        with self.db:
            self._write(ident, data, revision + 1, status, action, actor, old_revision=revision)
            if cost is not None:
                self.db.execute("UPDATE attempts SET charged=?,status='completed' WHERE pack_id=? AND stage=? AND revision=?", (cost, ident, action, revision))
        return self.get(ident)
