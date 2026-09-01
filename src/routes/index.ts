import { Router } from 'express';
import { checkConnection } from '../db/pool';

export const router = Router();

/**
 * Health check de infraestructura (no forma parte del dominio del reto).
 * Los routers de negocio se montan aqui conforme se implementen:
 *   router.use('/tareas', tareasRouter);
 */
router.get('/health', async (_req, res) => {
  const db = await checkConnection();
  res.status(db ? 200 : 503).json({
    status: db ? 'ok' : 'degraded',
    db: db ? 'up' : 'down',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
