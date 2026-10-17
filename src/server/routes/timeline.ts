import type { FastifyPluginAsync } from 'fastify';
import { rm } from 'node:fs/promises';

interface CreateChildBody {
  name?: string;
  dueDate?: string | null;
  birthDate?: string | null;
}

interface UpdateChildBody extends CreateChildBody {}

interface CreateMomentBody {
  childId: number;
  title: string;
  description?: string | null;
  occurredAt: string;
}

interface UpdateMomentBody {
  title?: string;
  description?: string | null;
  occurredAt?: string;
}

interface CommentBody {
  author: string;
  content: string;
}

interface Cursor {
  occurredAt: string;
  id: number;
}

const childSchema = {
  type: 'object',
  required: ['id', 'name', 'dueDate', 'birthDate'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer' },
    name: { type: ['string', 'null'] },
    dueDate: { type: ['string', 'null'] },
    birthDate: { type: ['string', 'null'] },
  },
} as const;

const mediaSchema = {
  type: 'object',
  required: [
    'id',
    'filename',
    'contentType',
    'thumbnailContentType',
    'sizeBytes',
    'width',
    'height',
    'durationSeconds',
  ],
  additionalProperties: false,
  properties: {
    id: { type: 'integer' },
    filename: { type: 'string' },
    contentType: { type: ['string', 'null'] },
    thumbnailContentType: { type: ['string', 'null'] },
    sizeBytes: { type: ['integer', 'null'] },
    width: { type: ['integer', 'null'] },
    height: { type: ['integer', 'null'] },
    durationSeconds: { type: ['number', 'null'] },
  },
} as const;

const momentSchema = {
  type: 'object',
  required: ['id', 'title', 'description', 'occurredAt', 'media', 'comments'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    occurredAt: { type: 'string' },
    media: { type: 'array', items: mediaSchema },
    comments: { type: 'array', items: { $ref: 'comment#' } },
  },
} as const;

const commentSchema = {
  $id: 'comment',
  type: 'object',
  required: ['id', 'author', 'content', 'createdAt', 'updatedAt'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer' },
    author: { type: 'string' },
    content: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

const timelineRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addSchema(commentSchema);
  fastify.get('/children', { schema: { response: { 200: { type: 'array', items: childSchema } } } }, async () => {
    return fastify.db
      .prepare('SELECT id, name, due_date AS dueDate, birth_date AS birthDate FROM children ORDER BY id')
      .all();
  });

  fastify.get<{ Querystring: { childId?: number; cursor?: string; limit?: number } }>(
    '/timeline',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            childId: { type: 'integer', minimum: 1 },
            cursor: { type: 'string', maxLength: 300 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['child', 'moments', 'nextCursor'],
            properties: {
              child: { anyOf: [childSchema, { type: 'null' }] },
              moments: { type: 'array', items: momentSchema },
              nextCursor: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
    async (request) => {
      const child = (
        request.query.childId
          ? fastify.db
              .prepare(
                `SELECT id, name, due_date AS dueDate, birth_date AS birthDate
               FROM children WHERE id = ?`,
              )
              .get(request.query.childId)
          : fastify.db
              .prepare(
                `SELECT id, name, due_date AS dueDate, birth_date AS birthDate
               FROM children ORDER BY id LIMIT 1`,
              )
              .get()
      ) as { id: number; name: string | null; dueDate: string | null; birthDate: string | null } | undefined;

      const limit = request.query.limit ?? 20;
      const cursor = decodeCursor(request.query.cursor);
      const rows = !child
        ? []
        : ((cursor
            ? fastify.db
                .prepare(
                  `SELECT id, title, description, occurred_at AS occurredAt
               FROM moments WHERE child_id = ? AND (occurred_at < ? OR (occurred_at = ? AND id < ?))
               ORDER BY occurred_at DESC, id DESC LIMIT ?`,
                )
                .all(child.id, cursor.occurredAt, cursor.occurredAt, cursor.id, limit + 1)
            : fastify.db
                .prepare(
                  `SELECT id, title, description, occurred_at AS occurredAt
               FROM moments WHERE child_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?`,
                )
                .all(child.id, limit + 1)) as Array<{
            id: number;
            title: string;
            description: string | null;
            occurredAt: string;
          }>);

      const hasNextPage = rows.length > limit;
      const moments = rows.slice(0, limit).map((moment) => ({
        ...moment,
        media: fastify.db
          .prepare(
            `SELECT id, filename, content_type AS contentType,
                    thumbnail_content_type AS thumbnailContentType,
                    size_bytes AS sizeBytes, width, height,
                    duration_seconds AS durationSeconds
             FROM media_items WHERE moment_id = ? ORDER BY sort_order, id`,
          )
          .all(moment.id),
        comments: readComments(fastify, moment.id),
      }));
      const last = moments.at(-1);

      return {
        child: child ?? null,
        moments,
        nextCursor: hasNextPage && last ? encodeCursor({ occurredAt: last.occurredAt, id: last.id }) : null,
      };
    },
  );

  fastify.post<{ Body: CreateChildBody }>(
    '/children',
    { preHandler: requireAdmin, schema: { body: childBodySchema, response: { 201: childSchema } } },
    async (request, reply) => {
      const result = fastify.db
        .prepare('INSERT INTO children (name, due_date, birth_date) VALUES (?, ?, ?)')
        .run(request.body.name ?? null, request.body.dueDate ?? null, request.body.birthDate ?? null);
      return reply.code(201).send(readChild(fastify, Number(result.lastInsertRowid)));
    },
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateChildBody }>(
    '/children/:id',
    {
      preHandler: requireAdmin,
      schema: { params: idParamsSchema, body: childBodySchema, response: { 200: childSchema } },
    },
    async (request, reply) => {
      const result = fastify.db
        .prepare(
          `UPDATE children SET name = ?, due_date = ?, birth_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .run(
          request.body.name ?? null,
          request.body.dueDate ?? null,
          request.body.birthDate ?? null,
          Number(request.params.id),
        );
      if (result.changes === 0) return reply.code(404).send({ message: 'Child not found' });
      return readChild(fastify, Number(request.params.id));
    },
  );

  fastify.post<{ Body: CreateMomentBody }>(
    '/moments',
    { preHandler: requireAdmin, schema: { body: momentBodySchema, response: { 201: momentSchema } } },
    async (request, reply) => {
      const result = fastify.db
        .prepare('INSERT INTO moments (child_id, title, description, occurred_at) VALUES (?, ?, ?, ?)')
        .run(request.body.childId, request.body.title, request.body.description ?? null, request.body.occurredAt);
      return reply.code(201).send(readMoment(fastify, Number(result.lastInsertRowid)));
    },
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateMomentBody }>(
    '/moments/:id',
    {
      preHandler: requireAdmin,
      schema: { params: idParamsSchema, body: updateMomentBodySchema, response: { 200: momentSchema } },
    },
    async (request, reply) => {
      const current = fastify.db
        .prepare('SELECT title, description, occurred_at AS occurredAt FROM moments WHERE id = ?')
        .get(Number(request.params.id)) as
        { title: string; description: string | null; occurredAt: string } | undefined;
      if (!current) return reply.code(404).send({ message: 'Moment not found' });
      fastify.db
        .prepare(
          `UPDATE moments SET title = ?, description = ?, occurred_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .run(
          request.body.title ?? current.title,
          request.body.description === undefined ? current.description : request.body.description,
          request.body.occurredAt ?? current.occurredAt,
          Number(request.params.id),
        );
      return readMoment(fastify, Number(request.params.id));
    },
  );

  fastify.post<{ Params: { id: string }; Body: CommentBody }>(
    '/moments/:id/comments',
    { schema: { params: idParamsSchema, body: commentBodySchema, response: { 201: commentSchema } } },
    async (request, reply) => {
      const moment = fastify.db.prepare('SELECT id FROM moments WHERE id = ?').get(Number(request.params.id));
      if (!moment) return reply.code(404).send({ message: 'Moment not found' });
      const result = fastify.db
        .prepare('INSERT INTO comments (moment_id, author, content) VALUES (?, ?, ?)')
        .run(Number(request.params.id), request.body.author.trim(), request.body.content.trim());
      return reply.code(201).send(readComment(fastify, Number(result.lastInsertRowid)));
    },
  );

  fastify.patch<{ Params: { id: string }; Body: CommentBody }>(
    '/comments/:id',
    { schema: { params: idParamsSchema, body: commentBodySchema, response: { 200: commentSchema } } },
    async (request, reply) => {
      const result = fastify.db
        .prepare('UPDATE comments SET author = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(request.body.author.trim(), request.body.content.trim(), Number(request.params.id));
      if (result.changes === 0) return reply.code(404).send({ message: 'Comment not found' });
      return readComment(fastify, Number(request.params.id));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/comments/:id',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      const result = fastify.db.prepare('DELETE FROM comments WHERE id = ?').run(Number(request.params.id));
      if (result.changes === 0) return reply.code(404).send({ message: 'Comment not found' });
      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/moments/:id',
    { preHandler: requireAdmin, schema: { params: idParamsSchema } },
    async (request, reply) => {
      const files = fastify.db
        .prepare(
          'SELECT storage_key AS storageKey FROM media_items WHERE moment_id IN (SELECT id FROM moments WHERE id = ?)',
        )
        .all(Number(request.params.id)) as Array<{ storageKey: string | null }>;
      fastify.db.prepare('DELETE FROM media_items WHERE moment_id = ?').run(Number(request.params.id));
      const result = fastify.db.prepare('DELETE FROM moments WHERE id = ?').run(Number(request.params.id));
      if (result.changes === 0) return reply.code(404).send({ message: 'Moment not found' });

      for (const file of files) {
        if (!file.storageKey) continue;
        await Promise.all([
          rm(fastify.mediaStorage.resolvePath(file.storageKey), { force: true }),
          rm(fastify.mediaStorage.resolvePath(`thumbnails/${file.storageKey}.webp`), { force: true }),
          rm(fastify.mediaStorage.resolvePath(`thumbnails/${file.storageKey}.jpg`), { force: true }),
        ]);
      }
      return reply.code(204).send();
    },
  );
};

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: '^[1-9][0-9]*$' } },
} as const;

const childBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: ['string', 'null'], maxLength: 60 },
    dueDate: { type: ['string', 'null'], maxLength: 30 },
    birthDate: { type: ['string', 'null'], maxLength: 30 },
  },
} as const;

const momentBodySchema = {
  type: 'object',
  required: ['childId', 'title', 'occurredAt'],
  additionalProperties: false,
  properties: {
    childId: { type: 'integer', minimum: 1 },
    title: { type: 'string', minLength: 1, maxLength: 160 },
    description: { type: ['string', 'null'], maxLength: 5000 },
    occurredAt: { type: 'string', minLength: 1, maxLength: 40 },
  },
} as const;

const updateMomentBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 160 },
    description: { type: ['string', 'null'], maxLength: 5000 },
    occurredAt: { type: 'string', minLength: 1, maxLength: 40 },
  },
} as const;

const commentBodySchema = {
  type: 'object',
  required: ['author', 'content'],
  additionalProperties: false,
  properties: {
    author: { type: 'string', minLength: 1, maxLength: 60 },
    content: { type: 'string', minLength: 1, maxLength: 2000 },
  },
} as const;

async function requireAdmin(
  request: { auth?: { role: string } },
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
) {
  if (request.auth?.role !== 'admin') return reply.code(403).send({ message: 'Administrator access required' });
}

function readChild(fastify: Parameters<FastifyPluginAsync>[0], id: number) {
  return fastify.db
    .prepare('SELECT id, name, due_date AS dueDate, birth_date AS birthDate FROM children WHERE id = ?')
    .get(id);
}

function readMoment(fastify: Parameters<FastifyPluginAsync>[0], id: number) {
  const moment = fastify.db
    .prepare('SELECT id, title, description, occurred_at AS occurredAt FROM moments WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!moment) return undefined;
  return {
    ...moment,
    media: fastify.db
      .prepare(
        `SELECT id, filename, content_type AS contentType,
                thumbnail_content_type AS thumbnailContentType,
                size_bytes AS sizeBytes, width, height,
                duration_seconds AS durationSeconds
         FROM media_items WHERE moment_id = ? ORDER BY sort_order, id`,
      )
      .all(id),
    comments: readComments(fastify, id),
  };
}

function readComments(fastify: Parameters<FastifyPluginAsync>[0], momentId: number) {
  return fastify.db
    .prepare(
      `SELECT id, author, content, created_at AS createdAt, updated_at AS updatedAt
       FROM comments WHERE moment_id = ? ORDER BY created_at, id`,
    )
    .all(momentId);
}

function readComment(fastify: Parameters<FastifyPluginAsync>[0], id: number) {
  return fastify.db
    .prepare(
      `SELECT id, author, content, created_at AS createdAt, updated_at AS updatedAt
       FROM comments WHERE id = ?`,
    )
    .get(id);
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value?: string): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof parsed.occurredAt !== 'string' || typeof parsed.id !== 'number') return undefined;
    return { occurredAt: parsed.occurredAt, id: parsed.id };
  } catch {
    return undefined;
  }
}

export default timelineRoutes;
