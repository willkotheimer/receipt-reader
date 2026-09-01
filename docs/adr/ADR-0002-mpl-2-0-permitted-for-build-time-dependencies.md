# ADR-0002: MPL-2.0 permitted for build-time-only dependencies

- **Status:** Accepted
- **Date:** 2026-09-01
- **Governance-Ref:** §10
- **Supersedes:** none

## Context

`governance.md` §10 requires that "mechanical license scanners fail builds on unapproved
open-source licenses." `docs/allowed-licenses.json` implements that as a permissive
allowlist, and states that approving a copyleft or source-available license is an
architectural decision requiring an ADR.

The first run of the gate against the real dependency tree flagged:

```
lightningcss@1.33.0              MPL-2.0
lightningcss-win32-x64-msvc@1.33.0  MPL-2.0
```

MPL-2.0 is weak, file-level copyleft, so the allowlist rule applies and a decision is owed.

The dependency path is unambiguous:

```
receipt-reader-governance
└─┬ vitest@4.1.11
  └─┬ vite@8.2.2
    └── lightningcss@1.33.0
```

`npm ls --omit=dev` reports an empty production tree. `lightningcss` is Vite's CSS
transformer, invoked at build time. No part of it is linked into, bundled with, or
distributed as part of the application.

## Decision

MPL-2.0 is approved **for build-time-only dependencies**, and remains unapproved for
anything that ships. The distinction is enforced mechanically rather than by convention:
`scripts/gov/check-licenses.mjs` runs two scans.

| Scan | Dependencies | Allowlist applied |
|---|---|---|
| Production | `production: true` | `allowed` only |
| Full | production + development | `allowed` + `allowedBuildTime` |

`MPL-2.0` is listed under `allowedBuildTime`, never under `allowed`. Adding it to a
project's runtime dependencies therefore fails the production scan even though the full
scan passes.

## Departure from governance

| Clause | Governed default | What we do instead |
|---|---|---|
| §10 | Unapproved licenses fail the build | MPL-2.0 passes, but only for dependencies absent from the production tree |

## Consequences

**Accepted risk.** MPL-2.0 obliges us to publish modifications to MPL-licensed *files* if we
distribute them. We neither modify nor distribute `lightningcss`, so the obligation is not
triggered. The risk is that a future change moves an MPL package into the runtime tree.

**Compensating control.** The two-tier scan is exactly that control: the production scan
applies the strict list, so an MPL package entering runtime dependencies fails the build
without anyone having to notice. This is why the approval is split across two lists rather
than recorded as a comment beside a single entry.

**Revisit when.** Vite stops depending on `lightningcss`, or the project acquires production
npm dependencies — at which point the production scan starts doing real work and should be
reviewed rather than assumed.

## Verification

`npm run gov:licenses` performs both scans and exits non-zero if either fails.
`scripts/gov/__tests__/check-licenses.test.mjs` covers the allowlist evaluation itself,
including that an SPDX `AND` expression is tainted by any unapproved component — the case
that governs `(MIT AND CC-BY-3.0)` and would govern a future dual-licensed MPL package.
