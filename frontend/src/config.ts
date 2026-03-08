/**
 * Application configuration
 * Uses Vite environment variables for API endpoint configuration
 * Configure in .env.development and .env.production files
 */

// Get API base URL from environment or use defaults
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:3000' : '/');
const graphqlPath = import.meta.env.VITE_API_GRAPHQL_PATH || '/graphql';

/**
 * HTTP endpoint for GraphQL queries and mutations
 */
export const GRAPHQL_HTTP_URI = `${apiBaseUrl}${graphqlPath}`;

/**
 * WebSocket endpoint for GraphQL subscriptions
 * Uses secure WebSocket (wss) in production, regular (ws) in development
 */
export const GRAPHQL_WS_URI = import.meta.env.DEV
  ? `ws://${new URL(apiBaseUrl).host}${graphqlPath}`
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${graphqlPath}`;
