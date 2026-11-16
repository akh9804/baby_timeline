import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../app.js';

const cookieSecret = 'test-cookie-secret-that-is-long-enough';

test('loan balance is available only to administrators and tracks repayments', async (t) => {
  const app = buildApp({
    databasePath: ':memory:',
    authentication: {
      accounts: [
        { id: 'admin-1', username: 'admin@example.com', password: 'admin-password', role: 'admin' },
        { id: 'viewer-1', password: 'viewer-password', role: 'viewer' },
      ],
      cookieSecret,
      secureCookies: false,
    },
  });
  t.after(() => app.close());

  const anonymous = await app.inject({ method: 'GET', url: '/admin/loan' });
  assert.equal(anonymous.statusCode, 401);

  const viewerLogin = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { password: 'viewer-password' },
  });
  const viewerCookie = viewerLogin.headers['set-cookie']?.split(';', 1)[0];
  assert.ok(viewerCookie);
  const viewerResponse = await app.inject({ method: 'GET', url: '/admin/loan', headers: { cookie: viewerCookie } });
  assert.equal(viewerResponse.statusCode, 403);

  const adminLogin = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'admin@example.com', password: 'admin-password' },
  });
  const adminCookie = adminLogin.headers['set-cookie']?.split(';', 1)[0];
  assert.ok(adminCookie);

  const initial = await app.inject({ method: 'GET', url: '/admin/loan', headers: { cookie: adminCookie } });
  assert.equal(initial.statusCode, 200);
  assert.deepEqual(initial.json(), { initialBalance: 9860000, currentBalance: 9860000, repayments: [] });

  const repayment = await app.inject({
    method: 'POST',
    url: '/admin/loan/repayments',
    headers: { cookie: adminCookie },
    payload: { amount: 500000, repaidAt: '2026-11-16' },
  });
  assert.equal(repayment.statusCode, 201);
  assert.deepEqual(repayment.json(), { id: 1, amount: 500000, repaidAt: '2026-11-16' });

  const updated = await app.inject({ method: 'GET', url: '/admin/loan', headers: { cookie: adminCookie } });
  assert.deepEqual(updated.json(), {
    initialBalance: 9860000,
    currentBalance: 9360000,
    repayments: [{ id: 1, amount: 500000, repaidAt: '2026-11-16' }],
  });

  const edited = await app.inject({
    method: 'PATCH',
    url: '/admin/loan/repayments/1',
    headers: { cookie: adminCookie },
    payload: { amount: 600000, repaidAt: '2026-11-17' },
  });
  assert.equal(edited.statusCode, 200);
  assert.deepEqual(edited.json(), { id: 1, amount: 600000, repaidAt: '2026-11-17' });

  const deleted = await app.inject({
    method: 'DELETE',
    url: '/admin/loan/repayments/1',
    headers: { cookie: adminCookie },
  });
  assert.equal(deleted.statusCode, 204);

  const restored = await app.inject({ method: 'GET', url: '/admin/loan', headers: { cookie: adminCookie } });
  assert.deepEqual(restored.json(), { initialBalance: 9860000, currentBalance: 9860000, repayments: [] });
});

test('loan repayment cannot exceed the current balance', async (t) => {
  const app = buildApp({
    databasePath: ':memory:',
    authentication: {
      accounts: [{ id: 'admin-1', username: 'admin@example.com', password: 'admin-password', role: 'admin' }],
      cookieSecret,
      secureCookies: false,
    },
  });
  t.after(() => app.close());

  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'admin@example.com', password: 'admin-password' },
  });
  const cookie = login.headers['set-cookie']?.split(';', 1)[0];
  assert.ok(cookie);

  const response = await app.inject({
    method: 'POST',
    url: '/admin/loan/repayments',
    headers: { cookie },
    payload: { amount: 9860001, repaidAt: '2026-11-16' },
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { message: '상환 금액이 현재 잔액보다 클 수 없습니다.' });
});
