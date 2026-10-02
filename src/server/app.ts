import Fastify from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { createDatabase } from './database.js';
import pingRoutes from './routes/ping.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseSync;
  }
}

export interface BuildAppOptions {
  databasePath?: string;
}

export function buildApp({ databasePath = 'data/family-media.db' }: BuildAppOptions = {}) {
  const app = Fastify({
    logger: true,
  });

  const db = createDatabase(databasePath);
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    db.close();
  });

  app.register(pingRoutes);

  return app;
}
