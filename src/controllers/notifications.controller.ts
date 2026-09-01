import type { Request, Response } from 'express';
import * as notificationsService from '../services/notifications.service';
import { idParamSchema, parseOrThrow } from '../utils/validation';

/** GET /tasks/:idTask/notifications */
export async function list(req: Request, res: Response): Promise<void> {
  const taskId = parseOrThrow(idParamSchema, req.params.idTask);
  const attempts = await notificationsService.listAttempts(taskId);
  res.status(200).json(attempts);
}
