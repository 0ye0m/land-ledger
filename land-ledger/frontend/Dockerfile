# syntax=docker/dockerfile:1

###############################################################################
# LAND LEDGER — Frontend (React + Vite) image, served by nginx
# Build context: ./frontend  (docker build -t land-ledger-frontend:latest ./frontend)
###############################################################################

############################
# Stage 1 — build
############################
FROM node:20-alpine AS build

WORKDIR /app

# Install pinned dependencies first (cached layer)
COPY package*.json ./
RUN npm ci

# Copy the rest of the frontend sources (.dockerignore excludes node_modules/dist)
COPY . .

# Vite production build -> /app/dist
RUN npm run build

############################
# Stage 2 — runtime (nginx)
############################
FROM nginx:1.27-alpine AS runtime

# Reverse proxy: serve SPA, forward /api/ and /uploads/ to backend:3000
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets from the Vite build
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
