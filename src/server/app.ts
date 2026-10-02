import Fastify from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { registerAuthentication, type AuthenticationOptions } from './authentication.js';
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
  authentication?: AuthenticationOptions;
}

export function buildApp({
  databasePath = 'data/family-media.db',
  mediaStorageRoot = process.env.MEDIA_STORAGE_ROOT ?? 'media',
  authentication = {
    password: process.env.AUTH_PASSWORD ?? '',
    cookieSecret: process.env.COOKIE_SECRET ?? '',
    secureCookies: process.env.COOKIE_SECURE === 'true',
  },
}: BuildAppOptions = {}) {
  if (authentication.password.length < 12) {
    throw new Error('AUTH_PASSWORD must contain at least 12 characters');
  }

  if (Buffer.byteLength(authentication.cookieSecret) < 32) {
    throw new Error('COOKIE_SECRET must contain at least 32 bytes');
  }

  const app = Fastify({
    logger: true,
  });

  const db = createDatabase(databasePath);
  app.decorate('db', db);
  app.decorate('mediaStorage', createMediaStorage(mediaStorageRoot));
  app.addHook('onClose', async () => {
    db.close();
  });

  registerAuthentication(app, authentication);
  app.register(pingRoutes);
  app.register(mediaRoutes);
  app.register(mediaUploadRoutes);

  return app;
}
