# Code Guardian — Security Scanning Service

Backend service wrapping Trivy for vulnerability scanning. Handles massive reports (500MB+) under strict memory constraints (256MB RAM).

## Features

- Scans Git repositories asynchronously
- Processes 100K+ vulnerabilities without crashing
- Pre-warmed worker thread pool (~2MB overhead per thread)
- Stream-based JSON parsing (not JSON.parse)
- REST + GraphQL API with real-time WebSocket subscriptions
- Configurable severity filtering (CRITICAL, HIGH, MEDIUM, LOW, UNKNOWN)
- MongoDB persistence with 7-day TTL
- Type-safe TypeScript throughout

## Quick Start

### Prerequisites

- Node.js 22+ with npm 10+
- Git (for cloning repositories)
- MongoDB (local or Docker)
- Trivy security scanner

### Install & Run

```bash
# Install Git
brew install git            # macOS
# apt-get install git       # Ubuntu/Debian
# winget install Git.Git    # Windows

# Install Trivy
brew install trivy          # macOS
# or: curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Start MongoDB
mongod --dbpath ~/data/mongodb &

# Install and run Guardian
cd guardian
npm install
npm start
# Connects to mongodb://localhost:27017/guardian on port 3000
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.3+ |
| Runtime | Node.js 22+ |
| Database | MongoDB |
| Server | Express |
| Scanning | Trivy |
| Concurrency | worker_threads |
| Testing | Mocha + Chai + Sinon |

## API Endpoints

### REST API

```bash
# Start scan
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/example/repo"}'

# Get status
curl http://localhost:3000/api/scan/{scanId}

# Delete scan
curl -X DELETE http://localhost:3000/api/scan/{scanId}

# Health check
curl http://localhost:3000/api/health
```

### GraphQL API

```bash
# HTTP
POST http://localhost:3000/graphql
Content-Type: application/json

# WebSocket subscriptions
ws://localhost:3000/graphql
```

**Example Query:**
```graphql
query {
  scan(id: "550e8400-e29b-41d4-a716-446655440000") {
    id
    status
    repoUrl
    results { Severity VulnerabilityID Title PkgName }
  }
}
```

**Example Mutation:**
```graphql
mutation {
  startScan(repoUrl: "https://github.com/owner/repo") {
    id
    status
    createdAt
  }
}
```

**Example Subscription:**
```graphql
subscription {
  scanStatus(id: "550e8400-e29b-41d4-a716-446655440000") {
    id
    status
    updatedAt
    results { Severity VulnerabilityID Title }
  }
}
```

## Configuration

Optional environment variables:

```env
GUARDIAN_MONGODB_URI=mongodb://localhost:27017/guardian
GUARDIAN_PORT=3000
GUARDIAN_MAX_CONCURRENT_SCANS=3
GUARDIAN_MIN_FREE_DISK_MB=512
GUARDIAN_MAX_FINDINGS=500
GUARDIAN_MIN_SEVERITY=CRITICAL
GUARDIAN_TRIVY_TIMEOUT=300000
GUARDIAN_GIT_TIMEOUT=120000
LOG_LEVEL=info
```

## Architecture

```
REST API ────────→ Controller ────────→ Service
                                          ↓
GraphQL API ────→ Resolvers ────────→ Worker Pool
                                          ↓
                                   [Git + Trivy + Stream Parse]
                                          ↓
                                      Repository (MongoDB)
                                          ↓
                                      Event Bridge → PubSub
                                                      ↓
                                              WebSocket Subscriptions
```

### Key Components

- **Controller** (`src/controller/scan.controller.ts`) - HTTP request handling
- **Service** (`src/service/scan.service.ts`) - Scan orchestration & limiting
- **Worker Pool** (`src/worker/scan.pool.ts`) - Pre-warmed thread pool (3 threads)
- **Worker** (`src/worker/scan.worker.ts`) - Git + Trivy + stream parsing
- **Repository** (`src/repository/scan.repository.ts`) - MongoDB CRUD
- **Event Bridge** (`src/graphql/event-bridge.ts`) - REST/GraphQL decoupling

## Memory Efficiency

Worker threads use ~2 MB per worker vs ~45 MB for child processes (43 MB savings × 3 workers). Stream-based JSON parsing processes 100K+ vulnerabilities under 120MB peak heap, avoiding JSON.parse crashes at 256MB limit.

## Testing

```bash
npm test                    # Unit tests (fast, no MongoDB)
npm run test:e2e           # E2E tests (requires MongoDB)
npm run test:all           # Both
npm run coverage           # Generate coverage report (HTML + text)
```

**Test Suite:**
- **124 unit tests** (all passing ✅)
- Full integration test coverage including lifecycle transitions
- Memory constraint validation stress tests

**Code Coverage:**
| Component | Statements | Branches | Functions |
|-----------|-----------|----------|-----------|
| **Overall** | 73.06% | 68.42% | 76.74% |
| scan.worker.ts | 69.26% | 68.08% | 82.75% |
| scan.pool.ts | 97.43% | 95.65% | 94.44% |
| scan.service.ts | 86.66% | 100% | 60% |

**Generate coverage report:**
```bash
npm run coverage
open coverage/index.html
```

## Troubleshooting

**"Git: command not found"**
```bash
brew install git    # or see Prerequisites above
git version         # Verify installation
```

**"Trivy: command not found"**
```bash
brew install trivy  # or see Prerequisites above
trivy version       # Verify installation
```

**"MongoDB connection failed"**
```bash
mongod --version           # Check installed
mongod --dbpath ~/data/mongodb &  # Start it
```

**"Server at maximum concurrent scans (3)"**
Wait for a scan to complete or increase `GUARDIAN_MAX_CONCURRENT_SCANS`.

**Memory exceeds 256MB**
Verify stream-json pipeline is used (not JSON.parse) and Trivy fixture is reasonable size.

## Performance

- **POST /api/scan:** < 200ms (non-blocking)
- **GET /api/scan/:id:** < 50ms (DB lookup)
- **Scan duration:** 10-30s (small repos), 30-120s (medium), 2-5m (large)
- **Concurrent limit:** 3 scans per instance (memory-constrained)

