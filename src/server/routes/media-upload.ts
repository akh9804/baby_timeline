import multipart from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createImageThumbnail, ImageProcessingError } from '../image-processing.js';
import { createVideoThumbnail } from '../video-processing.js';

const maxFileSize = 1024 * 1024 * 1024;
const mimeTypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const previewableMediaTypes = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);
const imageMediaTypes = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const videoMediaTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

interface UploadedMedia {
  id: number;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  storageKey: string | null;
  thumbnailContentType: string | null;
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
    const thumbnailPath = fastify.mediaStorage.resolvePath(`thumbnails/${storageKey}.webp`);
    const videoThumbnailPath = fastify.mediaStorage.resolvePath(`thumbnails/${storageKey}.jpg`);
    let thumbnailContentType: string | null = null;
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

      if (imageMediaTypes.has(contentType)) {
        await createImageThumbnail(filePath, thumbnailPath);
        thumbnailContentType = 'image/webp';
      } else if (videoMediaTypes.has(contentType)) {
        try {
          await createVideoThumbnail(filePath, videoThumbnailPath);
          thumbnailContentType = 'image/jpeg';
        } catch (error) {
          fastify.log.warn({ err: error, filename: file.filename }, 'Video thumbnail generation failed');
          await rm(videoThumbnailPath, { force: true });
        }
      }

      const result = fastify.db
        .prepare(
          `
            INSERT INTO media_items (filename, storage_key, content_type, thumbnail_content_type, size_bytes)
            VALUES (?, ?, ?, ?, ?)
          `,
        )
        .run(file.filename, storageKey, contentType, thumbnailContentType, sizeBytes);

      return reply.code(201).send({
        id: Number(result.lastInsertRowid),
        filename: file.filename,
        contentType,
        thumbnailContentType,
        sizeBytes,
      });
    } catch (error) {
      await rm(filePath, { force: true });
      await rm(thumbnailPath, { force: true });
      await rm(videoThumbnailPath, { force: true });

      if (error instanceof ImageProcessingError) {
        return reply.code(422).send({ message: 'The uploaded file is not a valid supported image' });
      }

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
      const disposition = previewableMediaTypes.has(mediaItem.contentType) ? 'inline' : 'attachment';

      return reply
        .header('content-type', mediaItem.contentType)
        .header('content-length', mediaItem.sizeBytes)
        .header('content-disposition', `${disposition}; filename*=UTF-8''${safeFilename}`)
        .header('x-content-type-options', 'nosniff')
        .send(createReadStream(filePath));
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/media/:id/thumbnail',
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
            SELECT content_type AS contentType, storage_key AS storageKey,
              thumbnail_content_type AS thumbnailContentType
            FROM media_items
            WHERE id = ?
          `,
        )
        .get(Number(request.params.id)) as
        Pick<UploadedMedia, 'contentType' | 'storageKey' | 'thumbnailContentType'> | undefined;

      if (!mediaItem?.storageKey || !mediaItem.contentType) {
        return reply.code(404).send({ message: 'Media thumbnail not found' });
      }

      const isImage = imageMediaTypes.has(mediaItem.contentType);
      const isVideo = videoMediaTypes.has(mediaItem.contentType);

      if (!isImage && !isVideo) {
        return reply.code(404).send({ message: 'Media thumbnail not found' });
      }

      if (isVideo && mediaItem.thumbnailContentType !== 'image/jpeg') {
        return reply.code(404).send({ message: 'Video poster not found' });
      }

      let thumbnailPath = fastify.mediaStorage.resolvePath(
        `thumbnails/${mediaItem.storageKey}.${mediaItem.thumbnailContentType === 'image/jpeg' ? 'jpg' : 'webp'}`,
      );
      let contentType = mediaItem.thumbnailContentType ?? 'image/webp';

      try {
        await access(thumbnailPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }

        if (!isImage) {
          return reply.code(404).send({ message: 'Video poster not found' });
        }

        // Older image uploads have no thumbnail yet, so serve the original until reprocessed.
        thumbnailPath = fastify.mediaStorage.resolvePath(mediaItem.storageKey);
        contentType = mediaItem.contentType;
      }

      return reply
        .header('content-type', contentType)
        .header('content-disposition', 'inline')
        .header('x-content-type-options', 'nosniff')
        .send(createReadStream(thumbnailPath));
    },
  );
};

export default mediaUploadRoutes;
