# The Receipt Reader — Implementation Backlog

> Derived from `governance.md` v1.0.1. **21 stories delivered across 8 pull requests.**
> Every story keeps its full deliverables and acceptance criteria — the granularity lives at
> the *commit* level, not the PR level.

## Why stories group into PRs

§6 audits **commit history**, not pull requests:

> Every feature branch must contain a commit where test files (Vitest or xUnit) were modified
> or added prior to or separately from the passing implementation code commit.

So a PR may carry several stories as long as each contributes its own red → green commit pair.
Grouping loses no governance coverage, and it actively helps §6 by putting more verifiable
red→green pairs on each branch. Every PR body lists its pairs in the template's TDD table.

**Commit convention:** `S<N>: <subject>` with a trailing `Governance-Ref:` line. Red commits
are prefixed `S<N> (red):` so the §6 audit and a human reader agree on what happened.

## Locked decisions

| Decision | Value | Rationale |
|---|---|---|
| Project name | `receipt-reader` | Public-facing clarity over the "hodl" pun |
| Hosting | Single Linux App Service, **B1** | API serves the Vite bundle from `wwwroot`; one origin, no CORS |
| Cost | **$13.14/mo** plan + $0 AI + $0 telemetry | Retail API, centralus, 730h |
| Doc Intelligence | `FormRecognizer` **F0**, one `dev` env | 500 pages/mo free; unclaimed on this subscription |
| Region | `centralus` | Matches existing estate |
| Identity | **User-assigned** MI (`id-rcpt-dev`) | No circular dep on `principalId` at RBAC time; matches `id-fdc` convention |
| Auth to AI | AAD only, `disableLocalAuth: true` | Keyless; no secret ever enters app settings |
| CI | GitHub Actions + **OIDC via user-assigned MI** | Federated credential on a UAMI — no app registration, no secret |
| Custom domain | **Deferred**, module written but gated | `customDomain == ''` deploys no DNS resources |
| Enforcement | **Full mechanical** | Real analyzers/gates, per the §2 Enforcement Matrix |
| Solution format | `ReceiptReader.slnx` | .NET 10 default; needs VS 2022 17.13+ |

## Verified against the live subscription (`861d741b-…`)

- `DOTNETCORE:10.0` is available on App Service Linux.
- `FormRecognizer` F0 + S0 both offered in `centralus`, and no FormRecognizer account exists —
  the one-per-subscription free tier is unclaimed.
- Role `Cognitive Services User` = `a97b65f3-24c7-4388-baec-2e87135dc908`.
- **All required providers Registered**, including `Microsoft.Network` (registered 2026-09-01,
  took ~60s). `Microsoft.App` / `ContainerRegistry` remain NotRegistered but are irrelevant
  under the App Service choice.
- Account is **Owner** on the subscription and **Global Administrator** in the tenant despite
  being an `#EXT#` guest — RBAC assignment and identity creation are unblocked.
- Subscription is **Pay-As-You-Go**, spending limit **off** — no quota request needed for B1.
- `Microsoft.ManagedIdentity` exposes `userAssignedIdentities/federatedIdentityCredentials`,
  so GitHub OIDC needs **no app registration**.

---

# PR 1 — Foundation ✅ merged

**Stories:** S1 · **Gov-Ref:** §3, §6, §10 · **Commit:** `e84023e`

- `git init` on `main`; combined .NET + Node `.gitignore`
- `.gitattributes` normalising to LF — the §2/§5/§10 parsers read files line by line, and a
  stray CRLF must never decide whether a gate passes *(added beyond the original story scope)*
- `ReceiptReader.slnx`; layout for `src/`, `tests/`, `infra/`, `docs/adr/`, `scripts/gov/`
- Toolchain pins: `global.json` SDK 10.0.300 `rollForward=disable`, `.nvmrc` 22.22.3,
  `.npmrc` `save-exact=true`
- `docs/adr/ADR-0000-template.md` and `ADR-0001` establishing the convention the §3 hook resolves against
- `FINDINGS.md` with the §5 schema including the `Closes-Test` field
- `.github/pull_request_template.md` carrying the §2/§4/§5/§6/§7/§10 checks
- `governance.md` retitled, bumped to v1.0.1

**Verified:** SDK resolves 10.0.300 in-repo · solution builds 0 errors · ADR template present.

**Outstanding manual step:** rename the working folder to `receipt-reader` (close the IDE first).

---

# PR 2 — Governance gate toolkit

**Stories:** S2, S3, S18 · **Gov-Ref:** §3, §5, §10 · **Depends:** PR1

All three are `scripts/gov/*.mjs` + a husky hook + a Vitest suite. Split apart, the same Node
test harness gets stood up three times. A root `package.json` holds the tooling devDependencies,
separate from the client's own in `src/receipt-reader.web`.

### S2 — Provenance gate — **TDD**
- `check-pins.mjs` exits non-zero on any `^`, `~`, `*`, `latest`, or range spec in
  `package.json`, and on any floating `<PackageReference Version>` in a `.csproj`
- `docs/allowed-licenses.json`; wire `license-checker` and `dotnet-project-licenses`
- Husky `pre-commit` hook

**AC:** Red first — a fixture containing `^1.0.0` fails the check in a commit preceding the implementation.

### S3 — Departure Protocol gate — **TDD**
- `check-governance-ref.mjs` parses the commit message for `Governance-Ref:`; when an ADR is
  cited, asserts `docs/adr/ADR-NNNN-*.md` exists, skipping `ADR-0000-template.md`
- Husky `commit-msg` hook

**AC:** Untagged commit on a governed path fails; a commit citing a real ADR passes. Vitest covers
the parser: valid reference, dangling reference, missing tag, template correctly excluded.

### S18 — Findings register
- `check-findings.mjs` asserting every non-Open finding carries a well-formed `Closes-Test`
  signature, and that `Won't Fix` carries an `ADR` reference

**AC:** An open finding without a signature blocks the merge.

---

# PR 3 — Infrastructure

**Stories:** S4, S5, S6 · **Gov-Ref:** §8, §9 · **Depends:** PR1

One deployable topology — infra reviews better as a single `what-if` than three partial ones.

### S4 — Core Bicep
`infra/main.bicep`, `targetScope = 'subscription'`, creating `rg-receipt-reader-dev`:

| Module | Resource | Key settings |
|---|---|---|
| `monitoring.bicep` | `log-rcpt-dev`, `appi-rcpt-dev` | Workspace-based App Insights |
| `identity.bicep` | `id-rcpt-dev` | User-assigned MI |
| `ai.bicep` | `cog-rcpt-dev-<token>` | kind `FormRecognizer`, sku `F0`, `customSubDomainName`, `disableLocalAuth: true` |
| `rbac.bicep` | role assignment | `Cognitive Services User` on the AI account → MI |
| `app.bicep` | `plan-rcpt-dev` (B1 Linux), `app-rcpt-dev-<token>` | `DOTNETCORE\|10.0`, `httpsOnly`, TLS 1.2 min, FTPS disabled, `alwaysOn` |

Plus `infra/main.dev.bicepparam`. App settings carry only the endpoint URI and MI client id.

**AC:** `az deployment sub what-if` clean; deploy succeeds; `az webapp show` reports the
user-assigned identity; app settings contain zero secrets.

**Risk to verify at deploy:** the F0 + `disableLocalAuth` + `customSubDomainName` combination.
If F0 rejects keyless auth, that is an ADR-worthy departure, not a silent downgrade to S0.

### S5 — Egress hardening
- `vnet-rcpt-dev` + delegated `snet-app`, regional VNet integration, `vnetRouteAllEnabled: true`
- NSG denying outbound except the `CognitiveServicesManagement` / `AzureMonitor` service tags
- In-process `AllowlistHttpMessageHandler` as defense in depth

**AC:** Integration test proves the handler blocks a non-allowlisted host; the deployed app still
reaches Document Intelligence.

**Known limitation:** F0 supports neither private endpoints nor network ACLs, so the AI account
stays publicly reachable — egress control is app-side only. Record as an ADR.

### S6 — Deploy pipeline & OIDC
**No app registration, no service principal.** The GitHub trust is a user-assigned managed
identity with a federated credential, declared in Bicep; `azure/login@v2` takes a UAMI client id
directly.

`infra/bootstrap.azcli` — run **once**, locally, by an Owner, because CI cannot create the
identity CI authenticates as:

1. Create `rg-receipt-reader-dev`
2. Create `id-rcpt-deploy` (user-assigned MI)
3. Add its federated credentials for `repo:<owner>/receipt-reader:ref:refs/heads/main` and a
   `pull_request` subject for the what-if gate
4. Grant it **Owner**, or Contributor + User Access Administrator, scoped to the RG only

Step 4 is not optional: `main.bicep` creates a role assignment, and **Contributor alone cannot
create role assignments** — Contributor-only looks correct until the first deploy fails with an
authorization error.

Then `.github/workflows/deploy.yml`: OIDC login → `bicep build` → `what-if` gate → deploy →
`dotnet publish` → zip deploy. Repo **variables** (not secrets — none are sensitive under OIDC):
`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.

**AC:** After the single bootstrap run, a branch push deploys end to end. The repo holds no secret
of any kind, and no further manual Azure step is ever required.

---

# PR 4 — API foundation

**Stories:** S7, S8 · **Gov-Ref:** §2, §4, §6, §9 · **Depends:** PR1

### S7 — Skeleton & test harness — **TDD**
- Minimal API; the `GovernanceRefAttribute` that §4 hangs on; `GET /api/health`
- xUnit + Moq + `WebApplicationFactory` + Coverlet

**AC:** A separate red commit is visible in history; `[GovernanceRef("SECTION-9")]` on the endpoint.

### S8 — Receipt contract DTOs — **TDD**
- `ReceiptDto` { `MerchantName`, `TransactionDate`, `Total`, `Tax`, `Items[]` } + `ReceiptItemDto`,
  in strict 1:1 parity with the `prebuilt-receipt` contract
- Serialization tests asserting exact JSON shape — camelCase keys, ISO-8601 dates

**AC:** Red first; the shape is asserted exactly, since S14's differ treats this as source of truth.

---

# PR 5 — Receipt analysis endpoint

**Stories:** S9, S10 · **Gov-Ref:** §1, §2, §4 · **Depends:** PR4

> **These were wrongly split in the first draft of this plan.** Merging S9 alone would put an
> endpoint on `main` that leaks upstream error detail — a live §1 violation in the intermediate
> state. An endpoint is not done until its failure path is right.

### S9 — In-memory analysis — **TDD**
- `POST /api/receipts/analyze` streams the upload straight into `DocumentIntelligenceClient`
  under `DefaultAzureCredential`, bound to the user-assigned client id
- **Zero persistence:** `OpenReadStream()` passed through, no temp file, no disk buffering,
  request size capped
- Moq'd analysis client; the test snapshots the temp directory before and after to prove nothing
  was written

**AC:** Red first, and the no-persistence claim is asserted explicitly rather than inferred from
the absence of file-writing code.

### S10 — Fail-closed error handling — **TDD**
- Uniform `400 {"error":"Unable to process document."}` for every failure mode: non-receipt,
  sub-threshold confidence, oversized payload, wrong content type, upstream error
- No stack traces, no upstream detail, `ProblemDetails` suppressed — a caller must not be able
  to distinguish the causes

**AC:** A parameterized xUnit theory over all five modes asserts a byte-identical body and status.
Identical is the requirement; "similar" defeats the clause.

---

# PR 6 — Client

**Stories:** S11, S12, S13 · **Gov-Ref:** §1, §2, §9, §10 · **Depends:** PR2 (pin gate), PR5 (contract + error shape)

### S11 — Vite & React scaffold
Vite, React, Reactstrap, TanStack Query v5, Vitest + jsdom + coverage — every dependency
exact-pinned from the start, because retrofitting pins across a lockfile is far worse.

**AC:** `npm test` runs; the dependency tree passes S2's pin gate unmodified.

### S12 — Client types & localStorage store — **TDD**
- `src/types/receipt.ts` mirroring the C# DTOs field for field
- `useReceiptStore` — localStorage only, quota-safe, schema-versioned so a shape change cannot
  corrupt a returning visitor's data
- Vitest over the formatters and the store hook

**AC:** Red first; the store makes no network call under any code path.

### S13 — Upload & results table — **TDD**
- `useAnalyzeReceipt` as a `useMutation`; Reactstrap results table
- The fail-closed error surfaced as the generic string and nothing more — the UI must not add
  detail the API deliberately withheld

---

# PR 7 — Contract & test-quality analyzers

**Stories:** S14, S15, S16, S17 · **Gov-Ref:** §2, §4, §6, §7 · **Depends:** PR4, PR6

S15 and S17 both build the same Roslyn analyzer project; splitting them means standing it up
twice. **If this PR gets heavy, split into 7a (the `.mjs` scripts: S14, S16) and 7b (the
analyzers: S15, S17)** — decide while building, not now.

### S14 — Schema diff gate — **TDD**
`schema-diff.mjs` parses `receipt.ts` and `ReceiptDto.cs` and asserts field-level parity, with an
ADR-tag escape hatch for deliberate divergence.

**AC:** Mutating either side alone fails the build; fixtures cover both directions.

### S15 — Traceability analyzers — **TDD**
- ESLint rule `governance/require-governance-ref` for exported hooks and route modules
- Roslyn analyzer `GOV001` for public endpoints and test classes missing `[GovernanceRef]`

**AC:** Analyzers have their own unit tests; the build fails on a deliberately untagged endpoint.

### S16 — TDD history audit — **TDD**
`tdd-audit.mjs` walks the branch's commit range and asserts a test-touching commit exists at or
before each implementation commit.

**AC:** Pass *and* fail fixture repositories, so the audit is proven to reject as well as accept.

### S17 — AI safeguards — **TDD**
- Zero-assertion detector: AST scan for Vitest tests without `expect`; Roslyn scan for xUnit
  tests without `Assert.` or `Verify`
- Unhandled async-mock detection; branch-coverage thresholds on both stacks

**AC:** CI fails on a deliberately zero-assertion fixture test — the clause is about catching
hollow tests, so the gate must be shown catching one.

---

# PR 8 — Ship

**Stories:** S19, S20, S21 · **Gov-Ref:** §2, §5, §6, §7, §9, §10 · **Depends:** all

### S19 — SPA hosting integration
Vite build output into the API's `wwwroot`, SPA fallback routing, single origin so no CORS,
plus CSP and security headers.

### S20 — Playwright E2E
Happy path, fail-closed path, and localStorage persistence across a reload. Video and screenshot
on failure, traces uploaded as CI artifacts.

### S21 — CI assembly & custom-domain module
- `ci.yml` composing every gate in order; `e2e.yml` for Playwright
- `infra/modules/dns.bicep` — parameterized and inert while `customDomain == ''`, ready for
  `receipt-reader.willkai.<tld>`. The zone lives in its own resource group, so tearing down this
  project can never destroy sibling subdomains.

**AC:** Full pipeline green on a PR; `what-if` shows no DNS resources while the param stays empty.

---

## Sequencing

```
PR1 ✅ ──┬── PR2 ──────────────┐
         │                     │
         ├── PR3 (infra)       ├── PR6 ──┬── PR7 ──┐
         │                     │         │         │
         └── PR4 ── PR5 ───────┴─────────┘         ├── PR8
                                                   │
                              (PR3 rejoins here) ──┘
```

**Critical path:** PR1 → PR4 → PR5 → PR6 → PR8. PR3 (infrastructure) runs parallel to the entire
API and client track and only needs to land before PR8's deployed smoke test. PR2 gates commits
from the moment it merges, so earlier is better.

**Recommended order:** PR2 → PR3 → PR4 → PR5 → PR6 → PR7 → PR8.
Landing PR2 second means every subsequent commit is gated by the hooks it installs.
