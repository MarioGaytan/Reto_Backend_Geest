import type { Request, Response } from 'express';
import * as usersService from '../services/users.service';
import { createUserSchema, parseOrThrow } from '../utils/validation';

/** POST /users */
export async function create(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createUserSchema, req.body);
  const user = await usersService.createUser(input);
  res.status(201).json(user);
}

/** GET /users */
export async function list(_req: Request, res: Response): Promise<void> {
  const users = await usersService.listUsers();
  res.status(200).json(users);
}
