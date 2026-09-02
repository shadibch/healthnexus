// HealthNexus Azure infrastructure - main entrypoint.
// Deploys: VNet, private PostgreSQL, private endpoint + DNS, ACR, and a
// VNet-integrated Container App (private network access to the DB).
@description('Primary Azure region for all resources.')
param location string

@description('Prefix applied to most resource names.')
param namePrefix string = 'hnx'

@description('PostgreSQL admin username.')
param postgresAdminLogin string

@secure()
@description('PostgreSQL admin password.')
param postgresAdminPassword string

@description('PostgreSQL database name.')
param postgresDatabaseName string = 'healthnexus'

@description('Session secret used for cookie signing in the app.')
@secure()
param sessionSecret string

@description('Public base URL of the app, used in verification/password-reset emails.')
param appBaseUrl string

// ── Derived names ──────────────────────────────────────────────────────────
var netName = '${namePrefix}-vnet'
var pgName = '${namePrefix}-pg'
var registryName = '${namePrefix}registry'
var envName = '${namePrefix}-env'
var appName = '${namePrefix}-app'
var workspaceName = '${namePrefix}-logs'
var pecName = '${namePrefix}-pe-pg'
var uamiName = '${namePrefix}-app-identity'

module network './modules/network.bicep' = {
  name: 'network'
  params: {
    name: netName
    location: location
  }
}

module postgres './modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    name: pgName
    location: location
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    databaseName: postgresDatabaseName
  }
}

module privateEndpoint './modules/private-endpoint.bicep' = {
  name: 'private-endpoint'
  params: {
    endpointName: pecName
    location: location
    subnetId: network.outputs.privateEndpointSubnetId
    serverId: postgres.outputs.serverId
    serverName: pgName
    vnetName: netName
    vnetId: network.outputs.vnetId
  }
}

module registry './modules/registry.bicep' = {
  name: 'registry'
  params: {
    name: registryName
    location: location
  }
}

// Build the host:port portion of the DATABASE_URL from the FQDN.
var pgHost = last(split(postgres.outputs.serverFqdn, ':'))
var databaseUrlText = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${pgHost}:${5432}/${postgresDatabaseName}?sslmode=require'

module containerApps './modules/container-apps.bicep' = {
  name: 'container-apps'
  params: {
    environmentName: envName
    appName: appName
    identityName: uamiName
    location: location
    subnetId: network.outputs.appSubnetId
    registryId: registry.outputs.registryId
    registryLoginServer: registry.outputs.loginServer
    imageName: 'healthnexus:latest'
    workspaceName: workspaceName
    appEnvVars: [
      {
        name: 'NODE_ENV'
        value: 'production'
      }
      {
        name: 'PORT'
        value: '8080'
      }
      {
        name: 'DATABASE_URL'
        value: databaseUrlText
      }
      {
        name: 'SESSION_SECRET'
        value: sessionSecret
      }
      {
        name: 'APP_BASE_URL'
        value: appBaseUrl
      }
    ]
  }
}

output databaseUrlHost string = pgHost
output containerAppFqdn string = containerApps.outputs.appFqdn
output containerRegistryLoginServer string = registry.outputs.loginServer
output imageName string = '${registry.outputs.loginServer}/healthnexus:latest'