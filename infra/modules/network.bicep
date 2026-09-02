// VNet, delegated subnet and NSG for App Service regional VNet integration.
//
// governance.md §8: "The application runtime cannot invoke external network endpoints
// beyond the designated Azure Document Intelligence resource URI."
//
// This module is the network half of that. Combined with vnetRouteAllEnabled on the site,
// all outbound traffic leaves through this subnet and is filtered by the NSG below.
//
// The filtering is by service tag, not by hostname, because NSGs operate on addresses.
// CognitiveServicesManagement covers every Cognitive Services account in the region, not
// just ours — so this narrows egress to a class of endpoint rather than to a single URI.
// Closing that last gap is the job of the in-process AllowlistHttpMessageHandler, which
// filters on the actual request URI. Neither control is sufficient alone.
//
// Governance-Ref: §8

@description('Azure region.')
param location string

@description('Virtual network name.')
param vnetName string

@description('Name of the subnet delegated to App Service.')
param subnetName string = 'snet-app'

@description('Address space for the virtual network.')
param addressPrefix string = '10.10.0.0/24'

@description('Address range for the delegated subnet. Must sit inside addressPrefix.')
param subnetPrefix string = '10.10.0.0/26'

@description('Tags applied to all resources.')
param tags object = {}

resource nsg 'Microsoft.Network/networkSecurityGroups@2024-01-01' = {
  name: 'nsg-${subnetName}'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowCognitiveServicesOutbound'
        properties: {
          description: 'Document Intelligence. The only third-party endpoint the app may reach.'
          priority: 100
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: 'CognitiveServicesManagement'
          destinationPortRange: '443'
        }
      }
      {
        name: 'AllowMonitorOutbound'
        properties: {
          description: 'Application Insights ingestion. Without this, telemetry is silently dropped.'
          priority: 110
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: 'AzureMonitor'
          destinationPortRange: '443'
        }
      }
      {
        name: 'AllowAzureActiveDirectoryOutbound'
        properties: {
          description: 'Token acquisition for the managed identity. Without this, every AAD call fails and the app cannot authenticate at all.'
          priority: 120
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: 'AzureActiveDirectory'
          destinationPortRange: '443'
        }
      }
      {
        name: 'DenyAllOutbound'
        properties: {
          description: 'Fail closed. Anything not explicitly allowed above cannot leave.'
          priority: 4096
          direction: 'Outbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
    ]
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [addressPrefix]
    }
    subnets: [
      {
        name: subnetName
        properties: {
          addressPrefix: subnetPrefix
          networkSecurityGroup: {
            id: nsg.id
          }
          delegations: [
            {
              name: 'appservice-delegation'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
    ]
  }
}

output subnetId string = vnet.properties.subnets[0].id
output vnetId string = vnet.id
