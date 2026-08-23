# ── Build stage: bundle API + compile client ─────────────────────────────────
FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN npm install -g pnpm@10

# Workspace root manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.json tsconfig.base.json ./

# All workspace package manifests (required so pnpm can resolve the workspace)
COPY artifacts/api-server/package.json artifacts/api-server/tsconfig.json artifacts/api-server/
COPY artifacts/clinic-app/package.json artifacts/clinic-app/tsconfig.json artifacts/clinic-app/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json lib/api-client-react/tsconfig.json lib/api-client-react/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/tsconfig.json lib/api-zod/
COPY lib/db/package.json lib/db/tsconfig.json lib/db/
COPY lib/integrations-openai-ai-react/package.json lib/integrations-openai-ai-react/
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/
COPY scripts/package.json scripts/

# Install deps for the server (+ its workspace libs) and the client build toolchain
RUN pnpm install --frozen-lockfile --filter @workspace/api-server... --filter @workspace/clinic-app

# Sources needed to build both artifacts
COPY artifacts/api-server ./artifacts/api-server
COPY artifacts/clinic-app ./artifacts/clinic-app
COPY lib/db ./lib/db
COPY lib/api-zod ./lib/api-zod

# Bundle the API (esbuild)
RUN pnpm --filter @workspace/api-server build

# Compile the client (vite). vite.config.ts requires PORT and BASE_PATH at config time.
# BASE_PATH=/ serves the app from the site root, next to /api on the same origin.
RUN PORT=5173 BASE_PATH=/ pnpm --filter @workspace/clinic-app build

# ── Runtime stage: prod deps only + built output ─────────────────────────────
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

# Production dependencies only (small)
RUN pnpm install --frozen-lockfile --prod --filter @workspace/api-server...

# Built server bundle + compiled client served as static files
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/clinic-app/dist/public ./artifacts/api-server/dist/public

ENV NODE_ENV=production \
    PORT=8080

EXPOSE 8080

WORKDIR /app/artifacts/api-server

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
