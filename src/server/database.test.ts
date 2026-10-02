import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

test('adds upload metadata columns to an existing media_items table', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'baby-timeline-database-'));
  const databasePath = join(directory, 'legacy.db');
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE media_items (
      id INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT
  `);
  oldDatabase.close();

  const database = createDatabase(databasePath);
  t.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const columns = database.prepare('PRAGMA table_info(media_items)').all() as Array<{ name: string }>;
  assert.deepEqual(
    columns.map(({ name }) => name),
    ['id', 'filename', 'created_at', 'storage_key', 'content_type', 'thumbnail_content_type', 'size_bytes'],
  );
});
