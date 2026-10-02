# Article export contract v2

`article-export.mjs` is the executable strict build-boundary schema. The backend validates the same required fields before saving a draft and exporting it. v1 exports are deliberately rejected for publication because they omit language, publication date, canonical route and media rights. A changed v1 draft must receive a fresh owner decision after these fields are added; existing approvals are never upgraded automatically.

Envelope: exactly `schemaVersion: 2`, `approval` and `article`. Approval records the owner, a UTC decision timestamp and SHA-256 over recursively key-sorted compact UTF-8 article JSON. No ASCII escaping is used. Extra fields and private ledgers are rejected. Article text is plain text, source URLs use HTTPS without credentials/fragments, CTA points to an English VKVstudio.com service route, and previewImage points to a regular file beneath frontend public/images.

Required article fields are listed in the executable schema. `eventDate` is required and may be null; `eventLabel` is the only optional field. `language` is en, `author` is Valerii Karpov, and `canonicalUrl` matches the slug route. `publishedAt` is an explicit owner-reviewed publication date; checkedAt remains the verification date. Media rights must match the reviewed private ledger before backend export.

Trust boundary: checks verify shape and integrity, not human identity. A person with write access to the trusted local repository can fabricate local approval records. This workflow must remain local and manual; it is not an authenticated editorial API.

Verification plan: exercise invalid fields, HTML, mutated digest, duplicate/mismatched slug, image containment and exact release approval; run backend tests, frontend typecheck and default build. Scan newly generated source with SecureCoder if its local extension is running; otherwise report scanner availability explicitly and perform a manual security review.
