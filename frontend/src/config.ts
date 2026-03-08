/**
 * Application configuration
 * Uses Vite environment variables for API endpoint configuration
 * Configure in .env.development and .env.production files
 */

const graphqlPath = import.meta.env.VITE_API_GRAPHQL_PATH || '/graphql';

/**
 * Determine API base URL and build both HTTP and WebSocket URIs
 */
function getApiUris() {
  // If explicitly set via environment, use it
  if (import.meta.env.VITE_API_BASE_URL) {
    const baseUrl = import.meta.env.VITE_API_BASE_URL;
    const urlObj = new URL(baseUrl);
    return {
      http: `${baseUrl}${graphqlPath}`,
      ws: `${urlObj.protocol === 'https:' ? 'wss:' : 'ws:'}//${urlObj.host}${graphqlPath}`,
    };
  }

  // In production, use relative paths
  if (!import.meta.env.DEV) {
    return {
      http: graphqlPath,
      ws: `${typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${typeof window !== 'undefined' ? window.location.host : 'localhost'}${graphqlPath}`,
    };
  }

  // In development, build full URLs using current window location
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;

    // For localhost development, use port 3000 for API
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return {
        http: `${protocol}//localhost:3000${graphqlPath}`,
        ws: `ws://localhost:3000${graphqlPath}`,
      };
    }

    // For other hosts, use same host with port 3000
    return {
      http: `${protocol}//${hostname}:3000${graphqlPath}`,
      ws: `${protocol === 'https:' ? 'wss:' : 'ws:'}//${hostname}:3000${graphqlPath}`,
    };
  }

  // Fallback
  return {
    http: `http://localhost:3000${graphqlPath}`,
    ws: `ws://localhost:3000${graphqlPath}`,
  };
}

const { http: GRAPHQL_HTTP_URI, ws: GRAPHQL_WS_URI } = getApiUris();

/**
 * HTTP endpoint for GraphQL queries and mutations
 */
export { GRAPHQL_HTTP_URI };

/**
 * WebSocket endpoint for GraphQL subscriptions
 * Uses secure WebSocket (wss) in production, regular (ws) in development
 */
export { GRAPHQL_WS_URI };
