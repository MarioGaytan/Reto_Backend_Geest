import express, { type Express } from 'express';
import { router } from './routes';
import { errorHandler, notFound, requestLogger } from './middlewares';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Montado en la raiz: el reto exige los endpoints exactos (POST /users,
  // no POST /api/users). No se antepone ningun prefijo.
  app.use('/', router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
