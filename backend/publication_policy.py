"""Future bounded .pro NEWS release planning. No deploy, email or social sender.

Modes are pilot (default) and bounded-auto. Real activation is disabled; only
an explicit offline simulation API may exercise auto. Gate receipts come from
trusted server-side validators, never API JSON or an LLM boolean/confidence.
"""
from dataclasses import dataclass
import json
from editorial import digest, require
from news_checks import validate_news_record, validate_skeptic


GATES = frozenset({"policy", "evidence", "media", "quality", "legal", "safety"})


@dataclass(frozen=True)
class GateReceipt:
    gate: str
    snapshot_sha256: str
    passed: bool
    issued_at: int
    validator: str


class DenyGates:
    def evaluate(self, snapshot):
        return ()


class PublicationPolicy:
    def __init__(self, pipeline, *, gates=None, daily_cap=0, weekly_cap=0,
                 spend_cap_micro_usd=0, now=None):
        self.pipeline, self.db = pipeline, pipeline.db
        self.gates = gates or DenyGates()
        self.now = now or (lambda: int(pipeline.clock().timestamp()))
        require(type(daily_cap) is int and 0 <= daily_cap <= 2 and type(weekly_cap) is int and 0 <= weekly_cap <= 7,
                "invalid news frequency cap")
        require(type(spend_cap_micro_usd) is int and 0 <= spend_cap_micro_usd <= 10_000_000, "invalid release spending cap")
        self.daily, self.weekly, self.spend = daily_cap, weekly_cap, spend_cap_micro_usd
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS publication_control (
            singleton INTEGER PRIMARY KEY CHECK(singleton=1), mode TEXT NOT NULL,
            killed INTEGER NOT NULL, confirmation TEXT);
          INSERT OR IGNORE INTO publication_control VALUES(1,'pilot',1,NULL);
          CREATE TABLE IF NOT EXISTS publication_events (
            seq INTEGER PRIMARY KEY, action TEXT NOT NULL, subject TEXT NOT NULL, at INTEGER NOT NULL, details TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS publication_intents (
            idempotency_key TEXT PRIMARY KEY, pack_id TEXT NOT NULL, revision INTEGER NOT NULL,
            snapshot_sha256 TEXT NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL,
            reasons TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'pro-news');
        """)

    def control(self):
        mode, killed, confirmation = self.db.execute("SELECT mode,killed,confirmation FROM publication_control WHERE singleton=1").fetchone()
        return {"mode": mode, "killed": bool(killed), "confirmation": confirmation, "productionActivationAvailable": False}

    def activate_production(self, *args, **kwargs):
        raise ValueError("Production autopublish activation unavailable: owner pilot acceptance and reviewed publisher required")

    def simulate_mode(self, mode, owner_subject, confirmation):
        require(mode in {"pilot", "bounded-auto"} and bool(owner_subject)
                and confirmation == "OFFLINE SIMULATION ONLY", "explicit offline simulation required")
        with self.db:
            self.db.execute("UPDATE publication_control SET mode=?,killed=0,confirmation=? WHERE singleton=1", (mode,confirmation))
            self.db.execute("INSERT INTO publication_events(action,subject,at,details) VALUES('simulation-mode',?,?,?)", (owner_subject,self.now(),mode))

    def kill(self, subject):
        with self.db:
            self.db.execute("UPDATE publication_control SET killed=1 WHERE singleton=1")
            self.db.execute("UPDATE publication_intents SET status='vetoed' WHERE status='dry-run-ready'")
            self.db.execute("INSERT INTO publication_events(action,subject,at,details) VALUES('kill',?,?,'all pending news intents vetoed')", (subject,self.now()))

    def veto(self, ident, subject):
        with self.db:
            self.db.execute("UPDATE publication_intents SET status='vetoed' WHERE pack_id=?", (ident,))
            self.db.execute("INSERT INTO publication_events(action,subject,at,details) VALUES('veto',?,?,?)", (subject,self.now(),ident))

    def evaluate(self, ident, revision, subject, *, scope="pro-news"):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            result=self._evaluate(ident,revision,subject,scope=scope)
            self.db.commit()
            return result
        except BaseException:
            self.db.rollback()
            raise

    def _evaluate(self, ident, revision, subject, *, scope="pro-news"):
        snapshot = self.pipeline.snapshot(ident, revision)
        fingerprint = digest(snapshot)
        key = digest({"scope":scope,"snapshot":fingerprint})
        existing = self.db.execute("SELECT status,reasons FROM publication_intents WHERE idempotency_key=?", (key,)).fetchone()
        if existing and existing[0] != "dry-run-ready":
            return {"key":key,"status":existing[0],"reasons":json.loads(existing[1]),"published":False}
        # An idempotent ready intent is still a revocable decision: revalidate
        # revision, kill switch, receipt age and spend before returning it.
        control, reasons, now = self.control(), [], self.now()
        if scope != "pro-news": reasons.append("scope-denied-email-social-not-authorized")
        if control["killed"]: reasons.append("kill-switch")
        if snapshot["revision"] != self.pipeline.get(ident)["revision"]: reasons.append("stale-revision")
        data = snapshot["pack"]
        if not data.get("article"): reasons.append("article-missing")
        if data.get("fixture") is not False: reasons.append("fixture-output")
        if control["mode"] == "pilot":
            if snapshot["status"] != "approved": reasons.append("pilot-human-approval-required")
        else:
            try:
                news=validate_news_record(data.get("newsRecord"),data["sourceText"],data['candidate']['sourceUrl'])
                if news["publishedAt"] is None: reasons.append("source-publication-date-unknown")
                if "dateEvidence" not in news: reasons.append("source-date-label-evidence-missing")
                if news["changeKind"]=="unknown": reasons.append("meaningful-update-classification-unknown")
            except (ValueError,KeyError,TypeError): reasons.append("news-record-invalid-or-missing")
            if (data.get("skeptic",{}).get("verdict")!="pass" or
                    data.get("skeptic",{}).get("reviewedArticleSha256")!=digest(data.get("article"))):
                reasons.append("skeptic-pass-current-article-required")
            else:
                try: validate_skeptic({key:value for key,value in data['skeptic'].items() if key!='reviewedArticleSha256'},data)
                except (ValueError,KeyError,TypeError):reasons.append('skeptic-article-coverage-invalid')
            # Server validator adapters must establish classification, source
            # entailment, media bytes/rights and quality. Missing/ambiguous = queue.
            try: receipts = self.gates.evaluate(snapshot)
            except Exception:
                receipts=()
                reasons.append("validator-error")
            passed = set()
            seen=set()
            for receipt in receipts:
                if not isinstance(receipt,GateReceipt) or receipt.gate in seen:
                    reasons.append("invalid-or-duplicate-gate-receipt")
                    continue
                seen.add(receipt.gate)
                if (isinstance(receipt, GateReceipt) and receipt.gate in GATES
                        and receipt.snapshot_sha256 == fingerprint and receipt.passed is True
                        and type(receipt.issued_at) is int and 0 <= now-receipt.issued_at <= 86400
                        and receipt.validator):
                    passed.add(receipt.gate)
            reasons += ["gate-"+gate for gate in sorted(GATES-passed)]
        if not self.daily or not self.weekly: reasons.append("frequency-disabled")
        used_day = self.db.execute("SELECT COUNT(*) FROM publication_intents WHERE status='dry-run-ready' AND at>=? AND idempotency_key<>?", (now-86400,key)).fetchone()[0]
        used_week = self.db.execute("SELECT COUNT(*) FROM publication_intents WHERE status='dry-run-ready' AND at>=? AND idempotency_key<>?", (now-7*86400,key)).fetchone()[0]
        if self.daily and used_day >= self.daily: reasons.append("daily-cap")
        if self.weekly and used_week >= self.weekly: reasons.append("weekly-cap")
        rows = self.db.execute("SELECT reserved,charged,status FROM attempts WHERE pack_id=?", (ident,)).fetchall()
        if any(status != 'completed' for _,_,status in rows): reasons.append("unreconciled-provider-attempt")
        spent = sum(charged if charged is not None else reserved for reserved,charged,_ in rows)
        if not self.spend or spent > self.spend: reasons.append("spending-disabled-or-cap")
        status = "quarantined" if reasons else "dry-run-ready"
        # Intent only: no publisher, API request, signing or public file write.
        if existing:
            self.db.execute("UPDATE publication_intents SET status=?,reasons=? WHERE idempotency_key=?",
                            (status,json.dumps(reasons),key))
        else:
            self.db.execute("INSERT INTO publication_intents(idempotency_key,pack_id,revision,snapshot_sha256,at,status,reasons,scope) VALUES(?,?,?,?,?,?,?,?)",
                            (key,ident,revision,fingerprint,now,status,json.dumps(reasons),scope))
        self.db.execute("INSERT INTO publication_events(action,subject,at,details) VALUES('evaluate',?,?,?)", (subject,now,key))
        return {"key":key,"status":status,"reasons":reasons,"published":False}

    def rollback_plan(self, ident, target_revision, subject, reason):
        snapshot = self.pipeline.snapshot(ident,target_revision)
        require(isinstance(reason,str) and 1 <= len(reason) <= 2000, "correction reason required")
        self.veto(ident,subject)
        with self.db:
            self.db.execute("INSERT INTO publication_events(action,subject,at,details) VALUES('rollback-plan',?,?,?)",
                            (subject,self.now(),json.dumps({"id":ident,"revision":target_revision,"sha256":digest(snapshot),"reason":reason})))
        return {"target":snapshot,"published":False,"requiresNewReview":True}
