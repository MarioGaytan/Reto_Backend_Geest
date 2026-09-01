import { Router } from 'express';
import { checkConnection } from '../db/pool';
import { apiKeyAuth } from '../middlewares/apiKey';
import { usersRouter } from './users.routes';
import { tasksRouter } from './tasks.routes';

export const router = Router();

/** Health check de infraestructura (no forma parte del dominio del reto). */
router.get('/health', async (_req, res) => {
  const db = await checkConnection();
  res.status(db ? 200 : 503).json({
    status: db ? 'ok' : 'degraded',
    db: db ? 'up' : 'down',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// La autenticacion se aplica solo a los routers de negocio, nunca a /health,
// que debe seguir siendo consultable por el healthcheck del proveedor.
// Va antes de la idempotencia: no tiene sentido reservar filas en
// idempotency_keys para peticiones que no estan autenticadas.
router.use('/users', apiKeyAuth, usersRouter);
router.use('/tasks', apiKeyAuth, tasksRouter);
