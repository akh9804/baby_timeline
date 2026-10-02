import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../app.js';

test('POST /media creates a media item and GET /media lists it', async (t) => {
  const app = buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());

  const filename = "Mom's birthday.jpg";
  const createResponse = await app.inject({
    method: 'POST',
    url: '/media',
    payload: { filename },
  });

  assert.equal(createResponse.statusCode, 201);
  const createdMediaItem = createResponse.json();
  assert.equal(createdMediaItem.id, 1);
  assert.equal(createdMediaItem.filename, filename);
  assert.equal(typeof createdMediaItem.createdAt, 'string');
  assert.equal(createdMediaItem.thumbnailContentType, null);

  const listResponse = await app.inject({
    method: 'GET',
    url: '/media',
  });

  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.json(), [createdMediaItem]);
});

test('POST /media rejects a request without a filename', async (t) => {
  const app = buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/media',
    payload: {},
  });

  assert.equal(response.statusCode, 400);
});
