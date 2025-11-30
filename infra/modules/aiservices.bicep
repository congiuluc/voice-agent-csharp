param environmentName string
param uniqueSuffix string
param identityId string
param tags object
param disableLocalAuth bool = true

@description('The name of your project')
param projectName string = '${environmentName}-${uniqueSuffix}-proj'

@description('The description of your project')
param projectDescription string = '${environmentName} AI Services Project'

@description('The display name of your project')
param projectDisplayName string = '${environmentName}-${uniqueSuffix}-proj'


@description('The name of the OpenAI model you want to deploy')
param modelName string = 'gpt-5.1'

@description('The model format of the model you want to deploy. Example: OpenAI')
param modelFormat string = 'OpenAI'

@description('The version of the model you want to deploy. Example: 2024-11-20')
param modelVersion string = '2025-11-13'

@description('The SKU name for the model deployment. Example: GlobalStandard')
param modelSkuName string = 'GlobalStandard'

@description('The capacity of the model deployment in TPM.')
param modelCapacity int = 30



// Voice live api only supported on two regions now 
var location string = 'swedencentral'
var aiServicesName string = 'aiServices-${environmentName}-${uniqueSuffix}'


@allowed([
  'S0'
])
param sku string = 'S0'

resource aiServices 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: aiServicesName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identityId}': {} }
  }
  sku: {
    name: sku
  }
  kind: 'AIServices'
  tags: tags
  properties: {
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
    disableLocalAuth: disableLocalAuth
    customSubDomainName: 'aiservices-${environmentName}-${uniqueSuffix}'
    allowProjectManagement: true
  }
}

/*
  Step 3: Create a Cognitive Services Project
    
*/
#disable-next-line BCP081
resource project 'Microsoft.CognitiveServices/accounts/projects@2025-04-01-preview' = {
  parent: aiServices
  name: projectName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    description: projectDescription
    displayName: projectDisplayName
  }
}

#disable-next-line BCP081
resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01'= {
  parent: aiServices
  name: modelName
  sku : {
    capacity: modelCapacity
    name: modelSkuName
  }
  properties: {
    model:{
      name: modelName
      format: modelFormat
      version: modelVersion
    }
  }
}

@secure()
output aiServicesEndpoint string = aiServices.properties.endpoint
output aiServicesId string = aiServices.id
output aiServicesName string = aiServices.name
output aiProjectName string = project.name
