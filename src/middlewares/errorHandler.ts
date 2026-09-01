import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { isProduction } from '../config/env';

/** Cuerpo JSON mal formado: lo lanza express.json() antes de llegar al controlador. */
function isJsonParseError(err: unknown): boolean {
  return err instanceof SyntaxError && 'body' in err;
}

/**
 * Manejador central de errores. Es el unico lugar que construye una respuesta
 * de error, para que el formato del reto salga siempre igual:
 *   { "error": { "code": "...", "message": "..." } }
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    // details no se serializa: solo alimenta los logs. La respuesta se mantiene
    // exactamente con la forma que exige el reto.
    if (err.details !== undefined) {
      logger.warn(err.code, { message: err.message, details: err.details });
    }
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (isJsonParseError(err)) {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'El cuerpo de la peticion no es JSON valido' },
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  logger.error('Error no controlado', {
    message,
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction ? 'Error interno del servidor' : message,
    },
  });
}
