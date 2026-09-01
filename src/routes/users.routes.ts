import { Router } from 'express';
import * as usersController from '../controllers/users.controller';
import { asyncHandler } from '../middlewares/asyncHandler';

export const usersRouter = Router();

usersRouter.post('/', asyncHandler(usersController.create));
usersRouter.get('/', asyncHandler(usersController.list));
