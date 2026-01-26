import { relations, sql } from 'drizzle-orm';
import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  date,
  text,
  boolean,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';

import { users } from './users';
import { plans } from './plans';

/**
 * =========================
 * RECEITA: planos/mensalidade
 * =========================
 */

export const subscriptionStatus = pgEnum('subscription_status', [
  'active',
  'paused',
  'cancelled',
  'finished',
]);

export const receivableStatus = pgEnum('receivable_status', [
  'open',
  'paid',
  'overdue',
  'cancelled',
  'renegotiated',
]);

export const receivableKind = pgEnum('receivable_kind', [
  'regular',
  'prorated',
  'adjustment',
]);

export const paymentMethod = pgEnum('payment_method', [
  'pix',
  'card',
  'cash',
  'transfer',
  'other',
]);

export const paymentSource = pgEnum('payment_source', ['manual', 'gateway']);

export const subscriptionDueDateMode = pgEnum('subscription_due_date_mode', [
  'fixed_day',
  'custom_date',
]);

export const subscriptionProrationMode = pgEnum('subscription_proration_mode', [
  'first_month_prorated',
  'none',
  'full_first_month',
]);

export const subscriptionProrationBase = pgEnum('subscription_proration_base', [
  'calendar_month',
  '30_days',
]);

export const userSubscriptions = pgTable(
  'tb_user_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),

    status: subscriptionStatus('status').notNull().default('active'),

    dueDateMode: subscriptionDueDateMode('due_date_mode')
      .notNull()
      .default('fixed_day'),
    billingDay: integer('billing_day'), // 1..28/31
    customDueDay: integer('custom_due_day'),
    customDueDate: date('custom_due_date'),

    startsAt: timestamp('starts_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),

    monthlyAmountCentsSnapshot: integer(
      'monthly_amount_cents_snapshot',
    ).notNull(),
    prorationMode: subscriptionProrationMode('proration_mode')
      .notNull()
      .default('first_month_prorated'),
    prorationBase: subscriptionProrationBase('proration_base')
      .notNull()
      .default('calendar_month'),

    // Snapshot do plano (histórico não depende do catálogo)
    planNameSnapshot: varchar('plan_name_snapshot', { length: 80 }).notNull(),
    planSlugSnapshot: varchar('plan_slug_snapshot', { length: 120 }).notNull(),
    planPriceCentsSnapshot: integer('plan_price_cents_snapshot').notNull(),
    planPromoPriceCentsSnapshot: integer('plan_promo_price_cents_snapshot'),
    planMonthsSnapshot: integer('plan_months_snapshot'), // opcional (3/6/12)

    notes: text('notes'),

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
    userIdx: index('tb_user_subscriptions_user_idx')
      .on(t.userId)
      .where(sql`${t.deletedAt} IS NULL`),
    statusIdx: index('tb_user_subscriptions_status_idx')
      .on(t.status)
      .where(sql`${t.deletedAt} IS NULL`),

    // 1 assinatura ativa por user (enquanto não deletada)
    oneActivePerUser: uniqueIndex('tb_user_subscriptions_one_active_per_user')
      .on(t.userId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.status} = 'active'`),
  }),
);

export const financialReceivables = pgTable(
  'tb_financial_receivables',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => userSubscriptions.id, { onDelete: 'restrict' }),

    // Competência: use date no 1º dia do mês (ex: 2026-01-01)
    competence: date('competence').notNull(),
    dueDate: date('due_date').notNull(),

    amountCents: integer('amount_cents').notNull(),

    status: receivableStatus('status').notNull().default('open'),
    kind: receivableKind('kind').notNull().default('regular'),
    paidAt: timestamp('paid_at', { withTimezone: true }),

    periodStart: date('period_start'),
    periodEnd: date('period_end'),

    notes: text('notes'),

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
    byUserIdx: index('tb_financial_receivables_user_idx')
      .on(t.userId)
      .where(sql`${t.deletedAt} IS NULL`),

    dueIdx: index('tb_financial_receivables_due_idx')
      .on(t.dueDate)
      .where(sql`${t.deletedAt} IS NULL`),

    statusIdx: index('tb_financial_receivables_status_idx')
      .on(t.status)
      .where(sql`${t.deletedAt} IS NULL`),

    competenceIdx: index('tb_financial_receivables_competence_idx')
      .on(t.competence)
      .where(sql`${t.deletedAt} IS NULL`),

    subscriptionIdx: index('tb_financial_receivables_subscription_idx')
      .on(t.subscriptionId)
      .where(sql`${t.deletedAt} IS NULL`),

    // Evita duplicar mensalidade para mesma assinatura na mesma competência
    uniquePerCompetence: uniqueIndex('tb_financial_receivables_unique_sub_comp')
      .on(t.subscriptionId, t.competence)
      .where(sql`${t.deletedAt} IS NULL AND ${t.kind} = 'regular'`),
  }),
);

export const financialPayments = pgTable(
  'tb_financial_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    receivableId: uuid('receivable_id')
      .notNull()
      .references(() => financialReceivables.id, { onDelete: 'restrict' }),

    amountCents: integer('amount_cents').notNull(),
    method: paymentMethod('method').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    source: paymentSource('source').notNull().default('manual'),

    externalRef: varchar('external_ref', { length: 140 }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    notes: text('notes'),

    // Estorno/anulação sem apagar
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date()),

    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    byUserIdx: index('tb_financial_payments_user_idx')
      .on(t.userId)
      .where(sql`${t.deletedAt} IS NULL`),

    byReceivableIdx: index('tb_financial_payments_receivable_idx')
      .on(t.receivableId)
      .where(sql`${t.deletedAt} IS NULL`),

    paidAtIdx: index('tb_financial_payments_paid_at_idx')
      .on(t.paidAt)
      .where(sql`${t.deletedAt} IS NULL`),

    externalRefUnique: uniqueIndex('tb_financial_payments_external_ref_unique')
      .on(t.externalRef)
      .where(sql`${t.deletedAt} IS NULL AND ${t.externalRef} IS NOT NULL`),
  }),
);

/**
 * =========================
 * DESPESAS: recorrentes e eventuais
 * =========================
 */

export const expenseStatus = pgEnum('expense_status', [
  'planned',
  'approved',
  'paid',
  'cancelled',
]);

export const expenseCategory = pgEnum('expense_category', [
  'rent',
  'payroll',
  'utilities',
  'marketing',
  'software',
  'equipment',
  'maintenance',
  'taxes',
  'other',
]);

/**
 * Templates de despesas recorrentes (ex: aluguel, internet, sistema).
 * Todo mês um job gera lançamentos em tb_financial_expenses.
 */
export const expenseTemplates = pgTable(
  'tb_expense_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    name: varchar('name', { length: 120 }).notNull(),
    category: expenseCategory('category').notNull().default('other'),

    // valor padrão em centavos
    defaultAmountCents: integer('default_amount_cents').notNull(),

    // dia do vencimento todo mês
    billingDay: integer('billing_day').notNull(),

    active: boolean('active').notNull().default(true),

    notes: text('notes'),

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
    activeIdx: index('tb_expense_templates_active_idx')
      .on(t.active)
      .where(sql`${t.deletedAt} IS NULL`),
    categoryIdx: index('tb_expense_templates_category_idx')
      .on(t.category)
      .where(sql`${t.deletedAt} IS NULL`),

    // Evita dois templates ativos com o mesmo nome (se você quiser permitir, remova)
    uniqueActiveName: uniqueIndex('tb_expense_templates_unique_name_active')
      .on(t.name)
      .where(sql`${t.deletedAt} IS NULL`),
  }),
);

/**
 * Lançamentos de despesas (recorrentes ou eventuais).
 * - Se templateId != null => veio de recorrente (template)
 * - Se templateId == null => despesa eventual (avulsa)
 */
export const financialExpenses = pgTable(
  'tb_financial_expenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    templateId: uuid('template_id').references(() => expenseTemplates.id, {
      onDelete: 'restrict',
    }),

    category: expenseCategory('category').notNull().default('other'),
    description: varchar('description', { length: 160 }).notNull(),

    // Competência (mês referência)
    competence: date('competence').notNull(),

    dueDate: date('due_date').notNull(),
    amountCents: integer('amount_cents').notNull(),

    status: expenseStatus('status').notNull().default('planned'),
    paidAt: timestamp('paid_at', { withTimezone: true }),

    /**
     * Auditoria: quem lançou/aprovou (opcional)
     * (Se não quiser, pode remover)
     */
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),

    notes: text('notes'),

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
    competenceIdx: index('tb_financial_expenses_competence_idx')
      .on(t.competence)
      .where(sql`${t.deletedAt} IS NULL`),

    dueIdx: index('tb_financial_expenses_due_idx')
      .on(t.dueDate)
      .where(sql`${t.deletedAt} IS NULL`),

    statusIdx: index('tb_financial_expenses_status_idx')
      .on(t.status)
      .where(sql`${t.deletedAt} IS NULL`),

    templateIdx: index('tb_financial_expenses_template_idx')
      .on(t.templateId)
      .where(sql`${t.deletedAt} IS NULL`),

    categoryIdx: index('tb_financial_expenses_category_idx')
      .on(t.category)
      .where(sql`${t.deletedAt} IS NULL`),

    /**
     * Evita gerar duas vezes a mesma despesa recorrente para o mesmo template e competência.
     * (Só vale quando templateId != null)
     */
    uniqueTemplateCompetence: uniqueIndex(
      'tb_financial_expenses_unique_template_competence',
    )
      .on(t.templateId, t.competence)
      .where(sql`${t.deletedAt} IS NULL AND ${t.templateId} IS NOT NULL`),
  }),
);

/**
 * =========================
 * RELATIONS
 * =========================
 */

export const userSubscriptionsRelations = relations(
  userSubscriptions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [userSubscriptions.userId],
      references: [users.id],
    }),
    plan: one(plans, {
      fields: [userSubscriptions.planId],
      references: [plans.id],
    }),
    receivables: many(financialReceivables),
  }),
);

export const financialReceivablesRelations = relations(
  financialReceivables,
  ({ one, many }) => ({
    user: one(users, {
      fields: [financialReceivables.userId],
      references: [users.id],
    }),
    subscription: one(userSubscriptions, {
      fields: [financialReceivables.subscriptionId],
      references: [userSubscriptions.id],
    }),
    payments: many(financialPayments),
  }),
);

export const financialPaymentsRelations = relations(
  financialPayments,
  ({ one }) => ({
    user: one(users, {
      fields: [financialPayments.userId],
      references: [users.id],
    }),
    receivable: one(financialReceivables, {
      fields: [financialPayments.receivableId],
      references: [financialReceivables.id],
    }),
  }),
);

export const expenseTemplatesRelations = relations(
  expenseTemplates,
  ({ many }) => ({
    expenses: many(financialExpenses),
  }),
);

export const financialExpensesRelations = relations(
  financialExpenses,
  ({ one }) => ({
    template: one(expenseTemplates, {
      fields: [financialExpenses.templateId],
      references: [expenseTemplates.id],
    }),
    createdBy: one(users, {
      fields: [financialExpenses.createdByUserId],
      references: [users.id],
    }),
  }),
);
