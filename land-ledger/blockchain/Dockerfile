# syntax=docker/dockerfile:1

###############################################################################
# LAND LEDGER — Hardhat local blockchain node
# Build context: ./blockchain  (docker build -t land-ledger-blockchain:latest ./blockchain)
# Exposes a JSON-RPC node on 0.0.0.0:8545 (single persistent local chain).
###############################################################################

FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci

# Copy contracts, deployment scripts, tests and the Hardhat config
COPY contracts ./contracts
COPY scripts ./scripts
COPY test ./test
COPY hardhat.config.js ./hardhat.config.js

# Hardhat compiles at startup (artifacts/, cache/) -> give the node user write access
RUN chown -R node:node /app

# Non-root is straightforward here, so use the built-in node user
USER node

EXPOSE 8545

# Bind to 0.0.0.0 so the compose network (and host port map) can reach the RPC
CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0", "--port", "8545"]
