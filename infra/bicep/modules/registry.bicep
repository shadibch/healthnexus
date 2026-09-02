// Azure Container Registry for hosting the HealthNexus Docker image.
@description('Name of the container registry (must be globally unique, lowercase alphanumeric).')
param name string

@description('Azure region for the registry.')
param location string

@description('Registry SKU.')
@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param sku string = 'Basic'

@description('Enable the registry admin account for simple image push (dev/test convenience).')
param adminUserEnabled bool = false

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  sku: {
    name: sku
  }
  properties: {
    adminUserEnabled: adminUserEnabled
    dataEndpointEnabled: false
    zoneRedundancy: 'Disabled'
  }
}

output registryId string = registry.id
output loginServer string = registry.properties.loginServer
output name string = registry.name
