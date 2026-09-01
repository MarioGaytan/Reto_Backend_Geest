import { app } from './app';
import { env } from './config/env';
import { checkConnection, closePool, describeTarget } from './db/pool';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  const dbOk = await checkConnection();
  if (!dbOk) {
    logger.error(`Arranque abortado: PostgreSQL no responde en ${describeTarget()}`);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    logger.info(`API escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    logger.info(`Recibido ${signal}, cerrando servidor...`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  logger.error('Fallo al iniciar la aplicacion', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
