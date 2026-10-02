import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

const sessionCookieName = 'baby_timeline_session';
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;
const sessionLifetimeMs = sessionLifetimeSeconds * 1000;

interface AuthRouteOptions {
  password: string;
  secureCookies: boolean;
  sessions: Map<string, number>;
}

interface LoginBody {
  password: string;
}

export function isAuthenticatedSession(request: FastifyRequest, sessions: Map<string, number>): boolean {
  const cookieValue = request.cookies[sessionCookieName];

  if (!cookieValue) {
    return false;
  }

  const session = request.unsignCookie(cookieValue);

  if (!session.valid || !session.value) {
    return false;
  }

  const expiresAt = sessions.get(session.value);

  if (expiresAt === undefined) {
    return false;
  }

  if (expiresAt <= Date.now()) {
    sessions.delete(session.value);
    return false;
  }

  return true;
}

function passwordsMatch(providedPassword: string, configuredPassword: string): boolean {
  const providedHash = createHash('sha256').update(providedPassword).digest();
  const configuredHash = createHash('sha256').update(configuredPassword).digest();

  return timingSafeEqual(providedHash, configuredHash);
}

const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (fastify, options) => {
  fastify.get('/auth/session', async (request) => ({
    authenticated: isAuthenticatedSession(request, options.sessions),
  }));

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
            password: { type: 'string', minLength: 1, maxLength: 1024 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!passwordsMatch(request.body.password, options.password)) {
        return reply.code(401).send({ message: '비밀번호가 올바르지 않습니다.' });
      }

      const sessionValue = randomUUID();
      const now = Date.now();

      for (const [sessionId, expiresAt] of options.sessions) {
        if (expiresAt <= now) {
          options.sessions.delete(sessionId);
        }
      }

      options.sessions.set(sessionValue, now + sessionLifetimeMs);

      return reply
        .setCookie(sessionCookieName, sessionValue, {
          httpOnly: true,
          secure: options.secureCookies,
          sameSite: 'strict',
          path: '/',
          maxAge: sessionLifetimeSeconds,
          signed: true,
        })
        .send({ authenticated: true });
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
      .send({ authenticated: false });
  });
};

export default authRoutes;
