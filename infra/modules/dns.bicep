// Custom domain binding, deliberately inert.
//
// governance.md §9. Nothing here is deployed while `customDomain` is empty, which is the
// default — the project runs on <appServiceName>.azurewebsites.net and needs no DNS at all.
//
// The zone is NOT declared anywhere in this project. It belongs in its own resource group,
// shared across every project that hangs a subdomain off the apex, so tearing this project
// down can never destroy sibling records. This module reads it as existing and creates the
// records through dns-records.bicep at that group's scope.
//
// UNVERIFIED. This module compiles and has never been deployed, because no domain has been
// bought. Treat the first real run as the test: in particular the two-pass certificate
// sequence below is the part most likely to need adjusting.
//
// Governance-Ref: §9

@description('Apex zone, e.g. willkai.dev. Must already exist in zoneResourceGroupName.')
param zoneName string

@description('Resource group holding the DNS zone. Deliberately not this project\'s group.')
param zoneResourceGroupName string

@description('Subdomain label, e.g. receipt-reader.')
param subdomain string

@description('Name of the App Service to bind.')
param appServiceName string

@description('Default hostname of the App Service, the CNAME target.')
param appServiceDefaultHostName string

@description('Custom domain verification id, from the site\'s customDomainVerificationId.')
param domainVerificationId string

@description('''
Attach the managed certificate. Leave false on the first deployment.

App Service issues a free managed certificate only for a hostname already bound to the site,
and binding requires the DNS records to have propagated. The two cannot happen in one pass,
so the first deployment creates the records and an unsecured binding, and a second run with
this set to true issues the certificate and enables SNI.
''')
param attachCertificate bool = false

resource site 'Microsoft.Web/sites@2023-12-01' existing = {
  name: appServiceName
}

module records 'dns-records.bicep' = {
  name: 'dns-records'
  scope: resourceGroup(zoneResourceGroupName)
  params: {
    zoneName: zoneName
    subdomain: subdomain
    appServiceDefaultHostName: appServiceDefaultHostName
    domainVerificationId: domainVerificationId
  }
}

resource hostNameBinding 'Microsoft.Web/sites/hostNameBindings@2023-12-01' = {
  parent: site
  name: '${subdomain}.${zoneName}'
  properties: {
    hostNameType: 'Verified'
    sslState: 'Disabled'
  }
  dependsOn: [records]
}

// Free on Basic and above. Issued only for a hostname already bound, which is why this is
// gated behind a second pass rather than declared unconditionally.
resource certificate 'Microsoft.Web/certificates@2023-12-01' = if (attachCertificate) {
  name: '${subdomain}-${zoneName}'
  location: resourceGroup().location
  properties: {
    canonicalName: '${subdomain}.${zoneName}'
    serverFarmId: site.properties.serverFarmId
    domainValidationMethod: 'http-token'
  }
  dependsOn: [hostNameBinding]
}

output hostName string = records.outputs.hostName
