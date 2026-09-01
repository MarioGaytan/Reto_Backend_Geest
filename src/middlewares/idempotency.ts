import { DatabaseError } from 'pg';
import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool';
import { AppError } from '../utils/AppError';
import { hashRequestBody } from '../utils/hash';
import { logger } from '../utils/logger';

const UNIQUE_VIOLATION = '23505';
const STATEMENT_TIMEOUT = '15s';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

interface StoredResponse {
  request_hash: string;
  response_status: number | null;
  response_body: unknown;
}

/** Identidad concreta de la operacion: incluye la ruta real, no el patron. */
function endpointOf(req: Request): string {
  return `${req.method} ${req.baseUrl}${req.path}`.replace(/\/+$/, '') || `${req.method} /`;
}

function readKey(req: Request): string | null {
  const raw = req.header('Idempotency-Key');
  if (raw === undefined) return null;

  const key = raw.trim();
  if (key === '') {
    throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'El header Idempotency-Key no puede estar vacio');
  }
  if (key.length > 255) {
    throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'El header Idempotency-Key no puede exceder 255 caracteres');
  }
  return key;
}

/**
 * Envuelve un handler POST para hacerlo idempotente respecto al header
 * Idempotency-Key.
 *
 * La exclusion mutua la da el indice unico (idem_key, endpoint), no una
 * lectura previa: entre un SELECT y un INSERT hay una ventana en la que dos
 * requests paralelos verian ambos "no existe" y ejecutarian los dos.
 *
 * El request que gana inserta la fila y mantiene su transaccion abierta
 * mientras ejecuta la operacion. El request gemelo queda bloqueado en su
 * propio INSERT (PostgreSQL no puede resolver el conflicto hasta que la
 * primera transaccion termine); cuando el ganador hace COMMIT, el gemelo
 * recibe 23505, lee la respuesta ya guardada y la reproduce identica.
 *
 * Si la operacion falla con 5xx se hace ROLLBACK: el INSERT del gemelo deja
 * de tener conflicto, tiene exito, y pasa a ser el quien ejecuta. Un fallo
 * transitorio no deja la llave inutilizada.
 */
export function idempotent(handler: Handler): Handler {
  return async (req, res, next) => {
    const key = readKey(req);
    if (key === null) {
      // Sin el header la operacion se ejecuta con normalidad: el reto exige
      // aceptarlo, no imponerlo.
      return handler(req, res, next);
    }

    const endpoint = endpointOf(req);
    const requestHash = hashRequestBody(req.body);
    const client = await pool.connect();
    let owns = false;

    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);

      let claimId: number;
      try {
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO idempotency_keys (idem_key, endpoint, request_hash)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [key, endpoint, requestHash],
        );
        claimId = rows[0]!.id;
        owns = true;
      } catch (error) {
        await client.query('ROLLBACK');

        if (error instanceof DatabaseError && error.code === UNIQUE_VIOLATION) {
          return replayStoredResponse(client, key, endpoint, requestHash, res);
        }
        throw error;
      }

      // A partir de aqui este request es el dueño de la operacion.
      const captured = await runCapturing(handler, req, res, next);

      if (captured.status >= 500) {
        // No se cachea un fallo transitorio: al deshacer la reserva, el
        // gemelo bloqueado consigue insertar y reintenta la operacion.
        await client.query('ROLLBACK');
        owns = false;
      } else {
        // RETURNING devuelve el cuerpo ya normalizado por jsonb. El ganador
        // responde con esa misma forma, de modo que su respuesta y la que
        // reproduce el gemelo son identicas byte a byte: jsonb no conserva
        // el orden de las claves, asi que responder el objeto original
        // produciria un JSON equivalente pero no identico.
        const { rows } = await client.query<{ response_body: unknown }>(
          `UPDATE idempotency_keys
              SET response_status = $2, response_body = $3::jsonb
            WHERE id = $1
        RETURNING response_body`,
          [claimId, captured.status, JSON.stringify(captured.body)],
        );
        await client.query('COMMIT');
        owns = false;
        captured.body = rows[0]!.response_body;
      }

      // Tambien los 4xx se responden desde el cuerpo ya normalizado, en vez
      // de relanzar el error: asi el original y su reproduccion coinciden.
      res.status(captured.status).json(captured.body);
      return undefined;
    } catch (error) {
      if (owns) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  };
}

/** Lee la fila que gano la carrera y reproduce su respuesta. */
async function replayStoredResponse(
  client: import('pg').PoolClient,
  key: string,
  endpoint: string,
  requestHash: string,
  res: Response,
): Promise<void> {
  const { rows } = await client.query<StoredResponse>(
    `SELECT request_hash, response_status, response_body
       FROM idempotency_keys
      WHERE idem_key = $1 AND endpoint = $2`,
    [key, endpoint],
  );

  const stored = rows[0];
  if (!stored) {
    // La transaccion ganadora hizo ROLLBACK entre el conflicto y esta lectura.
    throw new AppError(
      409,
      'IDEMPOTENT_REQUEST_IN_PROGRESS',
      'Otra peticion con la misma Idempotency-Key esta en curso. Reintenta',
    );
  }

  if (stored.request_hash !== requestHash) {
    throw new AppError(
      422,
      'IDEMPOTENCY_KEY_REUSED',
      'La Idempotency-Key ya se uso con un cuerpo distinto',
    );
  }

  if (stored.response_status === null) {
    throw new AppError(
      409,
      'IDEMPOTENT_REQUEST_IN_PROGRESS',
      'Otra peticion con la misma Idempotency-Key esta en curso. Reintenta',
    );
  }

  logger.info('idempotencia: respuesta reproducida', { endpoint, status: stored.response_status });
  res.status(stored.response_status).json(stored.response_body);
}

interface Captured {
  status: number;
  body: unknown;
}


/**
 * Ejecuta el handler interceptando res.json para quedarse con la respuesta
 * en vez de enviarla. Solo se envia despues de confirmar la transaccion de
 * la llave, para que nunca se responda algo que no quedo registrado.
 */
async function runCapturing(
  handler: Handler,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Captured> {
  const originalJson = res.json.bind(res);
  let captured: Captured | null = null;

  res.json = ((body: unknown) => {
    captured = { status: res.statusCode, body };
    return res;
  }) as Response['json'];

  try {
    await handler(req, res, next);
  } catch (error) {
    // Los errores de negocio (4xx) tambien se cachean: reintentar con la
    // misma llave y el mismo cuerpo debe dar exactamente la misma respuesta.
    if (error instanceof AppError && error.statusCode < 500) {
      return {
        status: error.statusCode,
        body: { error: { code: error.code, message: error.message } },
      };
    }
    throw error;
  } finally {
    res.json = originalJson;
  }

  if (captured === null) {
    throw AppError.internal('El handler no produjo una respuesta JSON');
  }
  return captured;
}
