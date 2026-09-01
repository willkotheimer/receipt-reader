# The Receipt Reader — Implementation Backlog

> Derived from `governance.md` v1.0.1. Every story carries a `Governance-Ref` that must
> appear in its commit messages (§3). Stories marked **TDD** require a separate failing-test
> commit before the implementing commit (§6).

## Locked Decisions

| Decision | Value | Rationale |
|---|---|---|
| Project name | `receipt-reader` | Public-facing clarity over the "hodl" pun |
| Hosting | Single Linux App Service, **B1** | API serves the Vite bundle from `wwwroot`; one origin, no CORS |
| Cost | **$13.14/mo** plan + $0 AI + $0 telemetry | Retail API, centralus, 730h |
| Doc Intelligence | `FormRecognizer` **F0**, one `dev` env | 500 pages/mo free; unclaimed on this subscription |
| Region | `centralus` | Matches existing estate |
| Identity | **User-assigned** MI (`id-rcpt-dev`) | No circular dep on `principalId` at RBAC time; matches `id-fdc` convention |
| Auth to AI | AAD only, `disableLocalAuth: true` | Keyless; no secret ever enters app settings |
| CI | GitHub Actions + **OIDC** via user-assigned MI | Federated credential on a UAMI — no app registration, no secret |
| Custom domain | **Deferred**, module written but gated | `customDomain == ''` deploys no DNS resources |
| Enforcement | **Full mechanical** | Real analyzers/gates, per §2 Enforcement Matrix |

Verified against the live subscription (`861d741b-…`):

- `DOTNETCORE:10.0` is available on App Service Linux.
- `FormRecognizer` F0 + S0 both offered in `centralus`, and no FormRecognizer account exists —
  the one-per-subscription free tier is unclaimed.
- Role `Cognitive Services User` = `a97b65f3-24c7-4388-baec-2e87135dc908`.
- Providers: `Microsoft.Web`, `CognitiveServices`, `OperationalInsights`, `Insights`,
  `ManagedIdentity`, `Resources`, `Authorization` all **Registered**.
  `Microsoft.Network` was **NotRegistered** — registered manually as an S5 prerequisite.
  `Microsoft.App` / `ContainerRegistry` NotRegistered but irrelevant under App Service.
- Account is **Owner** on the subscription and **Global Administrator** in the tenant
  (despite being an `#EXT#` guest), so RBAC assignment and identity creation are unblocked.
- Subscription is **Pay-As-You-Go**, spending limit **off** — no quota request needed for B1.
- `Microsoft.ManagedIdentity` exposes `userAssignedIdentities/federatedIdentityCredentials`,
  so GitHub OIDC needs **no app registration** (see S6).

---

## Phase 0 — Foundation

### S1 — Repo & solution bootstrap
**Gov-Ref:** §3, §6, §10

- `git init`, `main` branch, combined .NET + Node `.gitignore`
- Rename working folder to `receipt-reader` *(manual: close the IDE first — it holds a lock)*
- `governance.md` → title "The Receipt Reader", bump to v1.0.1
- Layout: `src/ReceiptReader.Api`, `src/receipt-reader.web`, `tests/ReceiptReader.Api.Tests`,
  `tests/e2e`, `infra`, `docs/adr`, `scripts/gov`
- Toolchain pins: `global.json` → SDK `10.0.300`, `.nvmrc` → `22.22.3`, `.npmrc` → `save-exact=true`
- `FINDINGS.md`, `docs/adr/ADR-0000-template.md`, `docs/adr/ADR-0001-record-architecture-decisions.md`
- `.github/pull_request_template.md` with `Governance-Ref:` and findings-closure sections

**AC:** `dotnet --version` resolves 10.0.300 inside the repo; solution builds empty; ADR template present.

### S2 — Provenance gate (§10) — **TDD**
**Gov-Ref:** §10

- `scripts/gov/check-pins.mjs` — non-zero exit on any `^`, `~`, `*`, `latest`, or range spec
  in `package.json`, or any floating `<PackageReference Version>` in `.csproj`
- `docs/allowed-licenses.json`; wire `license-checker` + `dotnet-project-licenses`
- Husky `pre-commit` hook

**AC:** RED — fixture with `^1.0.0` exits non-zero *before* the implementation commit.

### S3 — Departure Protocol gate (§3) — **TDD**
**Gov-Ref:** §3

- `scripts/gov/check-governance-ref.mjs` — parse commit message for `Governance-Ref:`;
  if an ADR is cited, assert `docs/adr/ADR-NNNN-*.md` exists on disk
- Husky `commit-msg` hook

**AC:** Untagged commit on a governed path fails; valid ADR passes. Vitest covers the parser.

---

## Phase 1 — Infrastructure (Bicep)

### S4 — Core Bicep infrastructure
**Gov-Ref:** §8, §9 · **Depends:** S1

`infra/main.bicep`, `targetScope = 'subscription'`, creates `rg-receipt-reader-dev`:

| Module | Resource | Key settings |
|---|---|---|
| `monitoring.bicep` | `log-rcpt-dev`, `appi-rcpt-dev` | Workspace-based App Insights |
| `identity.bicep` | `id-rcpt-dev` | User-assigned MI |
| `ai.bicep` | `cog-rcpt-dev-<token>` | kind `FormRecognizer`, sku `F0`, `customSubDomainName`, `disableLocalAuth: true` |
| `rbac.bicep` | role assignment | `Cognitive Services User` on the AI account → MI |
| `app.bicep` | `plan-rcpt-dev` (B1 Linux), `app-rcpt-dev-<token>` | `DOTNETCORE\|10.0`, `httpsOnly`, TLS 1.2 min, FTPS disabled, `alwaysOn` |

- `infra/main.dev.bicepparam`
- **No keys anywhere** — app settings carry only the endpoint URI and the MI client id

**AC:** `az deployment sub what-if` clean; deploy succeeds; `az webapp show` reports the
user-assigned identity; app settings contain zero secrets.

**Risk to verify at deploy:** the F0 + `disableLocalAuth` + `customSubDomainName` combination.
If F0 rejects `disableLocalAuth`, that is an ADR-worthy departure.

### S5 — Egress hardening (§8)
**Gov-Ref:** §8 · **Depends:** S4

- `vnet-rcpt-dev` + delegated `snet-app`, regional VNet integration, `vnetRouteAllEnabled: true`
- NSG denying outbound except the `CognitiveServicesManagement` / `AzureMonitor` service tags
- In-process `AllowlistHttpMessageHandler` as defense in depth

**AC:** Integration test proves the handler blocks a non-allowlisted host; the deployed app
still reaches Document Intelligence.

**Known limitation:** F0 supports neither private endpoints nor network ACLs, so the AI
account stays publicly reachable — egress control is app-side only. Record as an ADR.

### S6 — Deployment pipeline & OIDC
**Gov-Ref:** §8 · **Depends:** S4

**No app registration and no service principal.** `Microsoft.ManagedIdentity` supports
`userAssignedIdentities/federatedIdentityCredentials`, so the GitHub trust is a user-assigned
managed identity declared in Bicep. `azure/login@v2` accepts a UAMI client id directly. That
removes the client secret, the rotation burden, and the one piece of config that would
otherwise live outside source control.

**`infra/bootstrap.azcli` — run once, locally, by an Owner.** CI cannot create the identity
that CI authenticates as, so this single script breaks the chicken-and-egg:

1. `az provider register --namespace Microsoft.Network`
2. Create `rg-receipt-reader-dev`
3. Create `id-rcpt-deploy` (user-assigned MI)
4. Add its federated credential for `repo:<owner>/receipt-reader:ref:refs/heads/main`
   (plus a `pull_request` subject for the `what-if` gate)
5. Grant it **Owner** *or* **Contributor + User Access Administrator**, scoped to the RG only

Step 5 is not optional: `main.bicep` creates a role assignment (Cognitive Services User → the
app identity), and **Contributor alone cannot create role assignments**. Contributor-only is
the failure that surfaces late, at deploy, as an authorization error.

Then the pipeline:

- `.github/workflows/deploy.yml`: OIDC login → `bicep build` → `what-if` gate → deploy →
  `dotnet publish` → zip deploy
- Repo *variables* (not secrets — none are sensitive under OIDC):
  `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- `infra/README.md` documenting the one-time bootstrap

**AC:** After the single bootstrap run, a branch push deploys end to end. The repo contains no
secret of any kind, and no further manual Azure step is ever required.

---

## Phase 2 — API (ASP.NET Core)

### S7 — API skeleton + test harness — **TDD**
**Gov-Ref:** §4, §6, §9 · **Depends:** S1

- Minimal API; `GovernanceRefAttribute`; `GET /api/health`
- xUnit + Moq + `Microsoft.AspNetCore.Mvc.Testing` (`WebApplicationFactory`) + Coverlet

**AC:** Separate RED commit in history; `[GovernanceRef("SECTION-9")]` on the endpoint.

### S8 — Receipt contract DTOs (§2) — **TDD**
**Gov-Ref:** §2 · **Depends:** S7

- `ReceiptDto` { `MerchantName`, `TransactionDate`, `Total`, `Tax`, `Items[]` } + `ReceiptItemDto`,
  in strict 1:1 parity with `prebuilt-receipt`
- Serialization tests assert exact JSON shape (camelCase, ISO-8601 dates)

### S9 — In-memory analysis endpoint — **TDD**
**Gov-Ref:** §1, §2 · **Depends:** S8

- `POST /api/receipts/analyze`, multipart, streamed straight into `DocumentIntelligenceClient`
  with `DefaultAzureCredential` bound to the user-assigned client id
- **Zero persistence:** `OpenReadStream()` passed through; no temp file, no buffering to disk;
  request size capped
- Moq'd analysis client; test snapshots the temp directory before/after to prove no write

**AC:** RED first; the no-persistence assertion is explicit, not implied.

### S10 — Fail-closed error handling — **TDD**
**Gov-Ref:** §1, §4 · **Depends:** S9

Uniform `400 {"error":"Unable to process document."}` for **every** failure mode:
non-receipt, confidence below threshold, oversized payload, wrong content type, upstream error.
No stack traces, no upstream detail, `ProblemDetails` suppressed.

**AC:** A parameterized xUnit theory over all five modes asserts a byte-identical body and status.

---

## Phase 3 — Client (React)

### S11 — Vite + React scaffold
**Gov-Ref:** §9, §10 · **Depends:** S2

Vite, React, Reactstrap, TanStack Query v5, Vitest + jsdom + coverage — all exact-pinned.

**AC:** `npm test` runs; the dependency tree passes S2's pin gate.

### S12 — Client types + localStorage store — **TDD**
**Gov-Ref:** §1, §2 · **Depends:** S11, S8

- `src/types/receipt.ts` mirroring the C# DTOs 1:1
- `useReceiptStore` — localStorage only, quota-safe, schema-versioned
- Vitest over formatters (currency/date) and the store hook

**AC:** RED first; the store makes no network call, ever.

### S13 — Upload + table UI — **TDD**
**Gov-Ref:** §1, §9 · **Depends:** S12, S10

`useAnalyzeReceipt` (`useMutation`), Reactstrap results table, fail-closed error surfaced
as the generic string with no extra detail.

### S14 — Schema diff gate (§2) — **TDD**
**Gov-Ref:** §2 · **Depends:** S12

`scripts/gov/schema-diff.mjs` parses `receipt.ts` and `ReceiptDto.cs` and asserts field-level
1:1 parity, with an ADR-tag escape hatch.

**AC:** Mutating either side alone fails the build; fixtures cover both directions.

---

## Phase 4 — Remaining mechanical gates

### S15 — Traceability analyzers (§4) — **TDD**
**Gov-Ref:** §4 · **Depends:** S7, S11

- ESLint rule `governance/require-governance-ref` for exported hooks and route modules
- Roslyn analyzer `GOV001` for public endpoints and test classes missing `[GovernanceRef]`

**AC:** Analyzer unit tests; the build fails on an untagged endpoint.

### S16 — TDD history audit (§6) — **TDD**
**Gov-Ref:** §6 · **Depends:** S1

`scripts/gov/tdd-audit.mjs` walks the branch's commit range and asserts a test-touching
commit exists at or before each implementation commit.

**AC:** Pass/fail fixture repositories in tests; wired as a CI job.

### S17 — AI safeguards (§7) — **TDD**
**Gov-Ref:** §7 · **Depends:** S7, S11

- Zero-assertion detector: Vitest AST scan (no `expect`), Roslyn scan (no `Assert.`/`Verify`)
- Unhandled-async-mock detection; branch-coverage thresholds on both stacks

**AC:** CI fails on a deliberately zero-assertion fixture test.

### S18 — Findings register (§5)
**Gov-Ref:** §5 · **Depends:** S1

`FINDINGS.md` schema + `scripts/gov/check-findings.mjs`, asserting every open finding carries
a closing test signature (`Closes-Test: Namespace.Class.Method`).

**AC:** An open finding without a signature blocks the merge.

---

## Phase 5 — Ship

### S19 — SPA hosting integration
**Gov-Ref:** §9 · **Depends:** S13, S10

Vite build → API `wwwroot`, SPA fallback routing, single origin (no CORS), CSP + security headers.

### S20 — Playwright E2E (§9)
**Gov-Ref:** §9 · **Depends:** S19

Happy path, fail-closed path, localStorage persistence across reload.
Video + screenshot on failure, traces uploaded as CI artifacts.

### S21 — CI assembly + custom-domain module
**Gov-Ref:** §2, §5, §6, §7, §10 · **Depends:** all

- `ci.yml` composing every gate in order; `e2e.yml` for Playwright
- `infra/modules/dns.bicep` — parameterized and inert while `customDomain == ''`,
  ready for `receipt-reader.willkai.<tld>` (zone lives in its own RG so a project
  teardown can never destroy sibling subdomains)

**AC:** Full pipeline green on a PR; `what-if` shows no DNS resources while the param is empty.

---

## Dependency Graph

```
S1 ──┬── S2 ── S11 ──┬── S12 ── S13 ──┐
     │               │      │         │
     ├── S3          │      └── S14   ├── S19 ── S20 ──┐
     │               │                │                │
     ├── S4 ──┬── S5 │                │                ├── S21
     │        └── S6 │                │                │
     │               │                │                │
     └── S7 ── S8 ── S9 ── S10 ───────┘                │
          │    │                                       │
          └────┴── S15, S16, S17, S18 ─────────────────┘
```

**Critical path:** S1 → S7 → S8 → S9 → S10 → S19 → S20 → S21.
Infrastructure (S4–S6) is parallelizable against the API track from S1 onward.
