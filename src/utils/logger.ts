type Level = 'info' | 'warn' | 'error' | 'debug';

/**
 * Durante los tests los logs se silencian: cada peticion y cada query
 * emitirian una linea y harian ilegible la salida de Jest.
 * Con LOG_LEVEL=debug se pueden volver a activar para depurar.
 */
function isSilenced(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.LOG_LEVEL !== 'debug';
}

function write(level: Level, message: string, meta?: unknown): void {
  if (isSilenced()) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta !== undefined ? { meta } : {}),
  };
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') write('debug', message, meta);
  },

};
