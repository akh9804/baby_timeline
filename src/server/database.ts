import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createDatabase(databasePath: string): DatabaseSync {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');

  database.exec(`
    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      storage_key TEXT,
      content_type TEXT,
      thumbnail_content_type TEXT,
      size_bytes INTEGER CHECK (size_bytes >= 0),
      moment_id INTEGER REFERENCES moments(id) ON DELETE SET NULL,
      captured_at TEXT,
      width INTEGER CHECK (width IS NULL OR width > 0),
      height INTEGER CHECK (height IS NULL OR height > 0),
      duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS children (
      id INTEGER PRIMARY KEY,
      name TEXT,
      due_date TEXT,
      birth_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    CREATE TABLE IF NOT EXISTS moments (
      id INTEGER PRIMARY KEY,
      child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY,
      moment_id INTEGER NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
      author TEXT NOT NULL CHECK (length(author) BETWEEN 1 AND 60),
      content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    CREATE INDEX IF NOT EXISTS moments_occurred_at_index
      ON moments (occurred_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS comments_moment_id_index
      ON comments (moment_id, created_at, id);

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

  if (!columnNames.has('moment_id')) {
    database.exec('ALTER TABLE media_items ADD COLUMN moment_id INTEGER REFERENCES moments(id) ON DELETE SET NULL');
  }

  if (!columnNames.has('captured_at')) {
    database.exec('ALTER TABLE media_items ADD COLUMN captured_at TEXT');
  }

  if (!columnNames.has('width')) {
    database.exec('ALTER TABLE media_items ADD COLUMN width INTEGER CHECK (width IS NULL OR width > 0)');
  }

  if (!columnNames.has('height')) {
    database.exec('ALTER TABLE media_items ADD COLUMN height INTEGER CHECK (height IS NULL OR height > 0)');
  }

  if (!columnNames.has('duration_seconds')) {
    database.exec(
      'ALTER TABLE media_items ADD COLUMN duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0)',
    );
  }

  if (!columnNames.has('sort_order')) {
    database.exec('ALTER TABLE media_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0)');
  }

  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS media_items_storage_key_unique ON media_items (storage_key)');
  database.exec('CREATE INDEX IF NOT EXISTS media_items_moment_id_index ON media_items (moment_id, sort_order, id)');

  return database;
}
