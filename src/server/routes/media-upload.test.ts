import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../app.js';

function createMultipartPayload(filename: string, contentType: string, content: Buffer, boundary: string) {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

test('POST /media/upload streams a file to disk and GET /media/:id/file streams it back', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'baby-timeline-media-'));
  const app = buildApp({ databasePath: ':memory:', mediaStorageRoot: storageRoot });
  t.after(async () => {
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  const boundary = 'media-test-boundary';
  const filename = 'family-photo.jpg';
  const contentType = 'image/jpeg';
  const content = Buffer.from('image bytes from a stream');
  const uploadResponse = await app.inject({
    method: 'POST',
    url: '/media/upload',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: createMultipartPayload(filename, contentType, content, boundary),
  });

  assert.equal(uploadResponse.statusCode, 201);
  const uploadedMedia = uploadResponse.json();
  assert.equal(uploadedMedia.filename, filename);
  assert.equal(uploadedMedia.contentType, contentType);
  assert.equal(uploadedMedia.sizeBytes, content.length);

  const storedFiles = await readdir(storageRoot);
  assert.equal(storedFiles.length, 1);
  assert.deepEqual(await readFile(join(storageRoot, storedFiles[0]!)), content);

  const downloadResponse = await app.inject({
    method: 'GET',
    url: `/media/${uploadedMedia.id}/file`,
  });

  assert.equal(downloadResponse.statusCode, 200);
  assert.equal(downloadResponse.headers['content-type'], contentType);
  assert.equal(downloadResponse.headers['content-length'], String(content.length));
  assert.deepEqual(downloadResponse.rawPayload, content);

  const listResponse = await app.inject({ method: 'GET', url: '/media' });
  const [listedMedia] = listResponse.json();
  assert.equal(listedMedia.id, uploadedMedia.id);
  assert.equal(listedMedia.filename, filename);
  assert.equal(typeof listedMedia.createdAt, 'string');
  assert.equal(listedMedia.contentType, contentType);
  assert.equal(listedMedia.sizeBytes, content.length);
});

test('GET /media/:id/file returns 404 when the media item has no uploaded file', async (t) => {
  const app = buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/media/999/file' });

  assert.equal(response.statusCode, 404);
});
