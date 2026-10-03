# Approved editorial exports

This directory contains eight owner-approved backend contract v2 `<slug>.json` exports. Do not place drafts, fixtures, private claim ledgers or SQLite files here. The reader revalidates every export and its content digest.

The public gate also verifies `frontend-nuxt/publication-approval.json` against the separately configured public keys in `publication-trust.json`. The signed manifest binds the exact collection and all shipped public visual bytes. Version 1 requires the owner's signature. Version 2 identifies a delegated release operator separately and limits that delegation to one manifest digest and release revision. An operator signature records the authorized snapshot; it does not claim possession of the owner's private key and grants no backend role. Private signing keys are never committed or shipped.

Default generation stages an empty approved collection and uses the eight local review articles. Public generation stages only approved exports; those records contain no private claim ledger or database. No remote backend request occurs.
