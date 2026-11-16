import Fastify from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { registerAuthentication, type AuthenticationAccount, type AuthenticationOptions } from './authentication.js';
import { createDatabase } from './database.js';
import { createMediaStorage, type MediaStorage } from './media-storage.js';
import loanRoutes from './routes/loan.js';
import mediaUploadRoutes from './routes/media-upload.js';
import mediaRoutes from './routes/media.js';
import pingRoutes from './routes/ping.js';
import timelineRoutes from './routes/timeline.js';

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
  databasePath = process.env.DATABASE_PATH ?? 'data/family-media.db',
  mediaStorageRoot = process.env.MEDIA_STORAGE_ROOT ?? 'media',
  authentication = {
    accounts: [
      ...(process.env.ADMIN_ACCOUNTS_JSON ? parseAdminAccounts(process.env.ADMIN_ACCOUNTS_JSON) : []),
      ...parseFamilyPasswords(
        process.env.FAMILY_PASSWORDS ?? process.env.AUTH_PASSWORDS ?? process.env.AUTH_PASSWORD ?? '',
      ),
    ],
    cookieSecret: process.env.COOKIE_SECRET ?? '',
    secureCookies: process.env.COOKIE_SECURE === 'true',
  },
}: BuildAppOptions = {}) {
  if (authentication.accounts.length === 0 || authentication.accounts.some((account) => account.password.length < 6)) {
    throw new Error('AUTH_PASSWORDS must contain one or more passwords with at least 6 characters each');
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

  const clientRoot = resolve(process.env.CLIENT_ROOT ?? 'dist/client');

  if (existsSync(clientRoot)) {
    app.get('/', async (_request, reply) => {
      return reply.type('text/html; charset=utf-8').send(createReadStream(resolve(clientRoot, 'index.html')));
    });

    app.get<{ Params: { '*': string } }>('/assets/*', async (request, reply) => {
      const assetName = request.params['*'].replace(/^\/+/, '');
      const assetPath = resolve(clientRoot, 'assets', assetName);
      const pathFromRoot = relative(clientRoot, assetPath);

      if (pathFromRoot === '' || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
        return reply.code(404).send({ message: 'Asset not found' });
      }

      try {
        await access(assetPath);
      } catch {
        return reply.code(404).send({ message: 'Asset not found' });
      }

      return reply.type(contentTypeFor(assetPath)).send(createReadStream(assetPath));
    });
  }

  registerAuthentication(app, authentication);
  app.register(pingRoutes);
  app.register(mediaRoutes);
  app.register(mediaUploadRoutes);
  app.register(loanRoutes);
  app.register(timelineRoutes);

  return app;
}

function contentTypeFor(filePath: string): string {
  const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
  };

  return contentTypes[extname(filePath)] ?? 'application/octet-stream';
}

function parseFamilyPasswords(value: string): AuthenticationAccount[] {
  return value
    .split(',')
    .map((password) => password.trim())
    .filter(Boolean)
    .map((password, index) => ({ id: `family-${index + 1}`, password, role: 'viewer' as const }));
}

function parseAdminAccounts(value: string): AuthenticationAccount[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('ADMIN_ACCOUNTS_JSON must be valid JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('ADMIN_ACCOUNTS_JSON must be a JSON array');
  }

  return parsed.map((account, index) => {
    if (
      typeof account !== 'object' ||
      account === null ||
      typeof (account as { username?: unknown }).username !== 'string' ||
      typeof (account as { password?: unknown }).password !== 'string'
    ) {
      throw new Error(`ADMIN_ACCOUNTS_JSON account ${index + 1} must include username and password`);
    }

    const typedAccount = account as { username: string; password: string };

    return {
      id: `admin-${index + 1}`,
      username: typedAccount.username,
      password: typedAccount.password,
      role: 'admin' as const,
    };
  });
}
