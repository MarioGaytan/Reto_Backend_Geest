import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

/** Exige el header `x-api-key` con el valor de API_KEY. */
export function apiKeyAuth(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.header('x-api-key') ?? req.header('authorization')?.replace(/^Bearer\s+/i, '');

  if (!provided || provided !== env.apiKey) {
    next(AppError.unauthorized());
    return;
  }

  next();
}
