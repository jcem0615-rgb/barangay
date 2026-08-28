# Builds the web app and runs the API that serves it. One image, one process:
# the SPA is served same-origin by the API, so there is no CORS to configure in
# production and nothing to keep in sync between two deployments.

# ---- build the web app ----
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
# Baked in at build time: Vite inlines VITE_* at compile, it cannot be changed
# by an env var at runtime. Empty means "same origin", which is what we want
# when the API serves this bundle.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- install server production deps ----
FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/
COPY server/src ./server/src
COPY server/migrations ./server/migrations
# The seed script reads the office/service catalogue from the web app's source,
# so those two files ship too — they are the authoring source for the database.
COPY src/data ./src/data
COPY src/types.ts ./src/types.ts
COPY --from=web /app/dist ./dist

# Never run as root.
USER node

EXPOSE 4000
# The health check hits the endpoint that verifies Postgres, so an instance
# that cannot reach its database is reported unhealthy rather than "up".
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/server
# node runs the TypeScript directly (Node 22 strips types), so there is no
# build step and no wrapper process — SIGTERM reaches the server itself, which
# is what makes the graceful shutdown above actually work in a container.
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "src/index.ts"]
