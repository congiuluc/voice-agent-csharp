param location string
param environmentName string
param uniqueSuffix string
param tags object
param exists bool
param identityId string
param identityClientId string
param containerRegistryName string = ''
param aiServicesEndpoint string
param modelDeploymentName string
param acsConnectionStringSecretUri string
param acsEndpoint string = ''
param azureVoiceLiveApiKeySecretUri string = ''
param cosmosDbEndpoint string = ''
param cosmosDbDatabaseName string = ''
param logAnalyticsWorkspaceName string
param mcpServerUrl string = 'http://localhost:5001'
param foundryAgentId string = ''
param containerAppEnvironmentId string = ''
param applicationInsightsConnectionString string = ''
@description('The name of the container image')
param imageName string = ''

// Helper to sanitize environmentName for valid container app name
var sanitizedEnvName = toLower(replace(replace(replace(replace(environmentName, ' ', '-'), '--', '-'), '[^a-zA-Z0-9-]', ''), '_', '-'))
var containerAppName = take('ca-${sanitizedEnvName}-${uniqueSuffix}', 32)
var containerEnvName = take('cae-${sanitizedEnvName}-${uniqueSuffix}', 32)

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' existing = { name: logAnalyticsWorkspaceName }

// Create container app environment if not provided
resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = if (empty(containerAppEnvironmentId)) {
  name: containerEnvName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
  }
}

var envId = !empty(containerAppEnvironmentId) ? containerAppEnvironmentId : containerAppEnv.id


module fetchLatestImage './fetch-container-image.bicep' = {
  name: '${containerAppName}-fetch-image'
  params: {
    exists: exists
    name: containerAppName
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-10-02-preview' = {
  name: containerAppName
  location: location
  tags: union(tags, { 'azd-service-name': 'app' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identityId}': {} }
  }
  properties: {
    managedEnvironmentId: envId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
      }
      registries: !empty(containerRegistryName) ? [
        {
          server: '${containerRegistryName}.azurecr.io'
          identity: identityId
        }
      ] : []
      secrets: [
        {
          name: 'acs-connection-string'
          keyVaultUrl: acsConnectionStringSecretUri
          identity: identityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'main'
          image: !empty(imageName) ? imageName : 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          env: [
            {
              // Application Insights connection string for telemetry
              name: 'ApplicationInsights__ConnectionString'
              value: applicationInsightsConnectionString
            }
            {
              // Maps to configuration["AzureVoiceLive:Endpoint"]
              name: 'AzureVoiceLive__Endpoint'
              value: aiServicesEndpoint
            }
            {
              // Maps to configuration["AzureIdentity:UserAssignedClientId"]
              name: 'AzureIdentity__UserAssignedClientId'
              value: identityClientId
            }
            {
              // Maps to configuration["AzureVoiceLive:Model"]
              name: 'AzureVoiceLive__Model'
              value: 'gpt-4o'
            }
            {
              // Provide ACS connection string into configuration["AzureCommunicationServices:ConnectionString"] from KeyVault
              name: 'AzureCommunicationServices__ConnectionString'
              secretRef: 'acs-connection-string'
            }
            {
              // Provide ACS Endpoint into configuration["AzureCommunicationServices:Endpoint"] (optional)
              name: 'AzureCommunicationServices__Endpoint'
              value: acsEndpoint
            }
            {
              // MCP Server URL for tool integration
              name: 'McpServer__Url'
              value: mcpServerUrl
            }
            {
              // Foundry Agent ID
              name: 'AzureFoundry__AgentId'
              value: foundryAgentId
            }
            {
              // Cosmos DB Endpoint for call monitoring
              name: 'CosmosDb__Endpoint'
              value: cosmosDbEndpoint
            }
            {
              // Cosmos DB Database name
              name: 'CosmosDb__DatabaseName'
              value: cosmosDbDatabaseName
            }
            {
              name: 'DEBUG_MODE'
              value: 'true'
            }]
          resources: {
            cpu: json('2.0')
            memory: '4.0Gi'
          }
        }
      ]
      // TODO add memory/cpu scaling
      scale: {
        minReplicas: 1
        maxReplicas: 10
        rules: [
          {
            name: 'http-scaler'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output containerAppId string = containerApp.id
