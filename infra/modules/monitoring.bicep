// Log Analytics workspace and workspace-based Application Insights.
//
// The connection string is returned as an output and wired into app settings by the
// caller. It is an ingestion credential rather than a read credential, and it is created
// and consumed entirely inside the deployment - it never enters source control.
//
// Governance-Ref: §9

@description('Azure region.')
param location string

@description('Log Analytics workspace name.')
param workspaceName string

@description('Application Insights component name.')
param appInsightsName string

@description('Tags applied to both resources.')
param tags object = {}

@description('Days to retain telemetry. 30 is the free-tier default.')
@minValue(30)
@maxValue(730)
param retentionInDays int = 30

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    features: {
      // Telemetry is reachable through the workspace with RBAC; no shared keys needed.
      disableLocalAuth: true
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

output workspaceId string = workspace.id
output connectionString string = appInsights.properties.ConnectionString
output appInsightsName string = appInsights.name
