# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY vite.config.ts ./
COPY index.html ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY public ./public 2>/dev/null || true

# Build React app with Vite
RUN npm run build

# Runtime stage - serve with simple HTTP server
FROM node:22-alpine

WORKDIR /app

# Install http-server for serving static files
RUN npm install -g http-server

# Copy built app from builder
COPY --from=builder /app/dist ./dist

# Expose port 5173 (Vite default port)
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5173 || exit 1

# Serve the app
# Use http-server to serve the dist folder on port 5173
CMD ["http-server", "dist", "-p", "5173", "--cors"]
