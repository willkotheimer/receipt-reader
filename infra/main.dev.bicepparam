using 'main.bicep'

param location = 'centralus'
param environmentName = 'dev'
param workloadName = 'rcpt'

// Free tier: 500 pages/month, one FormRecognizer F0 per subscription.
param aiSku = 'F0'

// B1 at $13.14/month. F1 is free but forfeits Always On and VNet integration, which
// would leave §8 enforceable only in-process.
param appServiceSku = 'B1'

param deployNetworkIsolation = true

// Set locally to your own AAD object id so the API can run against DefaultAzureCredential
// without re-enabling local auth:
//   az ad signed-in-user show --query id -o tsv
// Left empty in CI so deployments carry no human grant.
param developerPrincipalId = ''

// Deferred. Empty deploys no DNS resources at all.
param customDomain = ''
