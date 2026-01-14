import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const auditLogs = pgTable(
  'tb_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    targetUserId: uuid('target_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    changes: jsonb('changes')
      .$type<Record<string, { before: unknown; after: unknown }>>()
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    actorIdx: index('tb_audit_logs_actor_idx').on(table.actorUserId),
    targetIdx: index('tb_audit_logs_target_idx').on(table.targetUserId),
    entityIdx: index('tb_audit_logs_entity_idx').on(table.entity, table.entityId),
  }),
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
  target: one(users, {
    fields: [auditLogs.targetUserId],
    references: [users.id],
  }),
}));
