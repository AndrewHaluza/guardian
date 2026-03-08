# Guardian Frontend

React application for visualizing security vulnerability scans. Real-time updates via GraphQL subscriptions, comprehensive testing, and 100% TypeScript coverage.

## Features

- Real-time scan status updates via WebSocket
- Type-safe GraphQL integration (Apollo Client)
- Full accessibility (WCAG 2.1 AA)
- Comprehensive error handling
- 141 unit tests (96.8% coverage)
- Production-ready build

## Quick Start

### Prerequisites
- Node.js 22+
- Backend running on http://localhost:3000

### Install & Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5174
npm test -- --run  # Run all tests
npm run build      # Production build
```

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.3+ |
| Framework | React | 18.2+ |
| Routing | React Router | 7.13+ |
| GraphQL | Apollo Client | 4.1+ |
| Real-time | graphql-ws | 6.0+ |
| Build | Vite | 5.0+ |
| Testing | Vitest | 4.0+ |

## Project Structure

```
src/
├── pages/           # Home, ScanDetails
├── components/      # VulnerabilityCard, ScanStatus, ErrorBoundary
├── hooks/           # usePagination, useGraphQLError
├── graphql/         # Apollo client, queries, schema
├── utils/           # Validation, helpers
└── constants/       # App constants
```

## Testing

```bash
npm test                # Watch mode
npm test -- --run       # Single run
npm test:ui            # Interactive dashboard
npm run test:coverage  # Coverage report
```

**Current Coverage:**
- Statements: 96.8%
- Branches: 89.88%
- Functions: 90.32%
- Lines: 96.73%

## Configuration

Environment variables in `.env.development` and `.env.production`:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_API_GRAPHQL_PATH=/graphql
```

## Key Components

- **Home.tsx** - Start scan with URL validation
- **ScanDetails.tsx** - View results with pagination and real-time updates
- **VulnerabilityCard.tsx** - Individual vulnerability display
- **ErrorBoundary.tsx** - Error handling and recovery
- **usePagination** - Reusable pagination logic
- **validateRepoUrl** - URL validation (100% test coverage)

## Version

