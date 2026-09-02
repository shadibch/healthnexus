// Azure Database for PostgreSQL - Flexible Server with public network access disabled.
// Access is provided exclusively through a private endpoint (see private-endpoint.bicep).
@description('Name of the PostgreSQL flexible server.')
param name string

@description('Azure region for the server.')
param location string

@description('PostgreSQL admin username.')
param administratorLogin string

@secure()
@description('PostgreSQL admin password.')
param administratorLoginPassword string

@description('PostgreSQL database name to create.')
param databaseName string = 'healthnexus'

@description('Compute SKU tier. Burstable for dev/test, GeneralPurpose for production.')
@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
param skuTier string = 'Burstable'

@description('Compute SKU name (size).')
param skuName string = 'Standard_B1ms'

@description('Storage size in GB.')
param storageSizeGB int = 32

@description('PostgreSQL major version.')
param postgresVersion string = '16'

@description('Backup retention days.')
param backupRetentionDays int = 7

@description('Enable Geo-redundant backups.')
param geoRedundantBackup bool = false

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: name
  location: location
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    version: postgresVersion
    storage: {
      storageSizeGB: storageSizeGB
    }
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: geoRedundantBackup ? 'Enabled' : 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Disabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: server
  name: databaseName
  properties: {}
}

// Firewall on the server excludes all public addresses even if a rule is added.
// No firewall rules are created because public access is disabled entirely.

output serverFqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = databaseName
output serverId string = server.id
