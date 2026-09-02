// Private endpoint for the PostgreSQL server plus the private DNS zone
// (privatelink.postgres.database.azure.com) and A records so the app can resolve
// the server hostname over the private network.
@description('Name of the private endpoint.')
param endpointName string

@description('Name of the private DNS zone.')
param dnsZoneName string = 'privatelink.postgres.database.azure.com'

@description('Azure region for resources.')
param location string

@description('ID of the subnet where the private endpoint will be placed.')
param subnetId string

@description('Resource ID of the PostgreSQL flexible server.')
param serverId string

@description('Name of the PostgreSQL server (used for the private DNS A record).')
param serverName string

@description('Name of the virtual network the private DNS zone links to.')
param vnetName string

@description('ID of the virtual network.')
param vnetId string

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: endpointName
  location: location
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${endpointName}-connection'
        properties: {
          privateLinkServiceId: serverId
          groupIds: [
            'postgresqlServer'
          ]
        }
      }
    ]
  }
}

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: dnsZoneName
  location: 'global'
}

resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZone
  name: '${vnetName}-link'
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnetId
    }
    registrationEnabled: false
  }
}

resource dnsARecord 'Microsoft.Network/privateDnsZones/A@2020-06-01' = {
  parent: privateDnsZone
  name: serverName
  properties: {
    ttl: 300
    aRecords: [
      {
        ipv4Address: privateEndpoint.properties.customDnsConfigs[0].ipAddresses[0]
      }
    ]
  }
}

output privateDnsZoneId string = privateDnsZone.id
