<!--
  Governed by governance.md. CI parses the fields below — keep the headings intact.
  A PR that leaves a required section blank fails the gate rather than warning.
-->

## Summary

_What changed and why, in a few sentences._

## Governance

<!-- §3, §4: every change cites the clause it serves. Add ADR-NNNN when departing from one. -->

**Governance-Ref:** §

**ADR:** _none, or ADR-NNNN_

**Stories:** _S1, S2, …_

## TDD evidence (§6)

<!--
  CI audits commit history for a test-touching commit at or before each implementation
  commit. List the red → green pairs so a reviewer can spot-check without reading the log.
-->

| Red commit | Green commit | Covers |
|---|---|---|
| `abc1234` | `def5678` | _behaviour_ |

## Findings (§5)

<!-- Every finding this PR closes must carry a Closes-Test signature in FINDINGS.md. -->

- [ ] No findings are opened or closed by this PR
- [ ] `FINDINGS.md` updated, and every closed finding has a `Closes-Test` signature

## Contract parity (§2)

- [ ] No change to the receipt contract
- [ ] TypeScript interfaces and C# DTOs changed together, and `schema-diff` passes
- [ ] Contract deliberately diverges — ADR cited above

## Checks

- [ ] Tests contain meaningful assertions — no zero-assertion or mock-only passes (§7)
- [ ] Dependencies are exact-pinned; no `^` or `~` introduced (§10)
- [ ] No receipt image or extracted payload is written to disk, cache, blob, or database (§1)
- [ ] Error responses remain uniform and uninformative on the failure path (§1)
- [ ] Public endpoints, hooks, and test classes carry `[GovernanceRef]` / equivalent (§4)
