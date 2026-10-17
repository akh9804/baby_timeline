import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AuthenticationAccount, UserRole } from '../authentication.js';

const sessionCookieName = 'baby_timeline_session';
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;
const sessionLifetimeMs = sessionLifetimeSeconds * 1000;

interface AuthRouteOptions {
  accounts: AuthenticationAccount[];
  secureCookies: boolean;
  sessions: Map<string, { expiresAt: number; accountId: string; role: UserRole }>;
}

interface LoginBody {
  username?: string;
  password: string;
}

export function isAuthenticatedSession(
  request: FastifyRequest,
  sessions: Map<string, { expiresAt: number; accountId: string; role: UserRole }>,
): { accountId: string; role: UserRole } | undefined {
  const cookieValue = request.cookies[sessionCookieName];

  if (!cookieValue) {
    return undefined;
  }

  const session = request.unsignCookie(cookieValue);

  if (!session.valid || !session.value) {
    return undefined;
  }

  const sessionRecord = sessions.get(session.value);

  if (sessionRecord === undefined) {
    return undefined;
  }

  if (sessionRecord.expiresAt <= Date.now()) {
    sessions.delete(session.value);
    return undefined;
  }

  return { accountId: sessionRecord.accountId, role: sessionRecord.role };
}

function findMatchingAccount(
  username: string | undefined,
  providedPassword: string,
  accounts: AuthenticationAccount[],
): AuthenticationAccount | undefined {
  const providedHash = createHash('sha256').update(providedPassword).digest();

  return accounts.find((account) => {
    if (username ? account.username !== username : account.username !== undefined) {
      return false;
    }

    const configuredHash = createHash('sha256').update(account.password).digest();
    return timingSafeEqual(providedHash, configuredHash);
  });
}

const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (fastify, options) => {
  fastify.get('/auth/session', async (request) => {
    const session = isAuthenticatedSession(request, options.sessions);

    return { authenticated: Boolean(session), role: session?.role ?? null };
  });

  fastify.post<{ Body: LoginBody }>(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
        },
      },
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: {
            username: { type: 'string', minLength: 1, maxLength: 320 },
            password: { type: 'string', minLength: 1, maxLength: 1024 },
          },
        },
      },
    },
    async (request, reply) => {
      const account = findMatchingAccount(request.body.username, request.body.password, options.accounts);

      if (!account) {
        return reply.code(401).send({ message: '비밀번호가 올바르지 않습니다.' });
      }

      const sessionValue = randomUUID();
      const now = Date.now();

      for (const [sessionId, sessionRecord] of options.sessions) {
        if (sessionRecord.expiresAt <= now) {
          options.sessions.delete(sessionId);
        }
      }

      options.sessions.set(sessionValue, {
        expiresAt: now + sessionLifetimeMs,
        accountId: account.id,
        role: account.role,
      });

      return reply
        .setCookie(sessionCookieName, sessionValue, {
          httpOnly: true,
          secure: options.secureCookies,
          sameSite: 'strict',
          path: '/',
          maxAge: sessionLifetimeSeconds,
          signed: true,
        })
        .send({ authenticated: true, role: account.role });
    },
  );

  fastify.post('/auth/logout', async (request, reply) => {
    const cookieValue = request.cookies[sessionCookieName];
    const session = cookieValue ? request.unsignCookie(cookieValue) : undefined;

    if (session?.valid && session.value) {
      options.sessions.delete(session.value);
    }

    return reply
      .clearCookie(sessionCookieName, {
        httpOnly: true,
        secure: options.secureCookies,
        sameSite: 'strict',
        path: '/',
      })
      .send({ authenticated: false, role: null });
  });
};

export default authRoutes;
