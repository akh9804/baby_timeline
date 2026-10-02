import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../app.js';
import { testAuthentication } from '../test-app.js';

test('authentication protects media routes and returns a signed session cookie after login', async (t) => {
  const app = buildApp({ databasePath: ':memory:', authentication: testAuthentication });
  t.after(() => app.close());

  const anonymousSession = await app.inject({ method: 'GET', url: '/auth/session' });
  const anonymousMedia = await app.inject({ method: 'GET', url: '/media' });

  assert.deepEqual(anonymousSession.json(), { authenticated: false });
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
    payload: { password: 'test-family-password' },
  });
  const setCookie = login.headers['set-cookie'];

  assert.equal(login.statusCode, 200);
  assert.deepEqual(login.json(), { authenticated: true });
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

  assert.deepEqual(authenticatedSession.json(), { authenticated: true });
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
  assert.deepEqual(sessionAfterLogout.json(), { authenticated: false });
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
