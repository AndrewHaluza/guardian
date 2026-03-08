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

# Build React app with Vite
# Use build args for API configuration
ARG VITE_API_BASE_URL=http://localhost:3000
RUN VITE_API_BASE_URL=${VITE_API_BASE_URL} npm run build

# Runtime stage - serve with serve (SPA-aware HTTP server)
FROM node:22-alpine

WORKDIR /app

# Install serve for serving SPA with proper routing
RUN npm install -g serve

# Copy built app from builder
COPY --from=builder /app/dist ./dist

# Expose port 5173 (Vite default port)
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5173 || exit 1

# Serve the app with SPA mode (-s flag)
# This serves index.html for all routes, enabling client-side routing
CMD ["serve", "-s", "dist", "-l", "5173"]
