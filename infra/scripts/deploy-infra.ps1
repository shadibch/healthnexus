<#
.SYNOPSIS
Deploys the HealthNexus Azure infrastructure (VNet, private PostgreSQL,
private endpoint + DNS, ACR, and a VNet-integrated Container App).

.DESCRIPTION
This script:
  1. Creates a resource group in the target region.
  2. Deploys main.bicep (resources remain private/not-publicly accessible).
  3. Prints the container registry login server + image name to use when
     building/pushing the application Docker image.

Secrets (postgres admin login/password and session secret) are read securely.

.PARAMETER ResourceGroupName
Name of the resource group to create/deploy to.

.PARAMETER Location
Azure region, e.g. germanywestcentral.

.PARAMETER NamePrefix
Short prefix used to build resource names (e.g. hnx).

.PARAMETER PostgresAdminLogin
PostgreSQL admin username.

.PARAMETER PostgresAdminPassword
PostgreSQL admin password (secure).

.PARAMETER SessionSecret
Secret used to sign the app session cookie (secure).

.PARAMETER AppBaseUrl
Public base URL of the app (verification / password-reset emails).
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter(Mandatory = $true)]
    [string]$Location,

    [Parameter(Mandatory = $false)]
    [string]$NamePrefix = 'hnx',

    [Parameter(Mandatory = $true)]
    [string]$PostgresAdminLogin,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ "$_" -ne '' })]
    [securestring]$PostgresAdminPassword,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ "$_" -ne '' })]
    [securestring]$SessionSecret,

    [Parameter(Mandatory = $true)]
    [string]$AppBaseUrl
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bicepPath = Join-Path $scriptDir '..\bicep\main.bicep'

Write-Host "Creating resource group '$ResourceGroupName' in '$Location'..." -ForegroundColor Cyan
az group create --name $ResourceGroupName --location $Location --output none | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to create resource group.' }

$postgresPassword = (New-Object System.Net.NetworkCredential '', $PostgresAdminPassword).Password
$sessionSecretPlain = (New-Object System.Net.NetworkCredential '', $SessionSecret).Password

Write-Host 'Deploying infrastructure (this can take several minutes)...' -ForegroundColor Cyan
$deployArgs = @(
    'deployment', 'group', 'create',
    '--resource-group', $ResourceGroupName,
    '--template-file', $bicepPath,
    '--parameters',
    "location=$Location",
    "namePrefix=$NamePrefix",
    "postgresAdminLogin=$PostgresAdminLogin",
    "postgresAdminPassword=$postgresPassword",
    "sessionSecret=$sessionSecretPlain",
    "appBaseUrl=$AppBaseUrl"
)

az @deployArgs --output json | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Bicep deployment failed.' }

Write-Host ''
Write-Host '=== Deployment complete ===' -ForegroundColor Green
Write-Host 'Resources deployed to resource group:' $ResourceGroupName
Write-Host ''
Write-Host 'Next step: build and push the Docker image using build-and-push.ps1'