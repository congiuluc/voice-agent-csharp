param environmentName string
param uniqueSuffix string
param tags object = {}
param identityPrincipalId string = ''

var acsName string = 'acs-${environmentName}-${uniqueSuffix}'

resource acs 'Microsoft.Communication/communicationServices@2025-05-01-preview' = {
  name: acsName
  location: 'global'
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dataLocation: 'United States'
    linkedDomains: []
  }
}

@secure()
output acsConnectionString string = acs.listKeys().primaryConnectionString
output acsResourceId string = acs.id
// Use the hostName property from ACS resource to get the correct endpoint with data location
output acsEndpoint string = 'https://${acs.properties.hostName}'
output acsName string = acsName
