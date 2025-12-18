targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the the environment which is used to generate a short unique hash used in all resources.')
param environmentName string

@minLength(1)
@description('Primary location for all resources (filtered on available regions for Azure Open AI Service).')
@allowed([
  'eastus2'
  'swedencentral'
])
param location string

var abbrs = loadJsonContent('./abbreviations.json')
param useApplicationInsights bool = true
param useContainerRegistry bool = true
param deployMcpServer bool = true
param appExists bool
@description('The OpenAI model name')
param modelName string = ' gpt-4o-mini'
@description('Id of the user or app to assign application roles. If ommited will be generated from the user assigned identity.')
param principalId string = ''

var uniqueSuffix = substring(uniqueString(subscription().id, environmentName), 0, 5)
var tags = {'azd-env-name': environmentName }
var rgName = 'rg-${environmentName}-${uniqueSuffix}'

resource rg 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: rgName
  location: location
  tags: tags
}

// [ User Assigned Identity for App to avoid circular dependency ]
module appIdentity './modules/identity.bicep' = {
  name: 'uami'
  scope: rg
  params: {
    location: location
    environmentName: environmentName
    uniqueSuffix: uniqueSuffix
  }
}

var sanitizedEnvName = toLower(replace(replace(replace(replace(environmentName, ' ', '-'), '--', '-'), '[^a-zA-Z0-9-]', ''), '_', '-'))
var logAnalyticsName = take('log-${sanitizedEnvName}-${uniqueSuffix}', 63)
var appInsightsName = take('insights-${sanitizedEnvName}-${uniqueSuffix}', 63)
module monitoring 'modules/monitoring/monitor.bicep' = {
  name: 'monitor'
  scope: rg
  params: {
    logAnalyticsName: logAnalyticsName
    appInsightsName: appInsightsName
    tags: tags
  }
}

module registry 'modules/containerregistry.bicep' = if (useContainerRegistry) {
  name: 'registry'
  scope: rg
  params: {
    location: location
    environmentName: environmentName
    uniqueSuffix: uniqueSuffix
    identityName: appIdentity.outputs.name
    tags: tags
  }
  dependsOn: [ appIdentity ]
}


module aiServices 'modules/aiservices.bicep' = {
  name: 'ai-foundry-deployment'
  scope: rg
  params: {
    environmentName: environmentName
    uniqueSuffix: uniqueSuffix
    identityId: appIdentity.outputs.identityId
    tags: tags
  }
  dependsOn: [ appIdentity ]
}

module acs 'modules/acs.bicep' = {
  name: 'acs-deployment'
  scope: rg
  params: {
    environmentName: environmentName
    uniqueSuffix: uniqueSuffix
    tags: tags
  }
}

var keyVaultName = toLower(replace('kv-${environmentName}-${uniqueSuffix}', '_', '-'))
var sanitizedKeyVaultName = take(toLower(replace(replace(replace(replace(keyVaultName, '--', '-'), '_', '-'), '[^a-zA-Z0-9-]', ''), '-$', '')), 24)
module keyvault 'modules/keyvault.bicep' = {
  name: 'keyvault-deployment'
  scope: rg
  params: {
    location: location
    keyVaultName: sanitizedKeyVaultName
    tags: tags
    acsConnectionString: acs.outputs.acsConnectionString
  }
  dependsOn: [ appIdentity, acs ]
}

// Cosmos DB for call monitoring and pricing configuration
module cosmosdb 'modules/cosmosdb.bicep' = {
  name: 'cosmosdb-deployment'
  scope: rg
  params: {
    name: 'cosmos-${sanitizedEnvName}-${uniqueSuffix}'
    location: location
    tags: tags
  }
}

// Add role assignments 
module RoleAssignments 'modules/roleassignments.bicep' = {
  scope: rg
  name: 'role-assignments'
  params: {
    identityPrincipalId: appIdentity.outputs.principalId
    aiServicesId: aiServices.outputs.aiServicesId
    keyVaultName: sanitizedKeyVaultName
    acsResourceId: acs.outputs.acsResourceId
    cosmosDbAccountId: cosmosdb.outputs.accountName
    currentUserPrincipalId: principalId
  }
  dependsOn: [ keyvault, appIdentity, acs, cosmosdb ] 
}

// MCP Server Container App (optional - can run standalone)
module mcpserver 'modules/mcpserver.bicep' = if (deployMcpServer) {
  name: 'mcpserver-deployment'
  scope: rg
  params: {
    location: location
    environmentName: environmentName
    uniqueSuffix: uniqueSuffix
    tags: tags
    identityId: appIdentity.outputs.identityId
    identityClientId: appIdentity.outputs.clientId
    containerRegistryName: useContainerRegistry ? registry.outputs.name : ''
    logAnalyticsWorkspaceName: logAnalyticsName
    imageName: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
  }
  dependsOn: [keyvault, RoleAssignments]
}

module containerapp 'modules/containerapp.bicep' = {
  name: 'containerapp-deployment'
  scope: rg
  params: {
    location: location
    environmentName: environmentName
    uniqueSuffix: uniqueSuffix
    tags: tags
    exists: appExists
    identityId: appIdentity.outputs.identityId
    identityClientId: appIdentity.outputs.clientId
    containerRegistryName: useContainerRegistry ? registry.outputs.name : ''
    aiServicesEndpoint: aiServices.outputs.aiServicesEndpoint
    modelDeploymentName: modelName
    acsConnectionStringSecretUri: keyvault.outputs.acsConnectionStringUri
    acsEndpoint: acs.outputs.acsEndpoint
    cosmosDbEndpoint: cosmosdb.outputs.endpoint
    cosmosDbDatabaseName: cosmosdb.outputs.databaseName
    logAnalyticsWorkspaceName: logAnalyticsName
    mcpServerUrl: deployMcpServer ? mcpserver.outputs.mcpServerUrl : 'http://localhost:5001'
    containerAppEnvironmentId: deployMcpServer ? mcpserver.outputs.containerAppEnvironmentId : ''
    imageName: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
    applicationInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
  }
  dependsOn: [keyvault, RoleAssignments]
}


// OUTPUTS will be saved in azd env for later use
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_USER_ASSIGNED_IDENTITY_ID string = appIdentity.outputs.identityId
output AZURE_USER_ASSIGNED_IDENTITY_CLIENT_ID string = appIdentity.outputs.clientId

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = useContainerRegistry ? registry.outputs.loginServer : 'N/A (Container Registry disabled)'
output SERVICE_API_ENDPOINTS array = ['${containerapp.outputs.containerAppFqdn}/acs/incomingcall']
output AZURE_VOICE_LIVE_ENDPOINT string = aiServices.outputs.aiServicesEndpoint
output AZURE_FOUNDRY_PROJECT_NAME string = aiServices.outputs.aiProjectName

output AZURE_VOICE_LIVE_MODEL string = modelName
output MCP_SERVER_URL string = deployMcpServer ? mcpserver.outputs.mcpServerUrl : 'http://localhost:5001 (standalone - not deployed)'
output COSMOS_DB_ENDPOINT string = cosmosdb.outputs.endpoint
output COSMOS_DB_ACCOUNT_NAME string = cosmosdb.outputs.accountName
output COSMOS_DB_DATABASE_NAME string = cosmosdb.outputs.databaseName
output APPLICATIONINSIGHTS_CONNECTION_STRING string = monitoring.outputs.appInsightsConnectionString

