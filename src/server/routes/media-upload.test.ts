import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
  assert.equal(uploadedMedia.thumbnailContentType, 'image/webp');
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
  assert.equal(listedMedia.thumbnailContentType, 'image/webp');
  assert.equal(listedMedia.sizeBytes, content.length);
});

test('POST /media/upload keeps a video when FFmpeg cannot create its poster', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'baby-timeline-video-'));
  const app = buildApp({ databasePath: ':memory:', mediaStorageRoot: storageRoot });
  const originalFfmpegPath = process.env.FFMPEG_PATH;
  process.env.FFMPEG_PATH = join(storageRoot, 'missing-ffmpeg');
  t.after(async () => {
    if (originalFfmpegPath === undefined) {
      delete process.env.FFMPEG_PATH;
    } else {
      process.env.FFMPEG_PATH = originalFfmpegPath;
    }

    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  const boundary = 'video-test-boundary';
  const content = Buffer.from('video bytes');
  const uploadResponse = await app.inject({
    method: 'POST',
    url: '/media/upload',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: createMultipartPayload('first-steps.mp4', 'video/mp4', content, boundary),
  });

  assert.equal(uploadResponse.statusCode, 201);
  const uploadedMedia = uploadResponse.json();
  assert.equal(uploadedMedia.thumbnailContentType, null);

  const fileResponse = await app.inject({ method: 'GET', url: `/media/${uploadedMedia.id}/file` });
  const posterResponse = await app.inject({ method: 'GET', url: `/media/${uploadedMedia.id}/thumbnail` });

  assert.equal(fileResponse.statusCode, 200);
  assert.deepEqual(fileResponse.rawPayload, content);
  assert.equal(posterResponse.statusCode, 404);
});

test('POST /media/upload stores and serves an FFmpeg-generated video poster', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'baby-timeline-video-poster-'));
  const app = buildApp({ databasePath: ':memory:', mediaStorageRoot: storageRoot });
  const originalFfmpegPath = process.env.FFMPEG_PATH;
  const poster = await sharp({
    create: { width: 320, height: 180, channels: 3, background: { r: 120, g: 160, b: 190 } },
  })
    .jpeg()
    .toBuffer();
  const fakeFfmpegPath = join(storageRoot, 'fake-ffmpeg.mjs');
  await writeFile(
    fakeFfmpegPath,
    `#!/usr/bin/env node\nimport { writeFile } from 'node:fs/promises';\nawait writeFile(process.argv.at(-1), Buffer.from('${poster.toString('base64')}', 'base64'));\n`,
  );
  await chmod(fakeFfmpegPath, 0o755);
  process.env.FFMPEG_PATH = fakeFfmpegPath;
  t.after(async () => {
    if (originalFfmpegPath === undefined) {
      delete process.env.FFMPEG_PATH;
    } else {
      process.env.FFMPEG_PATH = originalFfmpegPath;
    }

    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  const boundary = 'video-poster-test-boundary';
  const uploadResponse = await app.inject({
    method: 'POST',
    url: '/media/upload',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: createMultipartPayload('first-steps.mp4', 'video/mp4', Buffer.from('video bytes'), boundary),
  });

  assert.equal(uploadResponse.statusCode, 201);
  const uploadedMedia = uploadResponse.json();
  assert.equal(uploadedMedia.thumbnailContentType, 'image/jpeg');

  const posterResponse = await app.inject({ method: 'GET', url: `/media/${uploadedMedia.id}/thumbnail` });
  const posterMetadata = await sharp(posterResponse.rawPayload).metadata();

  assert.equal(posterResponse.statusCode, 200);
  assert.equal(posterResponse.headers['content-type'], 'image/jpeg');
  assert.equal(posterMetadata.format, 'jpeg');
  assert.equal(posterMetadata.width, 320);
  assert.equal(posterMetadata.height, 180);
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
