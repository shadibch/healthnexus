// Virtual Network with subnets for the Container Apps environment and private endpoints.
@description('Name of the virtual network.')
param name string

@description('Azure region for resources.')
param location string

@description('CIDR for the virtual network address space.')
param addressPrefix string = '10.0.0.0/16'

@description('CIDR for the private-endpoint subnet.')
param privateEndpointSubnetPrefix string = '10.0.1.0/24'

@description('CIDR for the Container Apps environment (infrastructure) subnet.')
param appSubnetPrefix string = '10.0.2.0/23'

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: name
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        addressPrefix
      ]
    }
    subnets: [
      {
        name: 'snet-private-endpoints'
        properties: {
          addressPrefix: privateEndpointSubnetPrefix
        }
      }
      {
        name: 'snet-app'
        properties: {
          addressPrefix: appSubnetPrefix
          delegations: [
            {
              name: 'delegation-app'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
    ]
  }
}

output vnetId string = vnet.id
output appSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', name, 'snet-app')
output privateEndpointSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', name, 'snet-private-endpoints')
