import { Router } from 'express';
import * as assignmentsController from '../controllers/assignments.controller';
import * as tasksController from '../controllers/tasks.controller';
import { asyncHandler } from '../middlewares/asyncHandler';
import { idempotent } from '../middlewares/idempotency';

export const tasksRouter = Router();

tasksRouter.post('/', asyncHandler(idempotent(tasksController.create)));
tasksRouter.get('/', asyncHandler(tasksController.list));
tasksRouter.get('/:idTask', asyncHandler(tasksController.getById));

tasksRouter.post('/:idTask/assign', asyncHandler(idempotent(assignmentsController.assign)));
tasksRouter.post('/:idTask/complete', asyncHandler(idempotent(assignmentsController.complete)));
