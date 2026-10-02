import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
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
  const content = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: { r: 210, g: 150, b: 120 } },
  })
    .jpeg()
    .toBuffer();
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
  const storageKey = storedFiles.find((entry) => entry !== 'thumbnails');
  assert.ok(storageKey);
  assert.deepEqual(await readFile(join(storageRoot, storageKey)), content);

  const thumbnailResponse = await app.inject({
    method: 'GET',
    url: `/media/${uploadedMedia.id}/thumbnail`,
  });
  const thumbnailMetadata = await sharp(thumbnailResponse.rawPayload).metadata();

  assert.equal(thumbnailResponse.statusCode, 200);
  assert.equal(thumbnailResponse.headers['content-type'], 'image/webp');
  assert.equal(thumbnailMetadata.format, 'webp');
  assert.equal(thumbnailMetadata.width, 480);
  assert.equal(thumbnailMetadata.height, 240);

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

test('POST /media/upload rejects invalid image bytes and removes the partial upload', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'baby-timeline-invalid-image-'));
  const app = buildApp({ databasePath: ':memory:', mediaStorageRoot: storageRoot });
  t.after(async () => {
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  const boundary = 'invalid-image-boundary';
  const response = await app.inject({
    method: 'POST',
    url: '/media/upload',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: createMultipartPayload('not-an-image.jpg', 'image/jpeg', Buffer.from('not an image'), boundary),
  });

  assert.equal(response.statusCode, 422);
  assert.deepEqual(await readdir(storageRoot), []);
  assert.deepEqual((await app.inject({ method: 'GET', url: '/media' })).json(), []);
});

test('GET /media/:id/thumbnail serves the original image for older uploads without thumbnails', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'baby-timeline-legacy-image-'));
  const app = buildApp({ databasePath: ':memory:', mediaStorageRoot: storageRoot });
  t.after(async () => {
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  const original = await sharp({
    create: { width: 80, height: 40, channels: 3, background: { r: 100, g: 140, b: 110 } },
  })
    .jpeg()
    .toBuffer();
  await mkdir(storageRoot, { recursive: true });
  await writeFile(join(storageRoot, 'legacy-image-key'), original);

  const result = app.db
    .prepare(
      `
        INSERT INTO media_items (filename, storage_key, content_type, size_bytes)
        VALUES (?, ?, ?, ?)
      `,
    )
    .run('legacy.jpg', 'legacy-image-key', 'image/jpeg', original.length);

  const response = await app.inject({ method: 'GET', url: `/media/${result.lastInsertRowid}/thumbnail` });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'image/jpeg');
  assert.deepEqual(response.rawPayload, original);
});

test('GET /media/:id/file returns 404 when the media item has no uploaded file', async (t) => {
  const app = buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/media/999/file' });

  assert.equal(response.statusCode, 404);
});
