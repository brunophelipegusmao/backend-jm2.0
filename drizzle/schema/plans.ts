// src/db/schema/plans.ts
import { relations } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// Se quiser diferenciar tipos de plano no futuro (ex: "standard" vs "exclusive")
export const planTypeEnum = pgEnum('plan_type', ['standard', 'exclusive']);

const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    name: varchar('name', { length: 80 }).notNull(), // Trimestral, Semestral, Anual Exclusivo
    months: integer('months').notNull(), // 3, 6, 12
    price: money('price').notNull(), // valor total do plano

    type: planTypeEnum('type').notNull().default('standard'),

    active: boolean('active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    nameUnique: uniqueIndex('plans_name_unique').on(t.name),
    activeIdx: index('plans_active_idx').on(t.active),
    typeIdx: index('plans_type_idx').on(t.type),
  }),
);

export const userPlans = pgTable(
  'tb_user_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userUnique: uniqueIndex('tb_user_plans_user_unique').on(t.userId),
    planIdx: index('tb_user_plans_plan_idx').on(t.planId),
    userActiveIdx: index('tb_user_plans_user_active_idx').on(t.userId, t.active),
  }),
);

export const plansRelations = relations(plans, ({ many }) => ({
  userPlans: many(userPlans),
}));

export const userPlansRelations = relations(userPlans, ({ one }) => ({
  user: one(users, {
    fields: [userPlans.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [userPlans.planId],
    references: [plans.id],
  }),
}));
