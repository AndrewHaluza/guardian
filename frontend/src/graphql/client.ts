import { ApolloClient, InMemoryCache, HttpLink, split, ApolloLink } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { onError } from '@apollo/client/link/error';
import { GRAPHQL_HTTP_URI, GRAPHQL_WS_URI } from '../config';

/**
 * Retry configuration for failed requests
 * Uses exponential backoff: 1s, 2s, 4s
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  delay: 1000,
  getDelay: (attemptNumber: number) => {
    return Math.min(1000 * Math.pow(2, attemptNumber), 10000);
  },
};

/**
 * HTTP link with timeout configuration
 * Prevents indefinite hanging requests
 */
const httpLink = new HttpLink({
  uri: GRAPHQL_HTTP_URI,
  credentials: 'include',
  // Set 30 second timeout for HTTP requests
  fetchOptions: {
    signal: undefined,
  },
  fetch: (uri, options) => {
    // Create an AbortController with 30 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    return fetch(uri, { ...options, signal: controller.signal })
      .then((response) => {
        clearTimeout(timeoutId);
        return response;
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        throw error;
      });
  },
});

/**
 * WebSocket link with timeout handling
 */
const wsLink = new GraphQLWsLink(
  createClient({
    url: GRAPHQL_WS_URI,
    retryAttempts: 3,
    shouldRetry: () => true,
    keepAlive: 30_000,
  })
);

/**
 * Error handling link with retry logic
 * Automatically retries failed operations with exponential backoff
 * Logs errors and provides user-friendly messages
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const errorLink = onError((options: any) => {
  const { graphQLErrors, networkError, operation, forward } = options;
  let shouldRetry = false;
  let retryCount = (operation.getContext().retryCount || 0) as number;

  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }: any) => {
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
      );
    });
  }

  if (networkError) {
    const isServerError = 'statusCode' in networkError && networkError.statusCode! >= 500;
    const isTimeout = 'name' in networkError && networkError.name === 'AbortError';
    const isNetworkError = !('statusCode' in networkError);

    // Retry on server errors, timeouts, and network errors (not on 401, 403, etc.)
    shouldRetry = (isServerError || isTimeout || isNetworkError) && retryCount < RETRY_CONFIG.maxRetries;

    if ('statusCode' in networkError && networkError.statusCode === 401) {
      console.error('[Network error]: Unauthorized. Please log in again.');
    } else if (isTimeout) {
      console.error('[Network error]: Request timeout. Server is taking too long to respond.');
      if (shouldRetry) {
        console.log(`[Retry] Retrying operation (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries})`);
      }
    } else {
      console.error('[Network error]:', networkError);
      if (shouldRetry) {
        console.log(`[Retry] Retrying operation (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries})`);
      }
    }
  }

  if (shouldRetry) {
    const delay = RETRY_CONFIG.getDelay(retryCount);
    retryCount += 1;

    return new Promise((resolve) => {
      setTimeout(() => {
        // Update retry count in operation context
        operation.setContext((context: any) => ({
          ...context,
          retryCount,
        }));
        resolve(forward(operation));
      }, delay);
    });
  }

  return forward(operation);
});

/**
 * Split link to route subscriptions through WebSocket and other operations through HTTP
 */
const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink
);

/**
 * Combine error link with split link
 */
const link = ApolloLink.from([errorLink, splitLink]);

/**
 * Apollo Client instance with error handling and timeout configuration
 */
export const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
  // Enable logging in development
  ...(import.meta.env.DEV && { connectToDevTools: true }),
});
