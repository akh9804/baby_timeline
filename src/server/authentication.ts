import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import authRoutes, { isAuthenticatedSession } from './routes/auth.js';

export type UserRole = 'admin' | 'viewer';

export interface AuthenticationAccount {
  id: string;
  username?: string;
  password: string;
  role: UserRole;
}

export interface AuthenticationOptions {
  accounts: AuthenticationAccount[];
  cookieSecret: string;
  secureCookies: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      accountId: string;
      role: UserRole;
    };
  }
}

const publicRoutes = new Set(['/ping', '/auth/login', '/auth/logout', '/auth/session', '/']);

export function registerAuthentication(fastify: FastifyInstance, options: AuthenticationOptions): void {
  const sessions = new Map<string, { expiresAt: number; accountId: string; role: UserRole }>();

  fastify.register(cookie, { secret: options.cookieSecret });
  fastify.register(rateLimit, { global: false });

  fastify.addHook('preHandler', async (request, reply) => {
    const pathname = request.url.split('?', 1)[0] ?? '/';

    if (publicRoutes.has(pathname) || pathname.startsWith('/assets/')) {
      return;
    }

    const session = isAuthenticatedSession(request, sessions);

    if (session) {
      request.auth = { accountId: session.accountId, role: session.role };
      return;
    }

    return reply.code(401).send({ message: 'Authentication required' });
  });

  fastify.register(authRoutes, { ...options, sessions });
}
