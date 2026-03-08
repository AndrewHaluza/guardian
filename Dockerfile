# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Install git, curl, and download Trivy
RUN apk add --no-cache git curl && \
    curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin && \
    # Pre-download Trivy vulnerability database to avoid runtime delays/OOM in memory-constrained environments
    trivy image --download-db-only

# Copy package files from builder
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Create temp directory for git clones and scan outputs
RUN mkdir -p /tmp/guardian-scans

# Expose port 3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Run the app with memory constraints
# This respects Docker's memory limit (200m) and Node.js will use --max-old-space-size=150
ENV NODE_OPTIONS="--max-old-space-size=150"

CMD ["node", "dist/index.js"]
