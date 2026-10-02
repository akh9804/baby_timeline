import multipart from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const maxFileSize = 1024 * 1024 * 1024;
const mimeTypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

interface UploadedMedia {
  id: number;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  storageKey: string | null;
}

const mediaUploadRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(multipart, {
    limits: {
      files: 1,
      fields: 0,
      parts: 1,
      fileSize: maxFileSize,
    },
  });

  fastify.post('/media/upload', async (request, reply) => {
    const file = await request.file();

    if (!file) {
      return reply.code(400).send({ message: 'A file is required' });
    }

    if (!file.filename || file.filename.length > 255) {
      file.file.resume();
      return reply.code(400).send({ message: 'Filename must be between 1 and 255 characters' });
    }

    const storageKey = randomUUID();
    const filePath = fastify.mediaStorage.resolvePath(storageKey);
    let sizeBytes = 0;

    await mkdir(fastify.mediaStorage.rootPath, { recursive: true });

    try {
      const countBytes = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          sizeBytes += chunk.length;
          callback(null, chunk);
        },
      });

      await pipeline(file.file, countBytes, createWriteStream(filePath, { flags: 'wx' }));

      if (file.file.truncated) {
        const error = new Error(`Uploaded file exceeds the ${maxFileSize} byte limit`);
        Object.assign(error, { statusCode: 413 });
        throw error;
      }

      const contentType = mimeTypePattern.test(file.mimetype) ? file.mimetype : 'application/octet-stream';
      const result = fastify.db
        .prepare(
          `
            INSERT INTO media_items (filename, storage_key, content_type, size_bytes)
            VALUES (?, ?, ?, ?)
          `,
        )
        .run(file.filename, storageKey, contentType, sizeBytes);

      return reply.code(201).send({
        id: Number(result.lastInsertRowid),
        filename: file.filename,
        contentType,
        sizeBytes,
      });
    } catch (error) {
      await rm(filePath, { force: true });
      throw error;
    }
  });

  fastify.get<{ Params: { id: string } }>(
    '/media/:id/file',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', pattern: '^[1-9][0-9]*$' },
          },
        },
      },
    },
    async (request, reply) => {
      const mediaItem = fastify.db
        .prepare(
          `
            SELECT id, filename, content_type AS contentType,
              size_bytes AS sizeBytes, storage_key AS storageKey
            FROM media_items
            WHERE id = ?
          `,
        )
        .get(Number(request.params.id)) as UploadedMedia | undefined;

      if (!mediaItem?.storageKey || !mediaItem.contentType || mediaItem.sizeBytes === null) {
        return reply.code(404).send({ message: 'Media file not found' });
      }

      const filePath = fastify.mediaStorage.resolvePath(mediaItem.storageKey);
      const safeFilename = encodeURIComponent(mediaItem.filename).replace(/[!'()*]/g, (character) => {
        return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
      });

      return reply
        .header('content-type', mediaItem.contentType)
        .header('content-length', mediaItem.sizeBytes)
        .header('content-disposition', `attachment; filename*=UTF-8''${safeFilename}`)
        .header('x-content-type-options', 'nosniff')
        .send(createReadStream(filePath));
    },
  );
};

export default mediaUploadRoutes;
