import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createMediaStorage } from './media-storage.js';

test('resolves a storage key under the configured root', () => {
  const root = resolve('/Volumes/FamilyMedia');
  const storage = createMediaStorage(root);

  assert.equal(storage.resolvePath('photos/2026/birthday.jpg'), resolve(root, 'photos/2026/birthday.jpg'));
});

test('rejects absolute paths and paths that escape the configured root', () => {
  const storage = createMediaStorage('/Volumes/FamilyMedia');

  assert.throws(() => storage.resolvePath('/etc/passwd'), /relative path/);
  assert.throws(() => storage.resolvePath('../outside.jpg'), /inside the media root/);
  assert.throws(() => storage.resolvePath('.'), /inside the media root/);
});
