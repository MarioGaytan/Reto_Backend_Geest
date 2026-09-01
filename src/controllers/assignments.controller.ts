import type { Request, Response } from 'express';
import * as assignmentsService from '../services/assignments.service';
import {
  assignUsersSchema,
  completeTaskSchema,
  idParamSchema,
  parseOrThrow,
} from '../utils/validation';

/** POST /tasks/:idTask/assign */
export async function assign(req: Request, res: Response): Promise<void> {
  const taskId = parseOrThrow(idParamSchema, req.params.idTask);
  const { userIds } = parseOrThrow(assignUsersSchema, req.body);
  const result = await assignmentsService.assignUsers(taskId, userIds);
  res.status(200).json(result);
}

/** POST /tasks/:idTask/complete */
export async function complete(req: Request, res: Response): Promise<void> {
  const taskId = parseOrThrow(idParamSchema, req.params.idTask);
  const { userId } = parseOrThrow(completeTaskSchema, req.body);
  const result = await assignmentsService.completeUserPart(taskId, userId);
  res.status(200).json(result);
}
