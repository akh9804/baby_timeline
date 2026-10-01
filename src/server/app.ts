import Fastify from 'fastify';
import pingRoutes from './routes/ping.js';

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(pingRoutes);

  return app;
}
