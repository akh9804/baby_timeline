import { FastifyPluginAsync } from 'fastify';

const pingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/ping', async () => {
    return {
      message: 'pong',
    };
  });
};

export default pingRoutes;
