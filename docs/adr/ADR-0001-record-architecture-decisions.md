# ADR-0001: Record architecture decisions as ADRs

- **Status:** Accepted
- **Date:** 2026-09-01
- **Governance-Ref:** §3
- **Supersedes:** none

## Context

`governance.md` §3 (Departure Protocol) states:

> Any architectural deviation from this governance document (such as adding temporary
> blob logging or changing error response structures) requires an ADR entry in
> `/docs/adr/`.

Enforcement is mechanical: a `commit-msg` hook parses commit messages for
`Governance-Ref:` tags and blocks the commit when a cited ADR has no matching markdown
file. That hook needs a directory, a filename convention, and a numbering scheme to
resolve against. This ADR establishes them, and serves as the worked example the hook
is first tested against.

## Decision

Architecture decisions live in `docs/adr/` as one markdown file per decision, named
`ADR-NNNN-kebab-case-title.md` with `NNNN` zero-padded and allocated sequentially.
`ADR-0000-template.md` is the template and is never a real decision — tooling skips it.

Commits and PR bodies cite decisions as `Governance-Ref: §N` for a clause, and
additionally `ADR-NNNN` when the change departs from that clause. An ADR is immutable
once Accepted: corrections are made by writing a superseding ADR and setting the
original's status to `Superseded by ADR-NNNN`, never by editing the original's decision.

## Departure from governance

None. This ADR implements §3 rather than departing from it.

## Consequences

**Accepted risk.** Sequential numbering collides when two branches allocate the same
number concurrently. With a single maintainer this is unlikely; the fix is to renumber
the later-merged ADR before merge, since nothing links to an unmerged ADR yet.

**Compensating control.** The `commit-msg` hook (§3, delivered in S3) fails closed —
an unresolvable `ADR-NNNN` reference blocks the commit rather than warning.

**Revisit when.** More than one person is committing regularly, at which point a
date-based or ULID scheme removes the collision entirely.

## Verification

`scripts/gov/check-governance-ref.mjs` resolves every `ADR-NNNN` token in a commit
message against `docs/adr/ADR-NNNN-*.md` and exits non-zero when the file is absent.
Its Vitest suite covers: a valid reference, a dangling reference, a commit with no tag
on a governed path, and the template being correctly excluded from resolution.
