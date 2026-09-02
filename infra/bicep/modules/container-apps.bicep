// Azure Container Apps environment (VNet integrated) + the HealthNexus app.
// The app uses a user-assigned managed identity (granted AcrPull) to pull the
// image from the registry, so no admin credentials are stored.
@description('Name of the Container App environment.')
param environmentName string

@description('Name of the Container App.')
param appName string

@description('Name of the user-assigned managed identity for the app.')
param identityName string

@description('Azure region for resources.')
param location string

@description('ID of the infrastructure subnet used by the Container Apps environment.')
param subnetId string

@description('ID of the Container Registry the image is pulled from.')
param registryId string

@description('Login server (hostname) of the container registry.')
param registryLoginServer string

@description('Name and tag of the image, e.g. healthnexus:latest.')
param imageName string

@description('Log Analytics workspace name for the environment diagnostics.')
param workspaceName string

@description('App environment variables (excluding DATABASE_URL, built externally).')
param appEnvVars array = []

resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: workspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

resource environment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: subnetId
    }
  }
}

resource app 'Microsoft.App/containerApps@2023-05-01' = {
  name: appName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
      }
      registries: [
        {
          server: registryLoginServer
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: appName
          image: '${registryLoginServer}/${imageName}'
          env: appEnvVars
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// Reference the (externally created) registry so the pull role can be scoped to it.
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: last(split(registryId, '/'))
}

// Grant the app's user-assigned identity the AcrPull role on the registry
// so it can pull images (scoped to the registry, not the app).
resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registryId, identity.id, 'acrpull')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output appFqdn string = app.properties.latestRevisionFqdn
output appId string = app.id
