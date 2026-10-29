# The owner portal. Its own image, because it is its own service with its own
# database — it holds the registry of who bought the portal and never anything
# from inside a customer's deployment.
#
# No build step: the console is server-rendered and Node 22 strips the types,
# so what ships is the source.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations

USER node
EXPOSE 4500

# Checks the database, so an instance that cannot reach Postgres reports
# unhealthy rather than "up" — the same rule the portal's own health check
# follows one tier down.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4500/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# node runs the TypeScript directly, so SIGTERM reaches the server itself and
# the graceful shutdown in index.ts actually runs.
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "src/index.ts"]
