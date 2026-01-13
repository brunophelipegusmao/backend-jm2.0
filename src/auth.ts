import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from '../drizzle/schema';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}
const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
if (!betterAuthSecret) {
  throw new Error('BETTER_AUTH_SECRET is not set');
}
const betterAuthUrl = process.env.BETTER_AUTH_URL;
if (!betterAuthUrl) {
  throw new Error('BETTER_AUTH_URL is not set');
}
const googleClientId = process.env.GOOGLE_CLIENT_ID;
if (!googleClientId) {
  throw new Error('GOOGLE_CLIENT_ID is not set');
}
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!googleClientSecret) {
  throw new Error('GOOGLE_CLIENT_SECRET is not set');
}

const sql = neon(databaseUrl);
const db = drizzle(sql, { schema });

const authSchema = {
  users: schema.users,
  account: schema.account,
  session: schema.session,
  verification: schema.verification,
  healthProfiles: schema.healthProfiles,
  user: schema.users,
  tb_users: schema.users,
};

const frontendUrl = process.env.FRONTEND_URL;
const trustedOrigins = [betterAuthUrl, frontendUrl].filter(Boolean) as string[];
const socialProviders = {
  google: {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
  },
};

export const auth = betterAuth({
  secret: betterAuthSecret,
  baseURL: betterAuthUrl,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
  account: {
    storeStateStrategy: 'database',
  },
  user: {
    modelName: 'tb_users',
    additionalFields: {
      cpf: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    database: {
      generateId: 'uuid',
    },
  },
  socialProviders,
});
