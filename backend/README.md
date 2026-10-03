# Private editorial CLI (local first slice)

The manual CLI uses the Python standard library and stores candidate sources, a claim ledger, article drafts and an append-only decision history in a local SQLite file. It makes no network requests and starts no server. It does not deploy or publish anything.

Run it with an explicit Python interpreter, for example:

```powershell
$py = 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $py .\editorial.py candidate .\candidate.json
& $py .\editorial.py ledger story-one .\ledger.json
& $py .\editorial.py draft story-one .\draft.json
& $py .\editorial.py digest story-one
& $py .\editorial.py approve story-one --digest '<printed SHA-256>' --actor 'Valerii Karpov'
& $py .\editorial.py export story-one .\out\story-one.json
```

`reject` takes the same digest and actor arguments. Every draft/ledger revision invalidates old approval, including restoring old text. Replacing the ledger removes the draft, forcing a new review. The latest decision must approve the current revision. Export refuses to overwrite an existing file.

The export is a JSON object with `schemaVersion: 2`, `approval` (`approvedBy`, `approvedAt`, `contentSha256`) and `article`. `contentSha256` is SHA-256 over the article encoded as UTF-8 JSON with sorted keys, compact separators and no ASCII escaping. The article includes the present Nuxt `Article` fields (including optional `eventLabel`), plus `author`, `facts`, `interpretation`, `practicalDecision`, and `evidenceStatus` (`source`, `ours`, `estimate`, `unknown`). `eventDate` must be present, either as an ISO date or `null`. Sources and CTA URLs must use HTTPS; CTA must point to `vkvstudio.com`. Text is plain text, without raw HTML. Private JSON inputs and SQLite files are ignored by Git in this directory.

The CLI is intentionally manual. The `--actor` flag records an owner decision but cannot prove the human's identity; it must remain on a trusted local machine. Treat the SQLite database as private and back it up. Place an export in `frontend-nuxt/content/approved/<slug>.json` only after actual owner approval. The Nuxt public gate additionally requires an Ed25519-signed release manifest and separately provisioned operator trust store. It binds the collection and actual public media bytes, not merely image paths. No genuine trust keys or signatures have been provisioned. An export alone never authorizes publication or deployment.

## Private API and staged offline flow

`private_api.py` exposes a WSGI callable and starts no server. Default `DenyAll` authenticates nobody. The `IdentityVerifier` adapter must verify an actual token and return a server-side `Principal`; no `actor`, `role`, forwarded header, n8n/model response or JSON owner name is accepted as identity. Issuer, audience, expiry, exact owner/worker subjects are independently pinned. Cookies are rejected, bearer requests require HTTPS, cross-origin requests are denied, bodies are bounded before parse, and duplicate JSON keys/nonfinite numbers are rejected. This is **not completed production authentication**. Body-read deadlines, TLS and global admission must be enforced by the eventual reviewed gateway/server; no listener was started here.

`pipeline.py` stores packs, revision history hashes and reserved provider attempts in private SQLite, separately from the older manual CLI schema. Stages are sourced → facts_pending → human evidence_checked → drafted → owner edited → visual_pending → owner visual_approved → social_ready → owner approved. Revisions to sources/ledger invalidate downstream checks; editing a draft drops images/social/approval. Stale revisions and wrong review snapshot hashes fail. Only injected offline `FakeProvider` runs; real provider mode and production export are denied. Fixture packs cannot become publishable even when a fixture owner approves them. The API does not give clients a file destination, signing key, arbitrary model, host or executable command.

Budget amounts are integer micro-USD, not historical provider prices. Reservation is committed before the fake provider runs. Ambiguous or invalid results retain the reservation and cannot retry automatically at that revision. The actual paid-provider billing/reconciliation adapter and production signing/export remain disabled. Full immutable revision snapshots are implemented; an older database contributes only its current revision, never invented historical content.

`private-config.example.json` contains only disabled/nonsecret defaults. `configuration.assemble` accepts explicit trusted configuration and never discovers credentials or reads environment files. Model IDs are optional configuration metadata; none are chosen or invoked. The default budget is zero. Network collector is always disabled, including its real default transport; source import is manual/offline while bounded DNS/egress protection is unfinished.

`workflows/editorial-offline.json` is an inactive n8n import artifact. It allows only worker actions, uses a fixed `.invalid` private endpoint, has no credential values/reference, no schedule, no automatic retries, no real provider or publish/send nodes. Actual credentials/base URL/runtime must be deliberately configured after approval. Each operation stops at the relevant human boundary; owner decisions use the separate API, not n8n. `build-offline-workflow.mjs` deterministically creates the JSON; `emulate-code.mjs` tests checked-in Code snippets without n8n or HTTP. Passing emulation is not a successful n8n import or live workflow.

Offline regression suite (existing Python/Node, no install/listener/network):

```powershell
& $py -B -m unittest discover -s backend -p "test_*.py" -v
```

The owner has authorized the isolated backend/n8n deployment. The private identity integration remains pending: `identity.PinnedJWTVerifier` verifies bounded RS256 JWTs against explicitly supplied fresh trusted public keys, issuer/audience/time/subject pins and revoked subjects. Roles come from server configuration, never token role/email/actor fields. It does not fetch JWKS or discover credentials; stale/unknown keys deny access. No real keys, subjects or tokens were provisioned. Cloudflare Access requires a separately reviewed gateway/browser integration and key refresh: this bearer-only API rejects cookies and does not trust a forwarded header. The default configuration still uses DenyAll. Deployment authorization does not turn an unconfigured private API into an authenticated live service.

## Pilot now; bounded automatic news later

The owner's latest direction allows preparing future automatic `.pro` news publication after a human-review pilot. Human approval is the **current default**, not a permanent product rule. `publication_policy.py` supports pilot and explicit offline bounded-auto simulation; production activation always fails, and there is no publisher. Scope excludes email/social sending. Missing policy/evidence/media/quality/legal/safety receipts, source-date label evidence, current skeptic pass, frequency/spend controls or any ambiguity quarantines a pack. Receipts are trusted server-validator outputs, never model/client flags. Veto/kill and idempotent intents are audited; rollback produces a plan requiring new review, never a deployment.

`news_checks.py` keeps publication/update/discovery dates and publisher/product/announcement event identities distinct, checks qualitative benefits against source quotes and separates hypotheses. Decimal arithmetic checks verify supplied calculations, not their premises. These mechanical controls are not semantic truth checks. `skeptic` requires structured claim-level source-grounded pass/revise/human; one `repair` then one recheck is allowed, further revise/human quarantines. Writer/checker IDs remain configurable/unselected. `workflows/skeptic-offline.json` is a separate inactive stage, no actual n8n runtime has been used.

Each new pack revision now creates a full immutable SQLite snapshot with source text and dates. SQL triggers prohibit snapshot update/deletion; this does not resist a malicious filesystem administrator. `backup_to` and `restore_to` create exclusive private `.sqlite3` destinations, never overwrite, integrity-check the DB and preserve attempts/audit/history. Restoration resets publication mode to pilot+kill and vetoes ready intents. Only synthetic fixture backups have been exercised; infrastructure retention/encryption/offsite restore is pending.

`ui/index.html` displays sources, claims, dates, separate skeptic coverage, editable draft, candidate provenance, visual selection and social copy, and prepares exact-revision requests. Normal use sends no mutations and stores no credentials. Only an explicit synthetic `.invalid` origin plus `?fixtureTransport=1` enables the test transport, which requires a fixture-marked response. `integration-smoke.cjs` fulfils those requests through the real WSGI API via `fixture_bridge.py --offline-fixture-only` on stdin, using only in-memory synthetic principals/providers; no socket is opened. It exercises facts → draft → skeptic → text review → images → visual review → social draft → approval and export denial. This is a functional offline test, not authenticated deployment or real media acceptance. The normal smoke checks 320/390/1440 without listener or GPU.

Future transition criteria, suggested observational period and outstanding gates: `.system/review/pro-bounded-news-publication-plan-2026-10-01.md`. Real statistics are unknown; no benchmark result grants production reliability or activation permission.

## Current offline controls and dependencies

The CLI/pipeline/feed parsers use the standard library. Cryptographic identity/reviewer signatures use existing cryptography 50.0.1; media validation uses existing Pillow 12.3.0. `requirements-offline.txt` records the exact tested runtime versions; no tools or packages were installed. Real deployment packaging and vulnerability review remain separate.

`configuration.assemble(..., validators=...)` injects a trusted server-side validator, never client/model flags. It assembles publication policy with pilot+kill and zero caps. Owner-only API views provide paged metadata (25 per page), immutable historical snapshots and integer micro-USD usage; the owner can kill pending intents. The API exposes no production activation, simulate-mode or publish route. Ready intent replay rechecks current revision, kill switch, gate freshness, media and costs; it can be quarantined.

`LocalValidators` binds signed semantic/rights/safety reviews to the complete snapshot, and media validation decodes the same bounded bytes whose hash is checked, enforces actual format, single frame, 8192 side/16,777,216 pixel caps and 1200×627 OG. A valid image or signature is not a claim that an illustration is factually accurate or its rights are accepted in production.

Skeptic pass requires all ledger IDs and a bound coverage row for every visible free-text field and paragraph, including title/dek/category/eventLabel/source and CTA labels. Unknown verdicts, changed/uncovered spans or own-test/ROI exception triggers do not pass. Source-assertion news URLs must match the captured primary snapshot; secondary support needs a separate snapshot-bundle implementation. Coverage/classification is still a reviewer declaration, not semantic entailment or completeness established by code. The evidence gate therefore requires an independent signed review of the full pack; model confidence/regex cannot replace it.

`discovery.PublisherIndex` parses bounded manually imported HTML/RSS/Atom, blocks DTD/entities, confines URLs to exact trusted HTTPS origin/path prefixes, deduplicates leads and never treats feed update dates as source publication evidence. Its registry lists eleven publisher candidates, including Meta/Apple/DeepSeek/Qwen. Those candidates are not approved integrations: exact paths, source licences, scheduling, egress and actual fetch/discovery must be accepted and tested before network use. The collector remains disabled before DNS.
