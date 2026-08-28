FROM node:22-bookworm-slim

WORKDIR /app

RUN npm install -g pnpm@10

# Workspace root manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# All workspace package manifests (required so pnpm can resolve the workspace)
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/clinic-app/package.json artifacts/clinic-app/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/db/package.json lib/db/
COPY lib/integrations-openai-ai-react/package.json lib/integrations-openai-ai-react/
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/
COPY scripts/package.json scripts/

# Install only @workspace/db and its workspace dependencies
RUN pnpm install --frozen-lockfile --filter @workspace/db...

# Full sources (schema, migrations + drizzle config)
COPY lib/db ./lib/db

# Applies committed, journal-tracked Drizzle migrations
CMD ["sh", "-c", "pnpm --filter @workspace/db db:migrate"]
