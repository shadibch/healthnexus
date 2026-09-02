<#
.SYNOPSIS
Builds the HealthNexus Docker image and pushes it to the Azure Container
Registry (ACR) created by the infrastructure deployment.

.PARAMETER ResourceGroupName
Name of the resource group containing the ACR.

.PARAMETER RegistryName
Name of the Azure Container Registry (e.g. hnxregistry).

.PARAMETER ImageTag
Tag for the image. Defaults to 'latest'.

.PARAMETER ContainerAppName
Name of the Container App whose revision should be restarted/redeployed to pull
the newly pushed image.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter(Mandatory = $true)]
    [string]$RegistryName,

    [Parameter(Mandatory = $false)]
    [string]$ImageTag = 'latest',

    [Parameter(Mandatory = $false)]
    [string]$ContainerAppName
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\..\..')

Write-Host "Logging into ACR '$RegistryName'..." -ForegroundColor Cyan
az acr login --name $RegistryName | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'ACR login failed.' }

$image = "${RegistryName}.azurecr.io/healthnexus:${ImageTag}"

Write-Host "Building image '$image' (this may take a while)..." -ForegroundColor Cyan
& docker build -f "$repoRoot\docker\api-server.Dockerfile" -t $image "$repoRoot"
if ($LASTEXITCODE -ne 0) { throw 'Docker build failed.' }

Write-Host "Pushing image '$image'..." -ForegroundColor Cyan
& docker push $image
if ($LASTEXITCODE -ne 0) { throw 'Docker push failed.' }

if ($ContainerAppName) {
    Write-Host "Redeploying Container App '$ContainerAppName'..." -ForegroundColor Cyan
    az containerapp update `
        --name $ContainerAppName `
        --resource-group $ResourceGroupName `
        --image $image | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Container App update failed.' }
    Write-Host 'Container App redeployed.' -ForegroundColor Green
}

Write-Host 'Done.' -ForegroundColor Green