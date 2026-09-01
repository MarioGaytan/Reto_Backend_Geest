import type { Request, Response } from 'express';
import * as tasksService from '../services/tasks.service';
import {
  createTaskSchema,
  idParamSchema,
  listTasksQuerySchema,
  parseOrThrow,
} from '../utils/validation';

/** POST /tasks */
export async function create(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createTaskSchema, req.body);
  const task = await tasksService.createTask(input);
  res.status(201).json(task);
}

/** GET /tasks?status=open|archived */
export async function list(req: Request, res: Response): Promise<void> {
  const { status } = parseOrThrow(listTasksQuerySchema, req.query);
  const tasks = await tasksService.listTasks(status);
  res.status(200).json(tasks);
}

/** GET /tasks/:idTask */
export async function getById(req: Request, res: Response): Promise<void> {
  const id = parseOrThrow(idParamSchema, req.params.idTask);
  const task = await tasksService.getTaskById(id);
  res.status(200).json(task);
}
