import 'dotenv/config';

/** Lee una variable obligatoria; corta el arranque si no existe. */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function toBool(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '3000')),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: toBool(optional('DATABASE_SSL', 'false')),
  notifyUrl: required('NOTIFY_URL'),
  apiKey: required('API_KEY'),
} as const;

export const isProduction = env.nodeEnv === 'production';
export const isTest = env.nodeEnv === 'test';
