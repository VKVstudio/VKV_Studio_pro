# Approved editorial exports

Place only backend contract v2 `<slug>.json` exports here after the owner has approved the exact draft. No current preview article is approved by this directory's existence. Do not copy a draft or SQLite file here.

The public content gate revalidates every export and its content digest. It also requires a separate `frontend-nuxt/publication-approval.json` containing `approvedBy: "Valerii Karpov"` and `contentSha256`, the canonical SHA-256 of the sorted exported articles. The gate prints this release digest when that approval is missing. The owner must approve that exact release before anyone records the approval file. Export approval and release approval are local records, not authentication or deployment permission.

Default generation stages an empty approved collection and uses the eight local review articles. Public generation stages only approved exports; those records contain no private claim ledger or database. No remote backend request occurs.
