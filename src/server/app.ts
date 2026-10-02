import Fastify from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { createDatabase } from './database.js';
import { createMediaStorage, type MediaStorage } from './media-storage.js';
import mediaUploadRoutes from './routes/media-upload.js';
import mediaRoutes from './routes/media.js';
import pingRoutes from './routes/ping.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseSync;
    mediaStorage: MediaStorage;
  }
}

export interface BuildAppOptions {
  databasePath?: string;
  mediaStorageRoot?: string;
}

export function buildApp({
  databasePath = 'data/family-media.db',
  mediaStorageRoot = process.env.MEDIA_STORAGE_ROOT ?? 'media',
}: BuildAppOptions = {}) {
  const app = Fastify({
    logger: true,
  });

  const db = createDatabase(databasePath);
  app.decorate('db', db);
  app.decorate('mediaStorage', createMediaStorage(mediaStorageRoot));
  app.addHook('onClose', async () => {
    db.close();
  });

  app.register(pingRoutes);
  app.register(mediaRoutes);
  app.register(mediaUploadRoutes);

  return app;
}
