import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { buildApp, type BuildAppOptions } from './app.js';

export const testAuthentication = {
  password: 'test-family-password',
  cookieSecret: 'test-cookie-secret-that-is-long-enough',
  secureCookies: false,
};

export interface AuthenticatedTestApp {
  db: DatabaseSync;
  close(): Promise<void>;
  inject(options: InjectOptions): Promise<LightMyRequestResponse>;
}

export async function buildAuthenticatedTestApp(
  options: Omit<BuildAppOptions, 'authentication'> = {},
): Promise<AuthenticatedTestApp> {
  const app = buildApp({ ...options, authentication: testAuthentication });
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { password: testAuthentication.password },
  });
  const setCookieHeader = login.headers['set-cookie'];
  const setCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  const cookie = setCookie?.split(';', 1)[0];

  if (login.statusCode !== 200 || !cookie) {
    await app.close();
    throw new Error('Could not log in to the test app');
  }

  return {
    db: app.db,
    close: () => app.close(),
    inject: (requestOptions) =>
      app.inject({
        ...requestOptions,
        headers: { ...requestOptions.headers, cookie },
      }),
  };
}
