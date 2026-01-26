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
// Voice Assistant configuration
@description('Voice Assistant locale setting')
param voiceAssistantLocale string = 'en-US'
@description('Voice Assistant voice setting')
param voiceAssistantVoice string = 'en-US-AvaNeural'
@description('Voice Assistant instructions')
param voiceAssistantInstructions string = 'You are a helpful virtual assistant, your name is Ava, when starting a conversation present yourself as Ava and ask how you can assist.'
@description('Voice Assistant welcome message')
param voiceAssistantWelcomeMessage string = 'Hello'
// Voice Agent configuration
@description('Voice Agent locale setting')
param voiceAgentLocale string = 'en-US'
@description('Voice Agent voice setting')
param voiceAgentVoice string = 'en-US-AvaNeural'
@description('Voice Agent instructions')
param voiceAgentInstructions string = 'You are a helpful virtual assistant.'
@description('Voice Agent welcome message')
param voiceAgentWelcomeMessage string = 'Hello'
// Voice Avatar configuration
@description('Voice Avatar locale setting')
param voiceAvatarLocale string = 'en-US'
@description('Voice Avatar voice setting')
param voiceAvatarVoice string = 'en-US-AvaNeural'
@description('Voice Avatar character')
param voiceAvatarCharacter string = 'lisa'
@description('Voice Avatar style')
param voiceAvatarStyle string = 'casual-sitting'
@description('Voice Avatar instructions')
param voiceAvatarInstructions string = 'You are a helpful virtual assistant.'
@description('Voice Avatar welcome message')
param voiceAvatarWelcomeMessage string = 'Hello'
// Incoming Call configuration
@description('Incoming Call locale setting')
param incomingCallLocale string = 'en-US'
@description('Incoming Call voice setting')
param incomingCallVoice string = 'en-US-AvaNeural'
@description('Incoming Call instructions')
param incomingCallInstructions string = 'You are a helpful virtual assistant.'
@description('Incoming Call welcome message')
param incomingCallWelcomeMessage string = 'Hello, how can I help you today?'

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
              // Voice Assistant Settings - map to configuration["VoiceAssistant:*"]
              name: 'VoiceAssistant__Locale'
              value: voiceAssistantLocale
            }
            {
              name: 'VoiceAssistant__Voice'
              value: voiceAssistantVoice
            }
            {
              name: 'VoiceAssistant__Instructions'
              value: voiceAssistantInstructions
            }
            {
              name: 'VoiceAssistant__WelcomeMessage'
              value: voiceAssistantWelcomeMessage
            }
            {
              // Voice Agent Settings - map to configuration["VoiceAgent:*"]
              name: 'VoiceAgent__Locale'
              value: voiceAgentLocale
            }
            {
              name: 'VoiceAgent__Voice'
              value: voiceAgentVoice
            }
            {
              name: 'VoiceAgent__Instructions'
              value: voiceAgentInstructions
            }
            {
              name: 'VoiceAgent__WelcomeMessage'
              value: voiceAgentWelcomeMessage
            }
            {
              // Voice Avatar Settings - map to configuration["VoiceAvatar:*"]
              name: 'VoiceAvatar__Locale'
              value: voiceAvatarLocale
            }
            {
              name: 'VoiceAvatar__Voice'
              value: voiceAvatarVoice
            }
            {
              name: 'VoiceAvatar__Character'
              value: voiceAvatarCharacter
            }
            {
              name: 'VoiceAvatar__Style'
              value: voiceAvatarStyle
            }
            {
              name: 'VoiceAvatar__Instructions'
              value: voiceAvatarInstructions
            }
            {
              name: 'VoiceAvatar__WelcomeMessage'
              value: voiceAvatarWelcomeMessage
            }
            {
              // Incoming Call Settings - map to configuration["IncomingCall:*"]
              name: 'IncomingCall__Locale'
              value: incomingCallLocale
            }
            {
              name: 'IncomingCall__Voice'
              value: incomingCallVoice
            }
            {
              name: 'IncomingCall__Instructions'
              value: incomingCallInstructions
            }
            {
              name: 'IncomingCall__WelcomeMessage'
              value: incomingCallWelcomeMessage
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
