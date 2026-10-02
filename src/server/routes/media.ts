import type { FastifyPluginAsync } from 'fastify';

interface CreateMediaBody {
  filename: string;
}

const mediaItemSchema = {
  type: 'object',
  required: ['id', 'filename', 'createdAt', 'thumbnailContentType'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer' },
    filename: { type: 'string' },
    createdAt: { type: 'string' },
    contentType: { type: ['string', 'null'] },
    thumbnailContentType: { type: ['string', 'null'] },
    sizeBytes: { type: ['integer', 'null'] },
  },
} as const;

const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/media',
    {
      schema: {
        response: {
          200: {
            type: 'array',
            items: mediaItemSchema,
          },
        },
      },
    },
    async () => {
      return fastify.db
        .prepare(
          `
            SELECT id, filename, created_at AS createdAt, content_type AS contentType,
              thumbnail_content_type AS thumbnailContentType, size_bytes AS sizeBytes
            FROM media_items
            ORDER BY created_at DESC, id DESC
          `,
        )
        .all();
    },
  );

  fastify.post<{ Body: CreateMediaBody }>(
    '/media',
    {
      schema: {
        body: {
          type: 'object',
          required: ['filename'],
          additionalProperties: false,
          properties: {
            filename: { type: 'string', minLength: 1, maxLength: 255 },
          },
        },
        response: {
          201: mediaItemSchema,
        },
      },
    },
    async (request, reply) => {
      const result = fastify.db.prepare('INSERT INTO media_items (filename) VALUES (?)').run(request.body.filename);
      const mediaItem = fastify.db
        .prepare(
          `
            SELECT id, filename, created_at AS createdAt, content_type AS contentType,
              thumbnail_content_type AS thumbnailContentType, size_bytes AS sizeBytes
            FROM media_items
            WHERE id = ?
          `,
        )
        .get(result.lastInsertRowid);

      if (!mediaItem) {
        throw new Error(`Could not read inserted media item ${result.lastInsertRowid}`);
      }

      return reply.code(201).send(mediaItem);
    },
  );
};

export default mediaRoutes;
