import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const eventAccessMode = pgEnum('event_access_mode', [
  'open',
  'registered_only',
]);

export const eventRegistrationStatus = pgEnum('event_registration_status', [
  'confirmed',
  'cancelled',
  'waitlisted',
]);

export const events = pgTable(
  'tb_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 220 }).notNull(),
    description: text('description').notNull(),
    date: date('date').notNull(),
    time: varchar('time', { length: 5 }).notNull(),
    endTime: varchar('end_time', { length: 5 }),
    location: varchar('location', { length: 160 }),
    hideLocation: boolean('hide_location').notNull().default(false),
    thumbnailPublicId: varchar('thumbnail_public_id', { length: 140 }),
    thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
    isPublished: boolean('is_published').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    accessMode: eventAccessMode('access_mode').notNull().default('open'),
    capacity: integer('capacity'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
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
    slugUnique: uniqueIndex('tb_events_slug_unique')
      .on(t.slug)
      .where(sql`${t.deletedAt} IS NULL`),
    dateIdx: index('tb_events_date_idx')
      .on(t.date)
      .where(sql`${t.deletedAt} IS NULL`),
    publishedIdx: index('tb_events_published_idx')
      .on(t.isPublished)
      .where(sql`${t.deletedAt} IS NULL`),
    datePublishedIdx: index('tb_events_date_published_idx')
      .on(t.date, t.isPublished)
      .where(sql`${t.deletedAt} IS NULL`),
    slugIdx: index('tb_events_slug_idx')
      .on(t.slug)
      .where(sql`${t.deletedAt} IS NULL`),
  }),
);

export const eventRegistrations = pgTable(
  'tb_event_registrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    name: varchar('name', { length: 160 }),
    email: varchar('email', { length: 160 }),
    status: eventRegistrationStatus('status').notNull().default('confirmed'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    eventIdx: index('tb_event_registrations_event_idx')
      .on(t.eventId)
      .where(sql`${t.deletedAt} IS NULL`),
    statusIdx: index('tb_event_registrations_status_idx')
      .on(t.status)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueUser: uniqueIndex('tb_event_registrations_event_user_unique')
      .on(t.eventId, t.userId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.userId} IS NOT NULL`),
    uniqueEmail: uniqueIndex('tb_event_registrations_event_email_unique')
      .on(t.eventId, t.email)
      .where(sql`${t.deletedAt} IS NULL AND ${t.email} IS NOT NULL`),
  }),
);

export const eventsRelations = relations(events, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [events.createdByUserId],
    references: [users.id],
  }),
  registrations: many(eventRegistrations),
}));

export const eventRegistrationsRelations = relations(
  eventRegistrations,
  ({ one }) => ({
    event: one(events, {
      fields: [eventRegistrations.eventId],
      references: [events.id],
    }),
    user: one(users, {
      fields: [eventRegistrations.userId],
      references: [users.id],
    }),
  }),
);
