# syntax=docker/dockerfile:1

###############################################################################
# LAND LEDGER — Backend (Express API) image
# Build context: ./backend  (docker build -t land-ledger-backend:latest ./backend)
###############################################################################

############################
# Stage 1 — build deps
############################
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (cached layer; requires package-lock.json)
COPY package*.json ./
RUN npm ci --omit=dev=false

# Copy application source, tests and any other project files
# (.dockerignore keeps node_modules / .env / uploads out of the context)
COPY src ./src
COPY tests ./tests
COPY . .

############################
# Stage 2 — runtime
############################
FROM node:20-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Runtime needs only: dependencies, source, package metadata
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./package.json

# Volume-friendly uploads directory, owned by the unprivileged app user.
# (Compose mounts the named volume "uploads" here; in k8s mount a PVC/emptyDir.)
RUN mkdir -p /app/uploads && chown -R node:node /app
VOLUME ["/app/uploads"]

# Run as non-root user (built-in "node" user in the official image)
USER node

EXPOSE 3000

# Liveness of the HTTP server; busybox wget ships with alpine
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health >/dev/null 2>&1 || exit 1

CMD ["node", "src/server.js"]
