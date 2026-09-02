# HealthNexus Azure Infrastructure

This deploys the HealthNexus application on Azure with a **private** database
(no public network access):

- Resource group (e.g. `healthcams-uaenorth`)
- Virtual network with subnets for Container Apps + private endpoints
- **Azure Database for PostgreSQL – Flexible Server** (`publicNetworkAccess: Disabled`)
- Private endpoint + private DNS zone (`privatelink.postgres.database.azure.com`)
- Azure Container Registry (for the Docker image)
- Azure Container Apps environment (VNet-integrated) + the app with a
  user-assigned managed identity that pulls the image from ACR

The app connects to PostgreSQL **over the private network only** — the server
is not reachable from the public internet.

> **Region note:** PostgreSQL Flexible Server provisioning is **restricted** in
> `germanywestcentral` for some subscriptions ("Provisioning is restricted in
> this region"). If you hit that error, use an unrestricted region such as
> `uaenorth`, `westeurope`, `northeurope`, or `westus2`.

## Directory layout

```
infra/
  bicep/
    main.bicep                # top-level orchestration
    modules/
      network.bicep           # VNet + subnets
      postgres.bicep          # Flexible Server (no public access)
      private-endpoint.bicep  # private endpoint + private DNS zone + A record
      registry.bicep          # Azure Container Registry
      container-apps.bicep    # ACA environment + app + managed identity
  parameters/
    main.parameters.json      # optional parameter file (Key Vault references)
  scripts/
    deploy-infra.ps1          # create RG + deploy Bicep
    build-and-push.ps1        # build & push Docker image + redeploy app
```

## Deployment

### 1. Deploy the infrastructure

```powershell
# In PowerShell, from the repo root:
$secPw = Read-Host -AsSecureString "Postgres admin password"
$secSecret = Read-Host -AsSecureString "Session secret"

& ./infra/scripts/deploy-infra.ps1 `
    -ResourceGroupName "healthcams-uaenorth" `
    -Location "uaenorth" `
    -NamePrefix "hnx" `
    -PostgresAdminLogin "hnxadmin" `
    -PostgresAdminPassword $secPw `
    -SessionSecret $secSecret `
    -AppBaseUrl "https://<your-app-fqdn>"
```

Capture the printed outputs (ACA FQDN, ACR login server, image name). Set the
real FQDN as `APP_BASE_URL` on the container app afterwards:

```powershell
az containerapp update -n hnx-app -g healthcams-uaenorth `
    --set-env-vars APP_BASE_URL="https://<your-app-fqdn>"
```

### 2. Build & push the Docker image plus redeploy the app

```powershell
& ./infra/scripts/build-and-push.ps1 `
    -ResourceGroupName "healthcams-uaenorth" `
    -RegistryName "hnxregistry" `
    -ContainerAppName "hnx-app"
```

> Note: the deployed image on ACR is `hnxregistry.azurecr.io/healthnexus:<tag>`.
> The build helper pushes `latest`; if you want to force a new Container App
> revision, push a distinct tag (e.g. a timestamp) and
> `az containerapp update --image hnxregistry.azurecr.io/healthnexus:<tag>`.

The app's user-assigned identity (`AcrPull` role on the registry) pulls the
image, so no ACR admin credentials are needed at runtime.

### 3. Verify

- Health check: `https://<app-fqdn>/api/healthz` returns `200`.
- Emails (verification / password reset): set the email env vars on the
  Container App (`SMTP_*`, `HOSTINGER_MAIL_API_TOKEN`, etc.) if desired.

## Notes & security

- PostgreSQL public access is **disabled**; only the private endpoint is used.
  The app resolves the server via the private DNS A record `hnx-pg` in the
  `privatelink.postgres.database.azure.com` zone.
- Schema management uses `drizzle-kit push` at container boot
  (`docker/start-api.sh`), which is idempotent. The committed `./drizzle`
  migrations are delta snapshots that assume the base tables exist, so a fresh
  datastore is bootstrapped via schema push (they are not re-run to avoid
  duplicate-constraint errors).
- The AI Assistant feature is optional; the server now starts without
  `OPENAI_API_KEY` (a lazy client is created only when the feature is used).
- For production, change the B1ms SKU in `modules/postgres.bicep` and add a
  proper high-availability / larger storage configuration.
- The `main.parameters.json` file uses Key Vault references; adjust to your
  vault. The CLI script passes secrets as parameters instead.
- The deployed `DATABASE_URL` contains the Postgres admin password in the
  Container App environment. For production, consider granting the app a
  dedicated database user (least privilege) instead of the admin account.
