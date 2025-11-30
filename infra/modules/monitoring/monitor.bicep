@description('Location for all resources')
param location string = resourceGroup().location
param logAnalyticsName string
param appInsightsName string
param tags object = {}

var dashboardName = take('${appInsightsName}-dashboard', 32)
// Log Analytics
module logAnalytics 'loganalytics.bicep' = {
  name: 'loganalytics'
  params: {
    name: logAnalyticsName
    location: location
    tags: union(tags, { 'azd-service-name': logAnalyticsName })
  }
}

// Application Insights
module appInsights 'applicationinsights.bicep' = {
  name: 'applicationinsights'
  params: {
    name: appInsightsName
    location: location
    tags: union(tags, {'azd-service-name': appInsightsName })
    dashboardName: dashboardName
    logAnalyticsWorkspaceId: logAnalytics.outputs.id
  }
}

output appInsightsName string = appInsights.name
output appInsightsConnectionString string = appInsights.outputs.connectionString
output logAnalyticsName string = logAnalytics.name
output logAnalyticsWorkspaceId string = logAnalytics.outputs.id
