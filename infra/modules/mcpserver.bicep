
param location string

param environmentName string

param uniqueSuffix string
param tags object
param identityId string
param identityClientId string
param containerRegistryName string = ''
param logAnalyticsWorkspaceName string
@description('The name of the container image')
param imageName string = ''

// Helper to sanitize environmentName for valid container app name
var sanitizedEnvName = toLower(replace(replace(replace(replace(environmentName, ' ', '-'), '--', '-'), '[^a-zA-Z0-9-]', ''), '_', '-'))
var containerAppName = take('ca-mcp-${sanitizedEnvName}-${uniqueSuffix}', 32)
var containerEnvName = take('cae-${sanitizedEnvName}-${uniqueSuffix}', 32)

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' existing = { name: logAnalyticsWorkspaceName }

// Create shared Container App Environment
resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
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

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  tags: union(tags, { 'azd-service-name': 'mcp' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identityId}': {} }
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false  // Internal only - accessed by main app
        targetPort: 5001
        transport: 'auto'
      }
      registries: !empty(containerRegistryName) ? [
        {
          server: '${containerRegistryName}.azurecr.io'
          identity: identityId
        }
      ] : []
    }
    template: {
      containers: [
        {
          name: 'main'
          image: !empty(imageName) ? imageName : 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          env: [
            {
              name: 'AzureIdentity__UserAssignedClientId'
              value: identityClientId
            }
            {
              name: 'ASPNETCORE_URLS'
              value: 'http://+:5001'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
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

output mcpServerFqdn string = containerApp.properties.configuration.ingress.fqdn
output mcpServerUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerAppId string = containerApp.id
output containerAppEnvironmentId string = containerAppEnv.id
