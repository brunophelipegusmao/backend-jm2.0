import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { healthProfiles } from './health';
import { checkins } from './checkin';
import { plans } from './plans';

export const userRole = pgEnum('user_role', [
  'MASTER',
  'ADMIN',
  'STAFF',
  'COACH',
  'STUDENT',
]);

export const users = pgTable(
  'tb_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    cpf: varchar('cpf', { length: 11 }),
    name: text('name'),
    image: text('image'),
    avatarPublicId: varchar('avatar_public_id', { length: 140 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    password: varchar('password', { length: 255 }),
    address: text('address'),
    phone: varchar('phone', { length: 15 }),
    active: boolean('active').notNull().default(true),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    role: userRole('role').notNull().default('STUDENT'),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => ({
    passwordComplexity: check(
      'password_complexity',
      // Min 6 chars, at least one lower, one upper, one digit, one non-word char.
      sql`${table.password} ~ '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*\\W).{6,}$'`,
    ),
    emailUnique: uniqueIndex('tb_users_email_unique')
      .on(table.email)
      .where(sql`${table.deletedAt} IS NULL`),
    cpfUnique: uniqueIndex('tb_users_cpf_unique')
      .on(table.cpf)
      .where(sql`${table.deletedAt} IS NULL`),
    phoneUnique: uniqueIndex('tb_users_phone_unique')
      .on(table.phone)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

export const usersRelations = relations(users, ({ one }) => ({
  healthProfile: one(healthProfiles, {
    fields: [users.id],
    references: [healthProfiles.userId],
  }),
  plan: one(plans, {
    fields: [users.planId],
    references: [plans.id],
  }),
}));

export const account = pgTable(
  'account',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const session = pgTable(
  'session',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  checkins: many(checkins),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(users, {
    fields: [session.userId],
    references: [users.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(users, {
    fields: [account.userId],
    references: [users.id],
  }),
}));

// Implementação simples para fins de tipagem e uso com drizzle-orm
function index(name: string) {
  return {
    name,
    type: 'index',
    on: (column: any) => ({
      name,
      column,
      type: 'index',
    }),
  };
}
