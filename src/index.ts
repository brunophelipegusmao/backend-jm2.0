import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';

// Configuração voltada para Neon (serverless Postgres). Usa connection string se disponível (recomendado).
const connectionString =
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || undefined;

// Detecta host Neon para forçar SSL por padrão.
const isNeonHost =
  (process.env.PGHOST && process.env.PGHOST.includes('neon.tech')) ||
  (connectionString && connectionString.includes('neon.tech'));

const baseConfig: PoolConfig = connectionString
  ? {
      connectionString,
    }
  : {
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    };

const pool = new Pool({
  ...baseConfig,
  ssl:
    process.env.DB_SSL === 'true' || isNeonHost
      ? {
          rejectUnauthorized:
            process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
        }
      : undefined,
  connectionTimeoutMillis: process.env.DB_CONN_TIMEOUT_MS
    ? Number(process.env.DB_CONN_TIMEOUT_MS)
    : 5000,
  idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT_MS
    ? Number(process.env.DB_IDLE_TIMEOUT_MS)
    : 30000,
  max: process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : 10,
});

export const db = drizzle(pool);
export { pool };
