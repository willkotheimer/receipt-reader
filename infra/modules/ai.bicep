// Azure AI Document Intelligence (prebuilt-receipt).
//
// governance.md §8 Scope & Actions — the runtime reaches this resource and nothing else.
// The account is deliberately keyless: disableLocalAuth removes the API keys entirely, so
// there is no credential to leak into app settings, a workflow, or a developer's shell
// history. Every caller authenticates with an AAD token instead.
//
// Governance-Ref: §8, §9

@description('Azure region for the account.')
param location string

@description('Resource name. Must be globally unique because it doubles as the AAD custom subdomain.')
param name string

@description('F0 is the free tier (500 pages/month). S0 is pay-per-page.')
@allowed(['F0', 'S0'])
param sku string

@description('Tags applied to the account.')
param tags object = {}

@description('Principal ids granted the Cognitive Services User data-plane role.')
param readerPrincipalIds array = []

// Cognitive Services User. Grants data-plane access (analyze documents) without any
// management-plane rights — notably not listKeys, which would defeat disableLocalAuth.
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: name
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: {
    name: sku
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    // Required for AAD token auth: without a custom subdomain the account is only
    // reachable on the regional endpoint, which accepts keys only.
    customSubDomainName: name

    // §8. No API keys exist on this account. The only way in is an AAD token.
    disableLocalAuth: true

    // F0 supports neither private endpoints nor network ACLs, so the account stays
    // publicly reachable and egress control is enforced app-side instead. Recorded as a
    // known limitation rather than left implicit — see infra/README.md.
    publicNetworkAccess: 'Enabled'
  }
}

resource roleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in readerPrincipalIds: {
    name: guid(account.id, principalId, cognitiveServicesUserRoleId)
    scope: account
    properties: {
      roleDefinitionId: subscriptionResourceId(
        'Microsoft.Authorization/roleDefinitions',
        cognitiveServicesUserRoleId
      )
      principalId: principalId
      // Deliberately not set to 'ServicePrincipal': the same module grants both a managed
      // identity and a human user, and 'User' would fail for the former. Omitting it lets
      // ARM resolve the type, at the cost of a retry if the principal is brand new.
    }
  }
]

@description('Document Intelligence endpoint. Not a secret: access requires an AAD token.')
output endpoint string = account.properties.endpoint

output id string = account.id
output name string = account.name
