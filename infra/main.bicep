// The Receipt Reader — infrastructure root.
//
// Subscription-scoped so the resource group itself is declared rather than assumed, which
// makes the whole environment reproducible from nothing and destroyable in one command.
//
// No secret is declared, passed, or emitted anywhere in this template. The Document
// Intelligence account is keyless (disableLocalAuth), deployment is OIDC, and the only
// credential-shaped value in play is the Application Insights connection string, which is
// created and consumed inside the deployment and never enters source control.
//
// Governance-Ref: §1, §8, §9

targetScope = 'subscription'

@description('Azure region for every resource.')
param location string = 'centralus'

@description('Environment discriminator used in resource names.')
@allowed(['dev', 'prod'])
param environmentName string = 'dev'

@description('Short workload token used in resource names.')
@minLength(3)
@maxLength(6)
param workloadName string = 'rcpt'

@description('Document Intelligence tier. F0 is free and limited to one per subscription.')
@allowed(['F0', 'S0'])
param aiSku string = 'F0'

@description('App Service plan tier. F1 forfeits Always On and VNet integration.')
@allowed(['F1', 'B1', 'B2', 'S1'])
param appServiceSku string = 'B1'

@description('Deploy the VNet and egress NSG. Requires a Basic or higher plan.')
param deployNetworkIsolation bool = true

@description('''
Object id of a developer's own AAD user account, granted the Document Intelligence
data-plane role so the API can be run locally against DefaultAzureCredential.
Without it the first local run fails with 401, and the tempting fix is to re-enable local
auth and paste a key — which would undo the keyless design. Leave empty in CI.
''')
param developerPrincipalId string = ''

@description('Custom hostname, e.g. receipt-reader.willkai.dev. Empty deploys no DNS resources.')
param customDomain string = ''

var resourceGroupName = 'rg-receipt-reader-${environmentName}'

// Deterministic per-subscription suffix. Both the AI account and the web app need globally
// unique names, and a hash of the subscription id keeps redeploys stable while avoiding
// collisions with anyone else's deployment of this template.
var token = take(uniqueString(subscription().id, workloadName, environmentName), 8)

var tags = {
  workload: 'receipt-reader'
  environment: environmentName
  managedBy: 'bicep'
  governanceRef: 'SECTION-8'
}

// VNet integration needs Basic or higher; on F1 the flag is silently inert rather than a
// deployment error, so the intent stays expressed in the parameter file either way.
var networkIsolationEnabled = deployNetworkIsolation && appServiceSku != 'F1'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module monitoring 'modules/monitoring.bicep' = {
  scope: rg
  name: 'monitoring'
  params: {
    location: location
    workspaceName: 'log-${workloadName}-${environmentName}'
    appInsightsName: 'appi-${workloadName}-${environmentName}'
    tags: tags
  }
}

module identity 'modules/identity.bicep' = {
  scope: rg
  name: 'identity'
  params: {
    location: location
    name: 'id-${workloadName}-${environmentName}'
    tags: tags
  }
}

module network 'modules/network.bicep' = if (networkIsolationEnabled) {
  scope: rg
  name: 'network'
  params: {
    location: location
    vnetName: 'vnet-${workloadName}-${environmentName}'
    tags: tags
  }
}

module ai 'modules/ai.bicep' = {
  scope: rg
  name: 'ai'
  params: {
    location: location
    name: 'cog-${workloadName}-${environmentName}-${token}'
    sku: aiSku
    tags: tags
    // The app's identity always. The developer's account only when supplied, so CI
    // deployments do not carry a stray human grant.
    readerPrincipalIds: empty(developerPrincipalId)
      ? [identity.outputs.principalId]
      : [identity.outputs.principalId, developerPrincipalId]
  }
}

module app 'modules/app.bicep' = {
  scope: rg
  name: 'app'
  params: {
    location: location
    planName: 'plan-${workloadName}-${environmentName}'
    siteName: 'app-${workloadName}-${environmentName}-${token}'
    sku: appServiceSku
    managedIdentityId: identity.outputs.id
    managedIdentityClientId: identity.outputs.clientId
    documentIntelligenceEndpoint: ai.outputs.endpoint
    appInsightsConnectionString: monitoring.outputs.connectionString
    // network! asserts non-null: the module and this expression share the same condition,
    // which Bicep cannot prove on its own. Reading the output rather than reconstructing
    // the id with resourceId() also keeps the implicit dependency, so the site is never
    // created before the subnet it integrates with.
    integrationSubnetId: networkIsolationEnabled ? network!.outputs.subnetId : ''
    tags: tags
  }
}

@description('Default hostname of the deployed app.')
output appHostName string = app.outputs.defaultHostName

@description('App Service site name, used by the deploy workflow for zip deploy.')
output appServiceName string = app.outputs.siteName

@description('Resource group everything landed in.')
output resourceGroupName string = rg.name

@description('Document Intelligence endpoint. Not a secret — access requires an AAD token.')
output documentIntelligenceEndpoint string = ai.outputs.endpoint

@description('Client id of the app identity. Not a secret — it identifies, it does not authenticate.')
output managedIdentityClientId string = identity.outputs.clientId

@description('Empty until a custom domain is configured. Present so the deploy workflow can branch on it.')
output configuredCustomDomain string = customDomain
