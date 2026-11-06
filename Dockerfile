# syntax=docker/dockerfile:1

# Node 20.20.2 matches backend/package.json engines (>=20 <21).
# Digest pins the bookworm-slim image pulled for this file.
ARG NODE_IMAGE=node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

FROM ${NODE_IMAGE} AS frontend-build
WORKDIR /src/frontend
RUN --mount=type=bind,source=frontend/package.json,target=package.json \
    --mount=type=bind,source=frontend/package-lock.json,target=package-lock.json \
    --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=cache,target=/root/.npm \
    npm ci
COPY frontend/ ./
RUN npm run build

FROM ${NODE_IMAGE} AS backend-build
WORKDIR /src/backend
RUN --mount=type=bind,source=backend/package.json,target=package.json \
    --mount=type=bind,source=backend/package-lock.json,target=package-lock.json \
    --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=cache,target=/root/.npm \
    npm ci
COPY backend/ ./
RUN npm run build

# Runtime dependencies, plus the TypeScript runner used by
# `npm run migration:run` (typeorm-ts-node-commonjs on migrations/*.ts).
FROM ${NODE_IMAGE} AS backend-deps
WORKDIR /src/backend
RUN --mount=type=bind,source=backend/package.json,target=package.json \
    --mount=type=bind,source=backend/package-lock.json,target=package-lock.json \
    --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev \
 && npm install --no-save --package-lock=false \
      typescript@5.9.3 \
      ts-node@10.9.2 \
      dotenv@16.6.1 \
      @types/node@24.13.6

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

RUN addgroup --system --gid 1001 appgroup \
 && adduser --system --uid 1001 --ingroup appgroup --home /home/appuser --no-create-home appuser \
 && mkdir -p /home/appuser /app/backend/uploads \
 && chown 1001:1001 /home/appuser /app/backend /app/backend/uploads

COPY --link --from=backend-deps --chown=1001:1001 /src/backend/node_modules /app/backend/node_modules
COPY --link --from=backend-build --chown=1001:1001 /src/backend/dist /app/backend/dist
COPY --link --chown=1001:1001 backend/package.json /app/backend/package.json
COPY --link --chown=1001:1001 backend/tsconfig.json /app/backend/tsconfig.json
COPY --link --chown=1001:1001 backend/migrations /app/backend/migrations
COPY --link --chown=1001:1001 backend/src /app/backend/src
COPY --link --from=frontend-build --chown=1001:1001 /src/frontend/dist /app/frontend/dist
COPY --link --chmod=755 docker/entrypoint.sh /entrypoint.sh

RUN chown 1001:1001 /app/backend /app/backend/uploads

ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=uploads \
    HOME=/home/appuser \
    npm_config_cache=/tmp/npm-cache

USER 1001:1001
WORKDIR /app/backend
EXPOSE 3000

LABEL org.opencontainers.image.source="https://github.com/marksen23/multimarkt" \
      org.opencontainers.image.title="multimarkt" \
      org.opencontainers.image.description="Personal Resale OS — NestJS serves the built React frontend"

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/entrypoint.sh"]
