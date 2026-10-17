import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = resolve(process.env.DATABASE_PATH ?? 'data/family-media.db');
const backupDirectory = resolve(process.env.DATABASE_BACKUP_DIR ?? 'data/backups');
const retentionCount = Number(process.env.DATABASE_BACKUP_RETENTION ?? 14);
const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
const backupPath = join(backupDirectory, `${basename(databasePath, extname(databasePath))}-${timestamp}.db`);

await mkdir(dirname(databasePath), { recursive: true });
await mkdir(backupDirectory, { recursive: true });

const database = new DatabaseSync(databasePath);

try {
  const escapedBackupPath = backupPath.replaceAll("'", "''");
  database.exec(`VACUUM INTO '${escapedBackupPath}'`);
} finally {
  database.close();
}

const backupFiles = (
  await Promise.all(
    (await readdir(backupDirectory))
      .filter((fileName) => fileName.endsWith('.db'))
      .map(async (fileName) => ({ fileName, modifiedAt: (await stat(join(backupDirectory, fileName))).mtimeMs })),
  )
).sort((a, b) => b.modifiedAt - a.modifiedAt);

await Promise.all(
  backupFiles.slice(retentionCount).map(({ fileName }) => rm(join(backupDirectory, fileName), { force: true })),
);

console.log(`Database backup created: ${backupPath}`);
