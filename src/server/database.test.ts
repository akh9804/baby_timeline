import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabase } from './database.js';

test('inserts and reads a media item', (t) => {
  const db = createDatabase(':memory:');
  t.after(() => db.close());

  const insert = db.prepare('INSERT INTO media_items (filename) VALUES (?)');
  const result = insert.run('family-photo.jpg');

  const mediaItem = db.prepare('SELECT id, filename FROM media_items WHERE id = ?').get(result.lastInsertRowid);

  assert.ok(mediaItem);
  assert.equal(mediaItem.id, result.lastInsertRowid);
  assert.equal(mediaItem.filename, 'family-photo.jpg');
});
