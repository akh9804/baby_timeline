import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import authRoutes, { isAuthenticatedSession } from './routes/auth.js';

export interface AuthenticationOptions {
  password: string;
  cookieSecret: string;
  secureCookies: boolean;
}

const publicRoutes = new Set(['/ping', '/auth/login', '/auth/logout', '/auth/session']);

export function registerAuthentication(fastify: FastifyInstance, options: AuthenticationOptions): void {
  const sessions = new Map<string, number>();

  fastify.register(cookie, { secret: options.cookieSecret });
  fastify.register(rateLimit, { global: false });

  fastify.addHook('preHandler', async (request, reply) => {
    if (publicRoutes.has(request.routeOptions.url ?? '') || isAuthenticatedSession(request, sessions)) {
      return;
    }

    return reply.code(401).send({ message: 'Authentication required' });
  });

  fastify.register(authRoutes, { ...options, sessions });
}
