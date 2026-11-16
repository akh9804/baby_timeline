import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

const initialLoanBalance = 9_860_000;

interface CreateRepaymentBody {
  amount: number;
  repaidAt: string;
}

const repaymentBodySchema = {
  type: 'object',
  required: ['amount', 'repaidAt'],
  additionalProperties: false,
  properties: {
    amount: { type: 'integer', minimum: 1 },
    repaidAt: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  },
} as const;

const repaymentParamsSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

const repaymentSchema = {
  type: 'object',
  required: ['id', 'amount', 'repaidAt'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer' },
    amount: { type: 'integer', minimum: 1 },
    repaidAt: { type: 'string' },
  },
} as const;

const loanResponseSchema = {
  type: 'object',
  required: ['initialBalance', 'currentBalance', 'repayments'],
  additionalProperties: false,
  properties: {
    initialBalance: { type: 'integer' },
    currentBalance: { type: 'integer' },
    repayments: { type: 'array', items: repaymentSchema },
  },
} as const;

const loanRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/admin/loan',
    { preHandler: requireAdmin, schema: { response: { 200: loanResponseSchema } } },
    async () => readLoan(fastify),
  );

  fastify.post<{ Body: CreateRepaymentBody }>(
    '/admin/loan/repayments',
    {
      preHandler: requireAdmin,
      schema: {
        body: repaymentBodySchema,
        response: { 201: repaymentSchema },
      },
    },
    async (request, reply) => {
      const currentBalance = readLoan(fastify).currentBalance;
      if (request.body.amount > currentBalance) {
        return reply.code(400).send({ message: '상환 금액이 현재 잔액보다 클 수 없습니다.' });
      }

      const result = fastify.db
        .prepare('INSERT INTO loan_repayments (amount, repaid_at) VALUES (?, ?)')
        .run(request.body.amount, request.body.repaidAt);

      return reply.code(201).send({
        id: Number(result.lastInsertRowid),
        amount: request.body.amount,
        repaidAt: request.body.repaidAt,
      });
    },
  );

  fastify.patch<{ Params: { id: string }; Body: CreateRepaymentBody }>(
    '/admin/loan/repayments/:id',
    {
      preHandler: requireAdmin,
      schema: { params: repaymentParamsSchema, body: repaymentBodySchema, response: { 200: repaymentSchema } },
    },
    async (request, reply) => {
      const id = Number(request.params.id);
      const current = fastify.db
        .prepare('SELECT id, amount, repaid_at AS repaidAt FROM loan_repayments WHERE id = ?')
        .get(id) as { id: number; amount: number; repaidAt: string } | undefined;

      if (!current) return reply.code(404).send({ message: '상환 내역을 찾을 수 없습니다.' });

      const availableBalance = readLoan(fastify).currentBalance + current.amount;
      if (request.body.amount > availableBalance) {
        return reply.code(400).send({ message: '상환 금액이 현재 잔액보다 클 수 없습니다.' });
      }

      fastify.db
        .prepare('UPDATE loan_repayments SET amount = ?, repaid_at = ? WHERE id = ?')
        .run(request.body.amount, request.body.repaidAt, id);

      return { id, amount: request.body.amount, repaidAt: request.body.repaidAt };
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/admin/loan/repayments/:id',
    { preHandler: requireAdmin, schema: { params: repaymentParamsSchema } },
    async (request, reply) => {
      const result = fastify.db.prepare('DELETE FROM loan_repayments WHERE id = ?').run(Number(request.params.id));
      if (result.changes === 0) return reply.code(404).send({ message: '상환 내역을 찾을 수 없습니다.' });
      return reply.code(204).send();
    },
  );
};

function readLoan(fastify: Parameters<FastifyPluginAsync>[0]) {
  const repayments = fastify.db
    .prepare(
      `SELECT id, amount, repaid_at AS repaidAt
       FROM loan_repayments
       ORDER BY repaid_at DESC, id DESC`,
    )
    .all() as Array<{ id: number; amount: number; repaidAt: string }>;

  const repaidAmount = repayments.reduce((total, repayment) => total + repayment.amount, 0);
  return {
    initialBalance: initialLoanBalance,
    currentBalance: initialLoanBalance - repaidAmount,
    repayments,
  };
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.auth?.role !== 'admin') return reply.code(403).send({ message: 'Administrator access required' });
}

export default loanRoutes;
