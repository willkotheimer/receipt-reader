// DNS records in the shared zone's resource group.
//
// Split out from dns.bicep because Bicep will not let a module create records in a zone
// that lives in a different resource group — the records must be deployed at the zone's own
// scope, which is what this module is for. That constraint is a feature here: it makes the
// cross-resource-group boundary explicit rather than incidental.
//
// Governance-Ref: §9

@description('Apex zone, e.g. willkai.dev. Must already exist in this resource group.')
param zoneName string

@description('Subdomain label, e.g. receipt-reader.')
param subdomain string

@description('Default hostname of the App Service, the CNAME target.')
param appServiceDefaultHostName string

@description('Custom domain verification id, from the site\'s customDomainVerificationId.')
param domainVerificationId string

resource zone 'Microsoft.Network/dnsZones@2023-07-01-preview' existing = {
  name: zoneName
}

resource cname 'Microsoft.Network/dnsZones/CNAME@2023-07-01-preview' = {
  parent: zone
  name: subdomain
  properties: {
    TTL: 3600
    CNAMERecord: {
      cname: appServiceDefaultHostName
    }
  }
}

// App Service will not bind a hostname until it can prove the domain is yours. Without this
// record the binding fails with an unhelpful validation error.
resource verification 'Microsoft.Network/dnsZones/TXT@2023-07-01-preview' = {
  parent: zone
  name: 'asuid.${subdomain}'
  properties: {
    TTL: 3600
    TXTRecords: [
      {
        value: [domainVerificationId]
      }
    ]
  }
}

output hostName string = '${subdomain}.${zoneName}'
