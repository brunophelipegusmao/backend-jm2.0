import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import {
  APIError,
  betterAuth,
  createAuthMiddleware,
  type BetterAuthPlugin,
} from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from './drizzle/schema';
import { users } from './drizzle/schema/users';

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

const normalizeUrl = (base: string, path: string) => {
  const trimmedBase = base.replace(/\/+$/, '');
  const trimmedPath = path.replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedPath}`;
};

const panelUrl =
  process.env.FRONTEND_PANEL_URL ||
  (frontendUrl
    ? normalizeUrl(frontendUrl, process.env.FRONTEND_PANEL_PATH ?? 'panel')
    : undefined);
const profileCompletionUrl =
  process.env.FRONTEND_PROFILE_COMPLETION_URL ||
  (frontendUrl
    ? normalizeUrl(
        frontendUrl,
        process.env.FRONTEND_PROFILE_COMPLETION_PATH ?? 'complete-profile',
      )
    : undefined);

const authPolicyPlugin = {
  id: 'auth-policy',
  hooks: {
    before: [
      {
        matcher(context) {
          return context.path === '/sign-in/email';
        },
        handler: createAuthMiddleware(async (ctx) => {
          const email = ctx.body?.email?.toString().trim().toLowerCase();
          if (!email) {
            return;
          }
          const [user] = await db
            .select({
              id: users.id,
              active: users.active,
              deletedAt: users.deletedAt,
            })
            .from(users)
            .where(and(eq(users.email, email), isNull(users.deletedAt)))
            .limit(1);
          if (user && (user.deletedAt || !user.active)) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Usuario inativo',
            });
          }
        }),
      },
      {
        matcher(context) {
          return context.path === '/sign-in/social';
        },
        handler: createAuthMiddleware(async (ctx) => {
          if (!profileCompletionUrl && !panelUrl) {
            return;
          }
          const body = ctx.body ?? {};
          const updatedBody = {
            ...body,
            ...(panelUrl && !body.callbackURL ? { callbackURL: panelUrl } : {}),
            ...(profileCompletionUrl && !body.newUserCallbackURL
              ? { newUserCallbackURL: profileCompletionUrl }
              : {}),
          };
          return {
            context: {
              body: updatedBody,
            },
          };
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;

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
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      allowDifferentEmails: false,
      updateUserInfoOnLink: true,
    },
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
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [user] = await db
            .select({ active: users.active, deletedAt: users.deletedAt })
            .from(users)
            .where(and(eq(users.id, session.userId), isNull(users.deletedAt)))
            .limit(1);

          if (!user || !user.active) {
            return false;
          }

          return;
        },
      },
    },
  },
  advanced: {
    database: {
      generateId: 'uuid',
    },
  },
  socialProviders,
  plugins: [authPolicyPlugin],
});
