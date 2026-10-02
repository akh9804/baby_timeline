import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../app.js';

test('GET /ping responds with pong', async (t) => {
  const app = buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/ping',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { message: 'pong' });
});
