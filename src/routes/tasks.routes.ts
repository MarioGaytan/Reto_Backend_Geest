import { Router } from 'express';
import * as tasksController from '../controllers/tasks.controller';
import { asyncHandler } from '../middlewares/asyncHandler';

export const tasksRouter = Router();

tasksRouter.post('/', asyncHandler(tasksController.create));
tasksRouter.get('/', asyncHandler(tasksController.list));
tasksRouter.get('/:idTask', asyncHandler(tasksController.getById));
