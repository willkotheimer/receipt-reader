# ADR-0000: <Short decision title>

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN
- **Date:** YYYY-MM-DD
- **Governance-Ref:** §N
- **Supersedes:** _(ADR id, or none)_

## Context

What forced this decision? State the constraint that made the governed default
unworkable — a platform limitation, a cost ceiling, a security trade-off. Cite the
specific clause of `governance.md` being departed from and quote the sentence.

## Decision

What we are doing instead, stated in one paragraph. Be concrete enough that a reader
can verify the codebase matches it.

## Departure from governance

| Clause | Governed default | What we do instead |
|---|---|---|
| §N | … | … |

If this ADR records no departure and is purely a design record, say so explicitly and
delete this table.

## Consequences

**Accepted risk.** What is now possible that the clause was written to prevent, and
what the blast radius is.

**Compensating control.** What we put in place instead. A departure with no
compensating control needs an explicit statement that none exists and why that is
acceptable.

**Revisit when.** The condition that would let us return to the governed default —
a SKU upgrade, a platform feature shipping, a threshold being crossed.

## Verification

How a reviewer confirms this ADR is honored in code. Name the test, the analyzer
rule, or the CI job. An ADR whose compliance cannot be checked mechanically must say
who checks it manually and when.
