import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createDatabase(databasePath: string): DatabaseSync {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);

  database.exec(`
    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      storage_key TEXT,
      content_type TEXT,
      thumbnail_content_type TEXT,
      size_bytes INTEGER CHECK (size_bytes >= 0)
    ) STRICT
  `);

  const columns = database.prepare('PRAGMA table_info(media_items)').all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map(({ name }) => name));

  if (!columnNames.has('storage_key')) {
    database.exec('ALTER TABLE media_items ADD COLUMN storage_key TEXT');
  }

  if (!columnNames.has('content_type')) {
    database.exec('ALTER TABLE media_items ADD COLUMN content_type TEXT');
  }

  if (!columnNames.has('thumbnail_content_type')) {
    database.exec('ALTER TABLE media_items ADD COLUMN thumbnail_content_type TEXT');
  }

  if (!columnNames.has('size_bytes')) {
    database.exec('ALTER TABLE media_items ADD COLUMN size_bytes INTEGER CHECK (size_bytes >= 0)');
  }

  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS media_items_storage_key_unique ON media_items (storage_key)');

  return database;
}
