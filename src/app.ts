import express from 'express';
import { createGuardianRouter } from './router';
import { IScanPool } from './worker/scan.pool';

export interface AppWithPool {
  app: express.Application;
  pool: IScanPool;
}

export async function createApp(): Promise<AppWithPool> {
  const app = express();

  // Mount the Guardian router at /api
  const { router, pool } = await createGuardianRouter();
  app.use('/api', router);

  return { app, pool };
}
