import { z, type ZodTypeAny } from 'zod';
import { AppError } from './AppError';

/**
 * Valida con un esquema de Zod y convierte cualquier fallo en un AppError 400,
 * para que el errorHandler central lo emita con el formato del reto.
 */
export function parseOrThrow<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => {
        const field = issue.path.join('.');
        // Varios mensajes ya nombran el campo; no se antepone dos veces.
        if (!field || issue.message.startsWith(field)) return issue.message;
        return `${field}: ${issue.message}`;
      })
      .join('; ');

    throw new AppError(400, 'VALIDATION_ERROR', message);
  }

  return result.data;
}

// Los campos desconocidos se ignoran en vez de rechazarse (comportamiento
// por defecto de Zod). Es la convencion REST habitual y evita fallar ante un
// cliente que envie campos de mas; lo que se valida con rigor son los campos
// que el reto define.
const nombre = (etiqueta: string) =>
  z
    .string({ required_error: `${etiqueta} es obligatorio`, invalid_type_error: `${etiqueta} debe ser texto` })
    .trim()
    .min(1, `${etiqueta} no puede estar vacio`)
    .max(100, `${etiqueta} no puede exceder 100 caracteres`);

export const createUserSchema = z
  .object({
    name: nombre('name'),
    lastName: nombre('lastName'),
    email: z
      .string({ required_error: 'email es obligatorio', invalid_type_error: 'email debe ser texto' })
      .trim()
      .min(1, 'email no puede estar vacio')
      .max(255, 'email no puede exceder 255 caracteres')
      .email('no es un correo electronico valido')
      // Se normaliza aqui para que la unicidad no dependa de como lo escriba
      // el cliente. La base tambien lo garantiza con un indice sobre lower(email).
      .toLowerCase(),
  });

export const createTaskSchema = z
  .object({
    title: z
      .string({ required_error: 'title es obligatorio', invalid_type_error: 'title debe ser texto' })
      .trim()
      .min(1, 'title no puede estar vacio')
      .max(200, 'title no puede exceder 200 caracteres'),
    description: z
      .string({ invalid_type_error: 'description debe ser texto' })
      .trim()
      .max(5000, 'description no puede exceder 5000 caracteres')
      .nullish()
      .transform((value) => (value === undefined || value === '' ? null : value)),
  });

export const listTasksQuerySchema = z
  .object({
    status: z
      .enum(['open', 'archived'], {
        errorMap: () => ({ message: "status debe ser 'open' o 'archived'" }),
      })
      .optional(),
  });

export const idParamSchema = z.coerce
  .number({ invalid_type_error: 'el id debe ser un numero' })
  .int('el id debe ser un numero entero')
  .positive('el id debe ser un numero positivo');

/** Id que llega dentro de un cuerpo JSON. Se acepta "1" ademas de 1. */
const idEnCuerpo = (etiqueta: string) =>
  z.coerce
    .number({ invalid_type_error: `${etiqueta} debe ser un numero` })
    .int(`${etiqueta} debe ser un numero entero`)
    .positive(`${etiqueta} debe ser un numero positivo`);

export const assignUsersSchema = z.object({
  userIds: z
    .array(idEnCuerpo('cada elemento de userIds'), {
      required_error: 'userIds es obligatorio',
      invalid_type_error: 'userIds debe ser un arreglo de ids',
    })
    .min(1, 'userIds debe contener al menos un id'),
});

export const completeTaskSchema = z.object({
  userId: idEnCuerpo('userId'),
});
