# Infrastructure

Azure Bicep for The Receipt Reader. Subscription-scoped, so the resource group is declared
rather than assumed and the whole environment is reproducible from nothing.

**Governance-Ref:** §1, §8, §9

## What gets deployed

| Resource | Name | Notes |
|---|---|---|
| Resource group | `rg-receipt-reader-dev` | Everything lands here |
| Log Analytics | `log-rcpt-dev` | Local auth disabled |
| Application Insights | `appi-rcpt-dev` | Workspace-based |
| Managed identity | `id-rcpt-dev` | User-assigned; the app runs as this |
| Virtual network | `vnet-rcpt-dev` | Delegated `snet-app` for VNet integration |
| Network security group | `nsg-snet-app` | Egress allowlist, deny-all at 4096 |
| Document Intelligence | `cog-rcpt-dev-<token>` | `FormRecognizer` F0, **keyless** |
| App Service plan | `plan-rcpt-dev` | B1 Linux |
| Web app | `app-rcpt-dev-<token>` | `DOTNETCORE|10.0`, HTTPS-only |
| Basic-auth policies | `scm`, `ftp` | Both `allow: false` |

Twelve resources; eleven appear in `what-if` (see *Verification* below).

## Cost

| Item | SKU | Monthly |
|---|---|---|
| App Service plan | B1 Linux | **$13.14** |
| Document Intelligence | F0 | $0.00 |
| Log Analytics + App Insights | PAYG | $0.00 (5 GB/mo grant) |
| VNet, NSG, managed identity | — | $0.00 |
| **Total** | | **$13.14** |

Rates from the Azure retail API for `centralus`, at 730 hours.

## There are no secrets

Not "secrets are stored carefully" — there are none to store.

- **No Document Intelligence key.** The account sets `disableLocalAuth: true`, so its API
  keys do not exist. The only way in is an AAD token.
- **No publish profile.** Deployment is OIDC, and `scm`/`ftp` basic-auth policies are
  disabled so the publish-profile path is closed at the platform, not by convention.
- **No client secret.** The GitHub trust is a federated credential on a user-assigned
  managed identity, so there is nothing to rotate.

This is also why the project needs no Key Vault.

`AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` live in GitHub secrets.
They are identifiers, not credentials — OIDC trust rests on the subject claim, not on
secrecy. They are secrets only so a public repository does not advertise the tenant. Treat
that as tidiness, never as a control.

## First-time setup

```bash
bash infra/bootstrap.azcli
```

Run once, locally, as a subscription Owner. CI cannot create the identity CI authenticates
as. The script creates the resource group, the deploy identity, its two federated
credentials, and an RG-scoped role assignment, then prints what to paste into GitHub.

Two details in it are load-bearing:

- **The deploy identity gets Owner, not Contributor.** `main.bicep` creates a role
  assignment, and Contributor cannot create role assignments. Contributor-only looks
  correct right up until the first deployment fails with an authorization error.
- **There is no bare `pull_request` federated subject.** The repository is public, so
  anyone can open a PR. Trust is limited to `ref:refs/heads/main` and
  `environment:production`.

Then create the `production` environment in GitHub with yourself as a required reviewer —
the deploy job is gated on it, and the `environment:production` subject will not resolve
until it exists.

## Running the API locally

Because the AI account is keyless, your own account needs the data-plane role:

```bash
az login
az deployment sub create \
  --location centralus \
  --template-file infra/main.bicep \
  --parameters infra/main.dev.bicepparam \
  --parameters developerPrincipalId=$(az ad signed-in-user show --query id -o tsv)
```

Skip this and the first local run fails with a 401 — at which point the tempting fix is to
re-enable local auth and paste a key, silently undoing the keyless design. That is why the
grant is a first-class parameter rather than a note in a wiki.

## Verification

```bash
az bicep build --file infra/main.bicep --stdout > /dev/null   # compiles with zero warnings
az deployment sub what-if \
  --location centralus \
  --template-file infra/main.bicep \
  --parameters infra/main.dev.bicepparam
```

`what-if` previews **11 of the 12 resources**. The role assignment granting the app's
identity `Cognitive Services User` is absent, because its `principalId` is a module output
that does not exist until deployment time and `what-if` cannot evaluate it. That assignment
is therefore **unverified until the first real deployment** — do not read a clean `what-if`
as proof that the RBAC grant will succeed.

## Known limitation: §8 is not fully enforceable on F0

§8 requires that "the application runtime cannot invoke external network endpoints beyond
the designated Azure Document Intelligence resource URI." Two gaps:

1. **F0 supports neither private endpoints nor network ACLs**, so the AI account itself
   stays publicly reachable. Only the app's egress is controlled, not the account's ingress.
2. **NSGs filter on addresses, not hostnames.** The `CognitiveServicesManagement` service
   tag covers every Cognitive Services account in the region, not only ours.

The in-process `AllowlistHttpMessageHandler` closes the second gap by filtering on the
actual request URI. Neither control is sufficient alone; the first gap remains open at F0
and is accepted for a proof of concept.

## Custom domain

Deliberately not deployed. `customDomain` defaults to `''`, which deploys no DNS resources
at all. When a domain is bought, the zone belongs in its **own resource group** so tearing
down this project cannot destroy sibling subdomains.
