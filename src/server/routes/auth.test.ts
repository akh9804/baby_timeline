import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../app.js';
import { testAuthentication } from '../test-app.js';

test('authentication protects media routes and returns a signed session cookie after login', async (t) => {
  const app = buildApp({ databasePath: ':memory:', authentication: testAuthentication });
  t.after(() => app.close());

  const anonymousSession = await app.inject({ method: 'GET', url: '/auth/session' });
  const anonymousMedia = await app.inject({ method: 'GET', url: '/media' });

  assert.deepEqual(anonymousSession.json(), { authenticated: false, role: null });
  assert.equal(anonymousMedia.statusCode, 401);

  const rejectedLogin = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { password: 'incorrect-family-password' },
  });
  assert.equal(rejectedLogin.statusCode, 401);

  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'test-admin@example.com', password: 'test-family-password' },
  });
  const setCookie = login.headers['set-cookie'];

  assert.equal(login.statusCode, 200);
  assert.deepEqual(login.json(), { authenticated: true, role: 'admin' });
  assert.ok(setCookie?.includes('HttpOnly'));
  assert.ok(setCookie?.includes('SameSite=Strict'));

  const cookieHeader = setCookie?.split(';', 1)[0];
  assert.ok(cookieHeader);

  const authenticatedSession = await app.inject({
    method: 'GET',
    url: '/auth/session',
    headers: { cookie: cookieHeader },
  });
  const authenticatedMedia = await app.inject({
    method: 'GET',
    url: '/media',
    headers: { cookie: cookieHeader },
  });

  assert.deepEqual(authenticatedSession.json(), { authenticated: true, role: 'admin' });
  assert.equal(authenticatedMedia.statusCode, 200);

  const tamperedCookie = `${cookieHeader.slice(0, -1)}x`;
  const tamperedSession = await app.inject({
    method: 'GET',
    url: '/media',
    headers: { cookie: tamperedCookie },
  });
  assert.equal(tamperedSession.statusCode, 401);

  const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: cookieHeader } });
  assert.equal(logout.statusCode, 200);

  const sessionAfterLogout = await app.inject({
    method: 'GET',
    url: '/auth/session',
    headers: { cookie: cookieHeader },
  });
  const mediaAfterLogout = await app.inject({ method: 'GET', url: '/media', headers: { cookie: cookieHeader } });
  assert.deepEqual(sessionAfterLogout.json(), { authenticated: false, role: null });
  assert.equal(mediaAfterLogout.statusCode, 401);
});

test('POST /auth/login limits password attempts by client IP', async (t) => {
  const app = buildApp({ databasePath: ':memory:', authentication: testAuthentication });
  t.after(() => app.close());

  const responses = [];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    responses.push(
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        remoteAddress: '192.0.2.25',
        payload: { password: 'incorrect-family-password' },
      }),
    );
  }

  assert.deepEqual(
    responses.map(({ statusCode }) => statusCode),
    [401, 401, 401, 401, 401, 429],
  );
});

test('accepts any configured family password', async (t) => {
  const app = buildApp({
    databasePath: ':memory:',
    authentication: {
      accounts: [
        { id: 'family-1', password: '557792', role: 'viewer' },
        { id: 'family-2', password: '051228', role: 'viewer' },
      ],
      cookieSecret: 'test-cookie-secret-that-is-long-enough',
      secureCookies: false,
    },
  });
  t.after(() => app.close());

  for (const password of ['557792', '051228']) {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { password },
    });

    assert.equal(login.statusCode, 200);
  }
});

test('viewer sessions cannot upload media', async (t) => {
  const app = buildApp({
    databasePath: ':memory:',
    authentication: {
      accounts: [{ id: 'viewer-1', password: 'viewer-password', role: 'viewer' }],
      cookieSecret: 'test-cookie-secret-that-is-long-enough',
      secureCookies: false,
    },
  });
  t.after(() => app.close());

  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { password: 'viewer-password' },
  });
  const setCookie = login.headers['set-cookie'];
  const cookieHeader = setCookie?.split(';', 1)[0];

  assert.equal(login.statusCode, 200);
  assert.ok(cookieHeader);

  const upload = await app.inject({
    method: 'POST',
    url: '/media/upload',
    headers: { cookie: cookieHeader },
  });

  assert.equal(upload.statusCode, 403);
  assert.deepEqual(upload.json(), { message: 'Administrator access required' });
});

test('admin login requires the matching username and password', async (t) => {
  const app = buildApp({
    databasePath: ':memory:',
    authentication: {
      accounts: [{ id: 'admin-1', username: 'admin@example.com', password: 'admin-password', role: 'admin' }],
      cookieSecret: 'test-cookie-secret-that-is-long-enough',
      secureCookies: false,
    },
  });
  t.after(() => app.close());

  const missingUsername = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { password: 'admin-password' },
  });
  const correctCredentials = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'admin@example.com', password: 'admin-password' },
  });

  assert.equal(missingUsername.statusCode, 401);
  assert.equal(correctCredentials.statusCode, 200);
});
