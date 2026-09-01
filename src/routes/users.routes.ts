import { Router } from 'express';
import * as usersController from '../controllers/users.controller';
import { asyncHandler } from '../middlewares/asyncHandler';
import { idempotent } from '../middlewares/idempotency';

export const usersRouter = Router();

usersRouter.post('/', asyncHandler(idempotent(usersController.create)));
usersRouter.get('/', asyncHandler(usersController.list));
usersRouter.get('/:idUser/tasks', asyncHandler(usersController.listTasks));
