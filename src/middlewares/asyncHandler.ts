import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 no captura los rechazos de un handler async, asi que un error
 * dentro de una promesa nunca llegaria al errorHandler central. Este wrapper
 * los reenvia a next().
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
