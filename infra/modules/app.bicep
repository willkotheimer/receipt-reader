// App Service plan and web app. The ASP.NET Core API serves the built Vite bundle from
// wwwroot, so there is a single origin and no CORS surface.
//
// governance.md §1 — the app holds no key for Document Intelligence; it authenticates with
// its user-assigned managed identity. §8 — SCM basic auth and FTPS are disabled so the
// publish-profile deployment path, which would reintroduce a long-lived credential, is
// closed at the platform rather than by convention.
//
// Governance-Ref: §1, §8, §9

@description('Azure region.')
param location string

@description('App Service plan name.')
param planName string

@description('Web app name. Forms the default hostname, so it must be globally unique.')
param siteName string

@description('Plan SKU. F1 is free but has no Always On and no VNet integration.')
@allowed(['F1', 'B1', 'B2', 'S1'])
param sku string

@description('Resource id of the user-assigned managed identity the app runs as.')
param managedIdentityId string

@description('Client id of that identity, passed to DefaultAzureCredential.')
param managedIdentityClientId string

@description('Document Intelligence endpoint the app is permitted to call.')
param documentIntelligenceEndpoint string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('Subnet resource id for regional VNet integration. Empty disables integration.')
param integrationSubnetId string = ''

@description('Tags applied to both resources.')
param tags object = {}

// F1 rejects alwaysOn and cannot do VNet integration; everything above it supports both.
var isFreeTier = sku == 'F1'
var vnetIntegrationEnabled = !isFreeTier && !empty(integrationSubnetId)

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: sku
  }
  kind: 'linux'
  properties: {
    reserved: true // required for Linux
  }
}

resource site 'Microsoft.Web/sites@2023-12-01' = {
  name: siteName
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    virtualNetworkSubnetId: vnetIntegrationEnabled ? integrationSubnetId : null
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|10.0'
      alwaysOn: !isFreeTier
      http20Enabled: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      // Routes all outbound traffic through the VNet so the NSG rules apply to egress
      // rather than only to traffic destined for private addresses.
      vnetRouteAllEnabled: vnetIntegrationEnabled
      healthCheckPath: '/api/health'
      appSettings: [
        {
          // Binds DefaultAzureCredential to the user-assigned identity. Without this it
          // would try the system-assigned identity, which does not exist, and fail at
          // runtime rather than at deploy time.
          name: 'AZURE_CLIENT_ID'
          value: managedIdentityClientId
        }
        {
          name: 'DocumentIntelligence__Endpoint'
          value: documentIntelligenceEndpoint
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'ASPNETCORE_FORWARDEDHEADERS_ENABLED'
          value: 'true'
        }
      ]
    }
  }
}

// §8. The publish-profile deployment path (azure/webapps-deploy) relies on SCM basic auth
// and would reintroduce exactly the long-lived credential that OIDC exists to remove.
// Disabling both policies closes it at the platform, so no workflow can opt back in.
resource scmBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: site
  name: 'scm'
  properties: {
    allow: false
  }
}

resource ftpBasicAuth 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: site
  name: 'ftp'
  properties: {
    allow: false
  }
}

output defaultHostName string = site.properties.defaultHostName

@description('Proves domain ownership to App Service. Needed by the asuid TXT record.')
output customDomainVerificationId string = site.properties.customDomainVerificationId
output siteName string = site.name
output id string = site.id
