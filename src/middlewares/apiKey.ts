import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

/**
 * Comparacion de tiempo constante.
 *
 * Un `!==` corta en el primer byte distinto, y esa diferencia de microsegundos
 * permite deducir la clave caracter a caracter. Se comparan los hashes y no
 * los valores porque timingSafeEqual exige buffers de la misma longitud:
 * comparar longitudes antes ya filtraria informacion.
 */
function equalsInConstantTime(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Lee la clave del header dedicado o de un Authorization: Bearer. */
function extractKey(req: Request): string | null {
  const header = req.header('x-api-key');
  if (header && header.trim() !== '') return header.trim();

  const authorization = req.header('authorization');
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match) return match[1]!.trim();
  }

  return null;
}

/**
 * Protege los endpoints de negocio con una clave compartida.
 *
 * No se aplica a /health: Railway consulta ese endpoint para saber si el
 * servicio vive, y un healthcheck autenticado haria que diera el despliegue
 * por muerto y reiniciara el contenedor en bucle.
 */
export function apiKeyAuth(req: Request, _res: Response, next: NextFunction): void {
  const provided = extractKey(req);

  if (provided === null) {
    next(
      new AppError(
        401,
        'UNAUTHORIZED',
        'Falta el header x-api-key. Consulta el README para obtener la clave',
      ),
    );
    return;
  }

  if (!equalsInConstantTime(provided, env.apiKey)) {
    next(new AppError(401, 'UNAUTHORIZED', 'La API key proporcionada no es valida'));
    return;
  }

  next();
}
