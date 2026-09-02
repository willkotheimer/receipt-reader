// User-assigned managed identity the web app runs as.
//
// User-assigned rather than system-assigned deliberately: a system-assigned identity has
// no principalId until the site exists, which makes granting it a data-plane role in the
// same deployment a chicken-and-egg problem. Creating the identity first lets the role
// assignment and the site be declared in one pass.
//
// Governance-Ref: §8

@description('Azure region.')
param location string

@description('Identity name.')
param name string

@description('Tags applied to the identity.')
param tags object = {}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: name
  location: location
  tags: tags
}

output id string = identity.id
output principalId string = identity.properties.principalId
output clientId string = identity.properties.clientId
output name string = identity.name
