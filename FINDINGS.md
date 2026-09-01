# Findings Register

Governed by `governance.md` §5. Security or quality defects found in code review or by
automated scans are logged here. **A finding may not be closed until a test exists that
would fail if the defect were reintroduced** — that test's fully-qualified signature goes
in the `Closes-Test` field, and `scripts/gov/check-findings.mjs` blocks the merge until
every non-Open finding has one.

## Schema

Each finding is a level-3 heading followed by a fixed field block. The checker parses
these fields, so keep the key names exact.

```
### F-NNNN — <short title>

- **Status:** Open | Fixed | Won't Fix | Accepted Risk
- **Severity:** Critical | High | Medium | Low
- **Governance-Ref:** §N
- **Found:** YYYY-MM-DD by <reviewer, scanner, or story id>
- **Closes-Test:** <fully-qualified test signature, or `n/a` while Open>
- **ADR:** <ADR-NNNN when the resolution is to accept a departure, else none>

**Defect.** What is wrong, and the concrete conditions under which it bites.

**Resolution.** What changed, or why the risk is accepted.
```

### Field rules

- **`Closes-Test`** takes a real, runnable signature —
  `ReceiptReader.Api.Tests.AnalyzeEndpointTests.RejectsOversizedPayload` for xUnit, or
  `tests/store.test.ts > useReceiptStore > evicts on quota exhaustion` for Vitest.
  The checker verifies the string is non-empty and well-formed; the reviewer verifies it
  actually exercises the defect.
- **`Accepted Risk`** still requires a `Closes-Test` — the test asserts the *current,
  accepted* behaviour, so that silently drifting away from it fails the build.
- **`Won't Fix`** is the only status permitted to carry `Closes-Test: n/a`, and it
  requires an `ADR` reference explaining why.

## Open findings

_None yet._

## Closed findings

_None yet._
