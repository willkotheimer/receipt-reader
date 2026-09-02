# Infrastructure

Azure Bicep for The Receipt Reader. **Resource-group scoped**, so the deploy identity needs
rights over one resource group and nothing else.

This was subscription-scoped, so the template could declare its own resource group. That is
incompatible with least privilege: a subscription-scoped deployment requires permission at
subscription scope, which would have meant standing CI write access to the whole
subscription. The first CI run failed with `AuthorizationFailed` on
`Microsoft.Resources/deployments/whatIf/action`, which was the correct outcome. The resource
group is created by `bootstrap.azcli` instead — as it always was, since the deploy identity
had to exist before the first deployment anyway.

**Governance-Ref:** §1, §8, §9

## What gets deployed

| Resource | Name | Notes |
|---|---|---|
| Log Analytics | `log-rcpt-dev` | Local auth disabled |
| Application Insights | `appi-rcpt-dev` | Workspace-based |
| Managed identity | `id-rcpt-dev` | User-assigned; the app runs as this |
| Virtual network | `vnet-rcpt-dev` | Delegated `snet-app` for VNet integration |
| Network security group | `nsg-snet-app` | Egress allowlist, deny-all at 4096 |
| Document Intelligence | `cog-rcpt-dev-<token>` | `FormRecognizer` F0, **keyless** |
| App Service plan | `plan-rcpt-dev` | B1 Linux |
| Web app | `app-rcpt-dev-<token>` | `DOTNETCORE|10.0`, HTTPS-only |
| Basic-auth policies | `scm`, `ftp` | Both `allow: false` |

Eleven resources plus one role assignment. The resource group itself is created by the
bootstrap, not by this template.

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

Because the AI account is keyless, your own account needs the data-plane role.

> **Windows users:** the bash blocks below use `\` for line continuation, which PowerShell
> does not understand — it uses a backtick. Every multi-line command is given in both
> forms. `bootstrap.azcli` itself is a bash script: run it as `bash infra/bootstrap.azcli`,
> not directly from PowerShell.

**bash:**

```bash
az login
az deployment group create \
  --resource-group rg-receipt-reader-dev \
  --template-file infra/main.bicep \
  --parameters infra/main.dev.bicepparam \
  --parameters developerPrincipalId=$(az ad signed-in-user show --query id -o tsv)
```

**PowerShell:**

```powershell
az login
az deployment group create `
  --resource-group rg-receipt-reader-dev `
  --template-file infra/main.bicep `
  --parameters infra/main.dev.bicepparam `
  --parameters developerPrincipalId=$(az ad signed-in-user show --query id -o tsv)
```

Skip this and the first local run fails with a 401 — at which point the tempting fix is to
re-enable local auth and paste a key, silently undoing the keyless design. That is why the
grant is a first-class parameter rather than a note in a wiki.

## Verification

**bash:**

```bash
az bicep build --file infra/main.bicep --stdout > /dev/null   # compiles with zero warnings
az deployment group what-if \
  --resource-group rg-receipt-reader-dev \
  --template-file infra/main.bicep \
  --parameters infra/main.dev.bicepparam
```

**PowerShell:**

```powershell
az bicep build --file infra/main.bicep --stdout > $null
az deployment group what-if `
  --resource-group rg-receipt-reader-dev `
  --template-file infra/main.bicep `
  --parameters infra/main.dev.bicepparam
```

`what-if` does not preview the role assignment granting the app's identity
`Cognitive Services User`: its `principalId` is a module output that does not exist until
deployment time. That grant was confirmed on the first real deployment.

`what-if` also reports spurious `Modify` entries against the App Service site, the plan and
Application Insights on a no-op run. They are readback artefacts, not drift —
`siteConfig` is a sub-resource `what-if` cannot read on `Microsoft.Web/sites`, so settings
that are already applied appear as additions. `az webapp show` confirms `ftpsState`,
`minTlsVersion` and VNet integration are set. Do not chase them.

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
