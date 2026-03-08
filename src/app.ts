import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { ApolloServer } from '@apollo/server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { createGuardianRouter } from './router';
import { IScanPool } from './worker/scan.pool';
import { typeDefs } from './graphql/schema';
import { createResolvers } from './graphql/resolvers';
import { pubsub } from './graphql/pubsub';
import { wirePoolEventsToPubSub } from './graphql/event-bridge';
import { createCorsMiddleware } from './middleware/cors';

export interface AppWithPool {
  app: express.Application;
  httpServer: ReturnType<typeof createServer>;
  pool: IScanPool;
}

export async function createApp(): Promise<AppWithPool> {
  const app = express();

  // CORS middleware: allow frontend requests from development and production
  app.use(createCorsMiddleware());

  // Mount the Guardian router at /api and get service for GraphQL
  const { router, pool, service } = await createGuardianRouter();
  app.use('/api', router);

  // Wire pool events to GraphQL subscriptions
  wirePoolEventsToPubSub(pool, service, pubsub);

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: createResolvers(service),
  });

  const apolloServer = new ApolloServer({ schema });
  await apolloServer.start();

  // Handle GraphQL requests via Express
  app.post('/graphql', express.json(), async (req: Request, res: Response) => {
    try {
      const { query, variables, operationName } = req.body;
      const result = await apolloServer.executeOperation({
        query,
        variables,
        operationName,
      });
      // Apollo Server 4 returns a structured response with body property
      // For single results, extract the singleResult from body
      if ((result as any).body && (result as any).body.singleResult) {
        res.json((result as any).body.singleResult);
      } else {
        res.json(result);
      }
    } catch (error) {
      res.status(500).json({ errors: [{ message: 'Internal server error' }] });
    }
  });

  // Create HTTP server to support WebSocket upgrades
  const httpServer = createServer(app);

  // Setup WebSocket server for GraphQL subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  // Import graphql-ws useServer using require to avoid TypeScript module resolution issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useServer } = require('graphql-ws/use/ws') as any;
  useServer({ schema }, wsServer);

  return { app, httpServer, pool };
}
