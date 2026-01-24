import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import {
  APIError,
  betterAuth,
  type BetterAuthPlugin,
} from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from './drizzle/schema';
import { plans } from './drizzle/schema/plans';
import { users } from './drizzle/schema/users';
import { ensureMasterPlanId, ensureFreePlanId } from './plans/plan.utils';

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

let cachedDefaultPlanId: string | null = null;

const getDefaultPlanId = async () => {
  if (cachedDefaultPlanId) {
    return cachedDefaultPlanId;
  }

  cachedDefaultPlanId = await ensureFreePlanId(db);
  return cachedDefaultPlanId;
};

const hasMasterUser = async () => {
  const [master] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.role, 'MASTER'), isNull(users.deletedAt)),
    )
    .limit(1);
  return Boolean(master);
};

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
const normalizeAuthBaseUrl = (baseUrl: string) => {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/api/auth')) {
    return trimmed;
  }
  return `${trimmed}/api/auth`;
};

const betterAuthBaseUrl = normalizeAuthBaseUrl(betterAuthUrl);
const betterAuthOrigin = new URL(betterAuthUrl).origin;
const trustedOrigins = [betterAuthOrigin, frontendUrl].filter(Boolean) as string[];
const socialProviders = {
  google: {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
  },
};

const resetPasswordWebhookUrl = process.env.RESET_PASSWORD_WEBHOOK_URL;

const sendResetPassword = async (payload: {
  user: { email?: string | null; name?: string | null };
  url: string;
}) => {
  const email = payload.user.email ?? 'email-indisponivel';
  if (resetPasswordWebhookUrl) {
    await fetch(resetPasswordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name: payload.user.name ?? undefined,
        url: payload.url,
      }),
    });
    return;
  }

  console.info(`[auth] Reset password link for ${email}: ${payload.url}`);
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
        handler: async (ctx: any) => {
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
        },
      },
      {
        matcher(context) {
          return context.path === '/sign-in/social';
        },
        handler: async (ctx: any) => {
          if (!profileCompletionUrl && !panelUrl) {
            return;
          }
          const body = (ctx.body ?? {}) as Record<string, any>;
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
        },
      },
    ],
  },
} satisfies BetterAuthPlugin;

export const auth = betterAuth({
  secret: betterAuthSecret,
  baseURL: betterAuthBaseUrl,
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
    sendResetPassword,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const payload = user as { planId?: string | null; role?: string };
          const result: Record<string, unknown> = {};
          const masterExists = await hasMasterUser();

          if (!masterExists) {
            result.role = 'MASTER';
            result.planId = await ensureMasterPlanId(db);
            return { data: result };
          }

          if (payload.role === 'MASTER') {
            throw new APIError('BAD_REQUEST', {
              message: 'Ja existe um master cadastrado',
            });
          }

          if (payload.role === 'ADMIN') {
            result.planId = await ensureMasterPlanId(db);
            return { data: result };
          }

          if (!payload.planId) {
            result.planId = await getDefaultPlanId();
            return { data: result };
          }

          return;
        },
      },
    },
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
