import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const plans = pgTable(
  'tb_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    description: text('description'),
    priceCents: integer('price_cents').notNull(),
    promoPriceCents: integer('promo_price_cents'),
    promoActive: boolean('promo_active').notNull().default(false),
    promoEndsAt: timestamp('promo_ends_at', { withTimezone: true }),
    popular: boolean('popular').notNull().default(false),
    active: boolean('active').notNull().default(true),
    durationDays: integer('duration_days'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date()),
  },
  (t) => ({
    nameUnique: uniqueIndex('tb_plans_name_unique')
      .on(t.name)
      .where(sql`${t.deletedAt} IS NULL`),
    slugUnique: uniqueIndex('tb_plans_slug_unique')
      .on(t.slug)
      .where(sql`${t.deletedAt} IS NULL`),
    activeIdx: index('tb_plans_active_idx')
      .on(t.active)
      .where(sql`${t.deletedAt} IS NULL`),
    popularIdx: index('tb_plans_popular_idx')
      .on(t.popular)
      .where(sql`${t.deletedAt} IS NULL`),
  }),
);

export const plansRelations = relations(plans, ({ many }) => ({
  users: many(users),
}));
