metadata description = 'Creates an enhanced dashboard for call monitoring with KQL queries'
param dashboardName string
param applicationInsightsName string
param location string = resourceGroup().location
param tags object = {}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
}

resource dashboard 'Microsoft.Portal/dashboards@2020-09-01-preview' = {
  name: dashboardName
  location: location
  tags: tags
  properties: {
    lenses: [
      {
        order: 0
        parts: [
          // Live Call Count (last 1 hour)
          {
            position: {
              x: 0
              y: 0
              colSpan: 6
              rowSpan: 4
            }
            metadata: {
              inputs: [
                {
                  name: 'resourceTypeMode'
                  value: 'components'
                }
                {
                  name: 'ComponentId'
                  value: {
                    SubscriptionId: subscription().subscriptionId
                    ResourceGroup: resourceGroup().name
                    Name: applicationInsights.name
                  }
                }
                {
                  name: 'Query'
                  value: 'customEvents | where name == "SessionCreated" | where timestamp > ago(1h) | summarize count() by bin(timestamp, 5m) | render timechart'
                }
                {
                  name: 'TimeRange'
                  value: 'PT1H'
                }
              ]
              #disable-next-line BCP036
              type: 'Extension/Microsoft_OperationsManagementSuite_Workspace/PartType/LogsDashboardPart'
              settings: {
                content: {
                  Query: 'customEvents | where name == "SessionCreated" | where timestamp > ago(1h) | summarize count() by bin(timestamp, 5m) | render timechart'
                  ControlType: 'AnalyticsChart'
                  SpecificChart: 'Line'
                  PartTitle: 'Live Call Count (Last 1 Hour)'
                  PartSubTitle: '5-minute buckets'
                }
              }
            }
          }
          // Total Tokens Consumed (24h)
          {
            position: {
              x: 6
              y: 0
              colSpan: 3
              rowSpan: 2
            }
            metadata: {
              inputs: [
                {
                  name: 'resourceTypeMode'
                  value: 'components'
                }
                {
                  name: 'ComponentId'
                  value: {
                    SubscriptionId: subscription().subscriptionId
                    ResourceGroup: resourceGroup().name
                    Name: applicationInsights.name
                  }
                }
                {
                  name: 'Query'
                  value: 'customMetrics | where name == "TokensConsumed" | where timestamp > ago(24h) | summarize sum(value)'
                }
                {
                  name: 'TimeRange'
                  value: 'P1D'
                }
              ]
              #disable-next-line BCP036
              type: 'Extension/Microsoft_OperationsManagementSuite_Workspace/PartType/LogsDashboardPart'
              settings: {
                content: {
                  Query: 'customMetrics | where name == "TokensConsumed" | where timestamp > ago(24h) | summarize TotalTokens=sum(value)'
                  ControlType: 'AnalyticsGrid'
                  PartTitle: 'Total Tokens (24h)'
                }
              }
            }
          }
          // Cost Trend (24h hourly)
          {
            position: {
              x: 9
              y: 0
              colSpan: 3
              rowSpan: 2
            }
            metadata: {
              inputs: [
                {
                  name: 'resourceTypeMode'
                  value: 'components'
                }
                {
                  name: 'ComponentId'
                  value: {
                    SubscriptionId: subscription().subscriptionId
                    ResourceGroup: resourceGroup().name
                    Name: applicationInsights.name
                  }
                }
                {
                  name: 'Query'
                  value: 'customMetrics | where name == "EstimatedCost" | where timestamp > ago(24h) | summarize sum(value)'
                }
                {
                  name: 'TimeRange'
                  value: 'P1D'
                }
              ]
              #disable-next-line BCP036
              type: 'Extension/Microsoft_OperationsManagementSuite_Workspace/PartType/LogsDashboardPart'
              settings: {
                content: {
                  Query: 'customMetrics | where name == "EstimatedCost" | where timestamp > ago(24h) | summarize TotalCost=sum(value) | extend CostFormatted=strcat("$", round(TotalCost, 2))'
                  ControlType: 'AnalyticsGrid'
                  PartTitle: 'Total Cost (24h)'
                }
              }
            }
          }
          // Calls by Use Case (Pie Chart)
          {
            position: {
              x: 0
              y: 4
              colSpan: 6
              rowSpan: 4
            }
            metadata: {
              inputs: [
                {
                  name: 'resourceTypeMode'
                  value: 'components'
                }
                {
                  name: 'ComponentId'
                  value: {
                    SubscriptionId: subscription().subscriptionId
                    ResourceGroup: resourceGroup().name
                    Name: applicationInsights.name
                  }
                }
                {
                  name: 'Query'
                  value: 'customEvents | where name == "SessionCreated" | where timestamp > ago(24h) | summarize count() by tostring(customDimensions.callType) | render piechart'
                }
                {
                  name: 'TimeRange'
                  value: 'P1D'
                }
              ]
              #disable-next-line BCP036
              type: 'Extension/Microsoft_OperationsManagementSuite_Workspace/PartType/LogsDashboardPart'
              settings: {
                content: {
                  Query: 'customEvents | where name == "SessionCreated" | where timestamp > ago(24h) | summarize count() by tostring(customDimensions.callType) | render piechart'
                  ControlType: 'AnalyticsChart'
                  SpecificChart: 'Pie'
                  PartTitle: 'Calls by Use Case (24h)'
                }
              }
            }
          }
          // Cost by Use Case (Bar Chart)
          {
            position: {
              x: 6
              y: 4
              colSpan: 6
              rowSpan: 4
            }
            metadata: {
              inputs: [
                {
                  name: 'resourceTypeMode'
                  value: 'components'
                }
                {
                  name: 'ComponentId'
                  value: {
                    SubscriptionId: subscription().subscriptionId
                    ResourceGroup: resourceGroup().name
                    Name: applicationInsights.name
                  }
                }
                {
                  name: 'Query'
                  value: 'customMetrics | where name == "EstimatedCost" | where timestamp > ago(24h) | summarize sum(value) by tostring(customDimensions.callType) | render barchart'
                }
                {
                  name: 'TimeRange'
                  value: 'P1D'
                }
              ]
              #disable-next-line BCP036
              type: 'Extension/Microsoft_OperationsManagementSuite_Workspace/PartType/LogsDashboardPart'
              settings: {
                content: {
                  Query: 'customMetrics | where name == "EstimatedCost" | where timestamp > ago(24h) | summarize TotalCost=sum(value) by CallType=tostring(customDimensions.callType) | extend Cost=strcat("$", round(TotalCost, 2)) | project CallType, Cost | render barchart'
                  ControlType: 'AnalyticsChart'
                  SpecificChart: 'Bar'
                  PartTitle: 'Cost by Use Case (24h)'
                }
              }
            }
          }
          // Top PSTN Callers
          {
            position: {
              x: 0
              y: 8
              colSpan: 6
              rowSpan: 4
            }
            metadata: {
              inputs: [
                {
                  name: 'resourceTypeMode'
                  value: 'components'
                }
                {
                  name: 'ComponentId'
                  value: {
                    SubscriptionId: subscription().subscriptionId
                    ResourceGroup: resourceGroup().name
                    Name: applicationInsights.name
                  }
                }
                {
                  name: 'Query'
                  value: 'customEvents | where name == "SessionCreated" and customDimensions.callType == "IncomingCall" | where timestamp > ago(7d) | summarize Calls=count() by UserId=tostring(customDimensions.userId) | order by Calls desc | take 10'
                }
                {
                  name: 'TimeRange'
                  value: 'P7D'
                }
              ]
              #disable-next-line BCP036
              type: 'Extension/Microsoft_OperationsManagementSuite_Workspace/PartType/LogsDashboardPart'
              settings: {
                content: {
                  Query: 'customEvents | where name == "SessionCreated" and customDimensions.callType == "IncomingCall" | where timestamp > ago(7d) | summarize Calls=count() by UserId=tostring(customDimensions.userId) | order by Calls desc | take 10'
                  ControlType: 'AnalyticsGrid'
                  PartTitle: 'Top PSTN Callers (Last 7 Days)'
                }
              }
            }
          }
          // Error Tracking
          {
            position: {
              x: 6
              y: 8
              colSpan: 6
              rowSpan: 4
            }
            metadata: {
              inputs: [
                {
                  name: 'resourceTypeMode'
                  value: 'components'
                }
                {
                  name: 'ComponentId'
                  value: {
                    SubscriptionId: subscription().subscriptionId
                    ResourceGroup: resourceGroup().name
                    Name: applicationInsights.name
                  }
                }
                {
                  name: 'Query'
                  value: 'customEvents | where name == "SessionCompleted" and customDimensions.status == "error" | where timestamp > ago(24h) | summarize count() by ErrorType=tostring(customDimensions.errorMessage) | order by count_ desc'
                }
                {
                  name: 'TimeRange'
                  value: 'P1D'
                }
              ]
              #disable-next-line BCP036
              type: 'Extension/Microsoft_OperationsManagementSuite_Workspace/PartType/LogsDashboardPart'
              settings: {
                content: {
                  Query: 'customEvents | where name == "SessionCompleted" and customDimensions.status == "error" | where timestamp > ago(24h) | summarize ErrorCount=count() by ErrorType=tostring(customDimensions.errorMessage) | order by ErrorCount desc'
                  ControlType: 'AnalyticsGrid'
                  PartTitle: 'Error Tracking (24h)'
                }
              }
            }
          }
        ]
      }
    ]
  }
}

output dashboardId string = dashboard.id
