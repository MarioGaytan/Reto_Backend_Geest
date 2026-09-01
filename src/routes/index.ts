import { Router } from 'express';
import { checkConnection } from '../db/pool';
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

router.use('/users', usersRouter);
router.use('/tasks', tasksRouter);
