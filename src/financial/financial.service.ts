import { BadRequestException, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../db/database.service';
import { plans } from '../drizzle/schema/plans';
import { users } from '../drizzle/schema/users';
import {
  expenseTemplates,
  financialExpenses,
  financialPayments,
  financialReceivables,
  userSubscriptions,
} from '../drizzle/schema/financial';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateExpenseTemplateDto } from './dto/create-expense-template.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import {
  expenseCategoryValues,
  expenseStatusValues,
  receivableKindValues,
  receivableStatusValues,
  subscriptionStatusValues,
} from './dto/financial.enums';
import { GenerateExpensesDto } from './dto/generate-expenses.dto';
import { GenerateReceivablesDto } from './dto/generate-receivables.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { UpdateExpenseTemplateDto } from './dto/update-expense-template.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';

type AuditContext = {
  actorUserId: string;
  ip?: string;
  userAgent?: string;
};

type SubscriptionRow = typeof userSubscriptions.$inferSelect;

type ReceivableRow = typeof financialReceivables.$inferSelect;

type ExpenseTemplateRow = typeof expenseTemplates.$inferSelect;

type SubscriptionStatus = (typeof subscriptionStatusValues)[number];

type ReceivableStatus = (typeof receivableStatusValues)[number];

type ReceivableKind = (typeof receivableKindValues)[number];

type ExpenseStatus = (typeof expenseStatusValues)[number];

type ExpenseCategory = (typeof expenseCategoryValues)[number];

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

@Injectable()
export class FinancialService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  private parseDateTime(value?: string | Date | null) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('data invalida');
    }
    return parsed;
  }

  private formatDateOnly(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toDateOnlyDate(value?: string | Date | null) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const match = DATE_ONLY_REGEX.exec(value);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const parsed = new Date(year, month - 1, day);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('data invalida');
      }
      return parsed;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('data invalida');
    }
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  private toDateOnlyString(value?: string | Date | null) {
    const parsed = this.toDateOnlyDate(value);
    if (parsed === undefined) {
      return undefined;
    }
    if (parsed === null) {
      return null;
    }
    return this.formatDateOnly(parsed);
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private firstDayOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private lastDayOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  private daysInMonth(date: Date) {
    return this.lastDayOfMonth(date).getDate();
  }

  private buildAuditMetadata(context?: AuditContext) {
    if (!context) {
      return null;
    }
    const metadata: Record<string, string> = {};
    if (context.ip) {
      metadata.ip = context.ip;
    }
    if (context.userAgent) {
      metadata.userAgent = context.userAgent;
    }
    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  private resolvePlanMonthlyAmount(
    plan: Pick<
      typeof plans.$inferSelect,
      'priceCents' | 'promoActive' | 'promoPriceCents' | 'promoEndsAt'
    >,
    startsAt: Date,
  ) {
    const promoValid =
      plan.promoActive &&
      plan.promoPriceCents !== null &&
      (!plan.promoEndsAt || plan.promoEndsAt > startsAt);
    return {
      monthlyAmountCentsSnapshot: promoValid
        ? plan.promoPriceCents ?? plan.priceCents
        : plan.priceCents,
      planPriceCentsSnapshot: plan.priceCents,
      planPromoPriceCentsSnapshot: plan.promoPriceCents ?? null,
    };
  }

  private resolveDueDate(
    competence: Date,
    subscription: Pick<
      SubscriptionRow,
      'dueDateMode' | 'billingDay' | 'customDueDay' | 'customDueDate'
    >,
  ) {
    const daysInMonth = this.daysInMonth(competence);
    if (subscription.dueDateMode === 'fixed_day') {
      if (!subscription.billingDay) {
        throw new BadRequestException('billingDay obrigatorio');
      }
      const day = Math.min(Math.max(subscription.billingDay, 1), daysInMonth);
      return new Date(competence.getFullYear(), competence.getMonth(), day);
    }

    if (subscription.customDueDay) {
      const day = Math.min(
        Math.max(subscription.customDueDay, 1),
        daysInMonth,
      );
      return new Date(competence.getFullYear(), competence.getMonth(), day);
    }

    if (subscription.customDueDate) {
      const customDueDate = this.toDateOnlyDate(subscription.customDueDate);
      if (!customDueDate) {
        throw new BadRequestException('customDueDate invalido');
      }
      if (
        customDueDate.getFullYear() === competence.getFullYear() &&
        customDueDate.getMonth() === competence.getMonth()
      ) {
        return customDueDate;
      }
      const day = Math.min(Math.max(customDueDate.getDate(), 1), daysInMonth);
      return new Date(competence.getFullYear(), competence.getMonth(), day);
    }

    throw new BadRequestException('customDueDay ou customDueDate obrigatorio');
  }

  private computeProration(
    monthlyAmountCents: number,
    startsAt: Date,
    prorationBase: SubscriptionRow['prorationBase'],
  ) {
    const startDate = this.startOfDay(startsAt);
    const totalDays =
      prorationBase === '30_days' ? 30 : this.daysInMonth(startDate);
    const remainingDays = totalDays - startDate.getDate() + 1;
    const amountCents = Math.max(
      0,
      Math.round((monthlyAmountCents * remainingDays) / totalDays),
    );
    return {
      amountCents,
      periodStart: startDate,
      periodEnd: this.lastDayOfMonth(startDate),
    };
  }

  private isPastDue(dueDate: string | Date, now = new Date()) {
    const parsed = this.toDateOnlyDate(dueDate) ?? now;
    const due = this.startOfDay(parsed);
    const today = this.startOfDay(now);
    return due < today;
  }

  private async sumPayments(receivableId: string) {
    const [row] = await this.databaseService.database
      .select({
        total: sql<number>`COALESCE(SUM(${financialPayments.amountCents}), 0)`,
        latestPaidAt: sql<Date | null>`MAX(${financialPayments.paidAt})`,
      })
      .from(financialPayments)
      .where(
        and(
          eq(financialPayments.receivableId, receivableId),
          isNull(financialPayments.deletedAt),
          isNull(financialPayments.voidedAt),
        ),
      );

    return {
      total: Number(row?.total ?? 0),
      latestPaidAt: row?.latestPaidAt ?? null,
    };
  }

  private resolveReceivablePaymentStatus(
    receivable: ReceivableRow,
    totals: { total: number; latestPaidAt: Date | null },
    now = new Date(),
  ) {
    if (totals.total >= receivable.amountCents) {
      return {
        status: 'paid' as const,
        paidAt: totals.latestPaidAt ?? now,
      };
    }
    return {
      status: this.isPastDue(receivable.dueDate, now)
        ? ('overdue' as const)
        : ('open' as const),
      paidAt: null,
    };
  }

  private async ensureUserActive(userId: string) {
    const [user] = await this.databaseService.database
      .select({ id: users.id, active: users.active })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      throw new BadRequestException('Usuario nao encontrado');
    }
    if (!user.active) {
      throw new BadRequestException('Usuario inativo');
    }
  }

  async createSubscription(payload: CreateSubscriptionDto, audit?: AuditContext) {
    const startsAt = this.parseDateTime(payload.startsAt) ?? new Date();
    const dueDateMode = payload.dueDateMode ?? 'fixed_day';
    const billingDay = payload.billingDay ?? null;
    const customDueDate = this.toDateOnlyString(payload.customDueDate ?? null);
    const customDueDay = payload.customDueDay ?? null;

    if (dueDateMode === 'fixed_day' && !billingDay) {
      throw new BadRequestException('billingDay obrigatorio');
    }

    if (dueDateMode === 'custom_date' && !customDueDay && !customDueDate) {
      throw new BadRequestException('customDueDay ou customDueDate obrigatorio');
    }

    await this.ensureUserActive(payload.userId);

    const [plan] = await this.databaseService.database
      .select({
        id: plans.id,
        name: plans.name,
        slug: plans.slug,
        priceCents: plans.priceCents,
        promoPriceCents: plans.promoPriceCents,
        promoActive: plans.promoActive,
        promoEndsAt: plans.promoEndsAt,
      })
      .from(plans)
      .where(and(eq(plans.id, payload.planId), isNull(plans.deletedAt)))
      .limit(1);

    if (!plan) {
      throw new BadRequestException('Plano nao encontrado');
    }

    const [activeSubscription] = await this.databaseService.database
      .select()
      .from(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.userId, payload.userId),
          eq(userSubscriptions.status, 'active'),
          isNull(userSubscriptions.deletedAt),
        ),
      )
      .limit(1);

    let replacedSubscription: SubscriptionRow | null = null;
    if (activeSubscription) {
      if (!payload.replaceActive) {
        throw new BadRequestException('Usuario ja possui assinatura ativa');
      }
      const [updated] = await this.databaseService.database
        .update(userSubscriptions)
        .set({
          status: 'cancelled',
          endsAt: startsAt,
        })
        .where(eq(userSubscriptions.id, activeSubscription.id))
        .returning();

      replacedSubscription = updated ?? activeSubscription;

      await this.auditService.log({
        actorUserId: audit?.actorUserId,
        targetUserId: payload.userId,
        entity: 'financial.subscription',
        entityId: activeSubscription.id,
        action: 'cancel',
        before: activeSubscription,
        after: replacedSubscription,
        metadata: this.buildAuditMetadata(audit),
      });
    }

    const planSnapshot = this.resolvePlanMonthlyAmount(plan, startsAt);
    const notes = payload.notes?.trim() ?? null;

    const [subscription] = await this.databaseService.database
      .insert(userSubscriptions)
      .values({
        userId: payload.userId,
        planId: plan.id,
        status: 'active',
        dueDateMode,
        billingDay: dueDateMode === 'fixed_day' ? billingDay : null,
        customDueDay: dueDateMode === 'custom_date' ? customDueDay : null,
        customDueDate: dueDateMode === 'custom_date' ? customDueDate : null,
        startsAt,
        monthlyAmountCentsSnapshot: planSnapshot.monthlyAmountCentsSnapshot,
        prorationMode: payload.prorationMode ?? 'first_month_prorated',
        prorationBase: payload.prorationBase ?? 'calendar_month',
        planNameSnapshot: plan.name,
        planSlugSnapshot: plan.slug,
        planPriceCentsSnapshot: planSnapshot.planPriceCentsSnapshot,
        planPromoPriceCentsSnapshot: planSnapshot.planPromoPriceCentsSnapshot,
        planMonthsSnapshot: null,
        notes,
      })
      .returning();

    if (!subscription) {
      throw new BadRequestException('Falha ao criar assinatura');
    }

    await this.databaseService.database
      .update(users)
      .set({ planId: plan.id })
      .where(eq(users.id, payload.userId));

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: payload.userId,
      entity: 'financial.subscription',
      entityId: subscription.id,
      action: 'create',
      before: null,
      after: subscription,
      metadata: this.buildAuditMetadata(audit),
    });

    let proratedReceivable: ReceivableRow | null = null;
    if (
      subscription.prorationMode === 'first_month_prorated' &&
      startsAt.getDate() !== 1
    ) {
      const competenceDate = this.firstDayOfMonth(startsAt);
      const competence = this.formatDateOnly(competenceDate);
      const proration = this.computeProration(
        subscription.monthlyAmountCentsSnapshot,
        startsAt,
        subscription.prorationBase,
      );

      const [receivable] = await this.databaseService.database
        .insert(financialReceivables)
        .values({
          userId: subscription.userId,
          subscriptionId: subscription.id,
          competence,
          dueDate: this.formatDateOnly(this.startOfDay(startsAt)),
          amountCents: proration.amountCents,
          status: 'open',
          kind: 'prorated',
          periodStart: this.formatDateOnly(proration.periodStart),
          periodEnd: this.formatDateOnly(proration.periodEnd),
        })
        .returning();

      proratedReceivable = receivable ?? null;

      if (proratedReceivable) {
        await this.auditService.log({
          actorUserId: audit?.actorUserId,
          targetUserId: payload.userId,
          entity: 'financial.receivable',
          entityId: proratedReceivable.id,
          action: 'create',
          before: null,
          after: proratedReceivable,
          metadata: this.buildAuditMetadata(audit),
        });
      }
    }

    return {
      subscription,
      replacedSubscription,
      proratedReceivable,
    };
  }

  async updateSubscription(
    id: string,
    payload: UpdateSubscriptionDto,
    audit?: AuditContext,
  ) {
    const [current] = await this.databaseService.database
      .select()
      .from(userSubscriptions)
      .where(and(eq(userSubscriptions.id, id), isNull(userSubscriptions.deletedAt)))
      .limit(1);

    if (!current) {
      throw new BadRequestException('Assinatura nao encontrada');
    }

    const updates: Partial<typeof userSubscriptions.$inferInsert> = {};

    if (payload.status !== undefined) {
      if (payload.status === 'active') {
        const [otherActive] = await this.databaseService.database
          .select({ id: userSubscriptions.id })
          .from(userSubscriptions)
          .where(
            and(
              eq(userSubscriptions.userId, current.userId),
              eq(userSubscriptions.status, 'active'),
              isNull(userSubscriptions.deletedAt),
              sql`${userSubscriptions.id} <> ${current.id}`,
            ),
          )
          .limit(1);

        if (otherActive) {
          throw new BadRequestException('Usuario ja possui assinatura ativa');
        }
      }
      updates.status = payload.status;
    }

    if (payload.startsAt !== undefined) {
      updates.startsAt = this.parseDateTime(payload.startsAt) ?? undefined;
    }

    if (payload.endsAt !== undefined) {
      updates.endsAt = this.parseDateTime(payload.endsAt ?? null) ?? null;
    }

    if (
      payload.status &&
      (payload.status === 'cancelled' || payload.status === 'finished') &&
      payload.endsAt === undefined
    ) {
      updates.endsAt = new Date();
    }

    const dueDateMode = payload.dueDateMode ?? current.dueDateMode;
    const billingDay =
      payload.billingDay !== undefined
        ? payload.billingDay
        : current.billingDay;
    const customDueDay =
      payload.customDueDay !== undefined
        ? payload.customDueDay
        : current.customDueDay;
    const customDueDate =
      payload.customDueDate !== undefined
        ? this.toDateOnlyString(payload.customDueDate ?? null)
        : current.customDueDate;

    if (payload.dueDateMode !== undefined) {
      updates.dueDateMode = payload.dueDateMode;
    }

    if (payload.billingDay !== undefined) {
      updates.billingDay = payload.billingDay;
    }

    if (payload.customDueDay !== undefined) {
      updates.customDueDay = payload.customDueDay;
    }

    if (payload.customDueDate !== undefined) {
      updates.customDueDate = this.toDateOnlyString(payload.customDueDate ?? null);
    }

    if (payload.prorationMode !== undefined) {
      updates.prorationMode = payload.prorationMode;
    }

    if (payload.prorationBase !== undefined) {
      updates.prorationBase = payload.prorationBase;
    }

    if (payload.notes !== undefined) {
      updates.notes = payload.notes?.trim() ?? null;
    }

    if (dueDateMode === 'fixed_day' && !billingDay) {
      throw new BadRequestException('billingDay obrigatorio');
    }
    if (dueDateMode === 'custom_date' && !customDueDay && !customDueDate) {
      throw new BadRequestException('customDueDay ou customDueDate obrigatorio');
    }

    if (Object.keys(updates).length === 0) {
      return current;
    }

    const [updated] = await this.databaseService.database
      .update(userSubscriptions)
      .set(updates)
      .where(eq(userSubscriptions.id, id))
      .returning();

    if (updates.status === 'active') {
      await this.databaseService.database
        .update(users)
        .set({ planId: current.planId })
        .where(eq(users.id, current.userId));
    }

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: current.userId,
      entity: 'financial.subscription',
      entityId: current.id,
      action: 'update',
      before: current,
      after: updated ?? current,
      metadata: this.buildAuditMetadata(audit),
    });

    return updated ?? current;
  }

  findSubscriptions(filters?: { userId?: string; status?: SubscriptionStatus }) {
    const whereFilters = [isNull(userSubscriptions.deletedAt)];

    if (filters?.userId) {
      whereFilters.push(eq(userSubscriptions.userId, filters.userId));
    }
    if (filters?.status) {
      whereFilters.push(eq(userSubscriptions.status, filters.status));
    }

    const where =
      whereFilters.length === 1 ? whereFilters[0] : and(...whereFilters);

    return this.databaseService.database
      .select()
      .from(userSubscriptions)
      .where(where)
      .orderBy(desc(userSubscriptions.startsAt));
  }

  async getSubscription(id: string) {
    const [subscription] = await this.databaseService.database
      .select()
      .from(userSubscriptions)
      .where(and(eq(userSubscriptions.id, id), isNull(userSubscriptions.deletedAt)))
      .limit(1);

    return subscription ?? null;
  }

  async generateReceivables(
    payload: GenerateReceivablesDto,
    audit?: AuditContext,
  ) {
    const baseDate =
      this.toDateOnlyDate(payload.competence ?? null) ?? new Date();
    const competenceDate = this.firstDayOfMonth(baseDate);
    const competence = this.formatDateOnly(competenceDate);
    const competenceEnd = this.lastDayOfMonth(competenceDate);

    const subscriptions = await this.databaseService.database
      .select({
        id: userSubscriptions.id,
        userId: userSubscriptions.userId,
        status: userSubscriptions.status,
        startsAt: userSubscriptions.startsAt,
        endsAt: userSubscriptions.endsAt,
        dueDateMode: userSubscriptions.dueDateMode,
        billingDay: userSubscriptions.billingDay,
        customDueDay: userSubscriptions.customDueDay,
        customDueDate: userSubscriptions.customDueDate,
        monthlyAmountCentsSnapshot: userSubscriptions.monthlyAmountCentsSnapshot,
        prorationMode: userSubscriptions.prorationMode,
      })
      .from(userSubscriptions)
      .innerJoin(users, eq(userSubscriptions.userId, users.id))
      .where(
        and(
          eq(userSubscriptions.status, 'active'),
          isNull(userSubscriptions.deletedAt),
          isNull(users.deletedAt),
          eq(users.active, true),
          lte(userSubscriptions.startsAt, competenceEnd),
          or(
            isNull(userSubscriptions.endsAt),
            gte(userSubscriptions.endsAt, competenceDate),
          ),
        ),
      );

    if (subscriptions.length === 0) {
      return { competence, created: [], skipped: 0 };
    }

    const subscriptionIds = subscriptions.map((sub) => sub.id);
    const existing = await this.databaseService.database
      .select({ subscriptionId: financialReceivables.subscriptionId })
      .from(financialReceivables)
      .where(
        and(
          eq(financialReceivables.competence, competence),
          eq(financialReceivables.kind, 'regular'),
          isNull(financialReceivables.deletedAt),
          inArray(financialReceivables.subscriptionId, subscriptionIds),
        ),
      );

    const existingSet = new Set(existing.map((row) => row.subscriptionId));

    const values = subscriptions
      .filter((subscription) => !existingSet.has(subscription.id))
      .filter((subscription) => {
        if (subscription.prorationMode !== 'first_month_prorated') {
          return true;
        }
        const startsAt = subscription.startsAt;
        const startsInCompetenceMonth =
          startsAt.getFullYear() === competenceDate.getFullYear() &&
          startsAt.getMonth() === competenceDate.getMonth();
        return !(startsInCompetenceMonth && startsAt.getDate() !== 1);
      })
      .map((subscription) => ({
        userId: subscription.userId,
        subscriptionId: subscription.id,
        competence,
        dueDate: this.formatDateOnly(
          this.resolveDueDate(competenceDate, subscription),
        ),
        amountCents: subscription.monthlyAmountCentsSnapshot,
        status: 'open' as const,
        kind: 'regular' as const,
      }));

    if (values.length === 0) {
      return { competence, created: [], skipped: existingSet.size };
    }

    const created = await this.databaseService.database
      .insert(financialReceivables)
      .values(values)
      .returning();

    if (audit) {
      for (const receivable of created) {
        await this.auditService.log({
          actorUserId: audit.actorUserId,
          targetUserId: receivable.userId,
          entity: 'financial.receivable',
          entityId: receivable.id,
          action: 'create',
          before: null,
          after: receivable,
          metadata: this.buildAuditMetadata(audit),
        });
      }
    }

    return { competence, created, skipped: existingSet.size };
  }

  async listReceivables(filters?: {
    userId?: string;
    subscriptionId?: string;
    status?: ReceivableStatus;
    kind?: ReceivableKind;
    competence?: string;
  }) {
    const whereFilters = [isNull(financialReceivables.deletedAt)];

    if (filters?.userId) {
      whereFilters.push(eq(financialReceivables.userId, filters.userId));
    }
    if (filters?.subscriptionId) {
      whereFilters.push(
        eq(financialReceivables.subscriptionId, filters.subscriptionId),
      );
    }
    if (filters?.status) {
      whereFilters.push(eq(financialReceivables.status, filters.status));
    }
    if (filters?.kind) {
      whereFilters.push(eq(financialReceivables.kind, filters.kind));
    }
    if (filters?.competence) {
      const competence = this.formatDateOnly(
        this.firstDayOfMonth(
          this.toDateOnlyDate(filters.competence) ?? new Date(),
        ),
      );
      whereFilters.push(eq(financialReceivables.competence, competence));
    }

    const where =
      whereFilters.length === 1 ? whereFilters[0] : and(...whereFilters);

    return this.databaseService.database
      .select({
        id: financialReceivables.id,
        userId: financialReceivables.userId,
        subscriptionId: financialReceivables.subscriptionId,
        competence: financialReceivables.competence,
        dueDate: financialReceivables.dueDate,
        amountCents: financialReceivables.amountCents,
        status: financialReceivables.status,
        kind: financialReceivables.kind,
        paidAt: financialReceivables.paidAt,
        periodStart: financialReceivables.periodStart,
        periodEnd: financialReceivables.periodEnd,
        notes: financialReceivables.notes,
        createdAt: financialReceivables.createdAt,
        updatedAt: financialReceivables.updatedAt,
        paidTotal: sql<number>`COALESCE(SUM(${financialPayments.amountCents}), 0)`,
      })
      .from(financialReceivables)
      .leftJoin(
        financialPayments,
        and(
          eq(financialPayments.receivableId, financialReceivables.id),
          isNull(financialPayments.deletedAt),
          isNull(financialPayments.voidedAt),
        ),
      )
      .where(where)
      .groupBy(financialReceivables.id)
      .orderBy(desc(financialReceivables.dueDate));
  }

  async getReceivable(id: string) {
    const [receivable] = await this.databaseService.database
      .select()
      .from(financialReceivables)
      .where(
        and(eq(financialReceivables.id, id), isNull(financialReceivables.deletedAt)),
      )
      .limit(1);

    return receivable ?? null;
  }

  async createPayment(payload: CreatePaymentDto, audit?: AuditContext) {
    const [receivable] = await this.databaseService.database
      .select()
      .from(financialReceivables)
      .where(
        and(
          eq(financialReceivables.id, payload.receivableId),
          isNull(financialReceivables.deletedAt),
        ),
      )
      .limit(1);

    if (!receivable) {
      throw new BadRequestException('Recebivel nao encontrado');
    }

    if (receivable.status === 'cancelled' || receivable.status === 'renegotiated') {
      throw new BadRequestException('Recebivel indisponivel');
    }

    const paidAt = this.parseDateTime(payload.paidAt) ?? new Date();

    const [payment] = await this.databaseService.database
      .insert(financialPayments)
      .values({
        userId: receivable.userId,
        receivableId: receivable.id,
        amountCents: payload.amountCents,
        method: payload.method,
        paidAt,
        source: 'manual',
        notes: payload.notes?.trim() ?? null,
      })
      .returning();

    if (!payment) {
      throw new BadRequestException('Falha ao registrar pagamento');
    }

    const totals = await this.sumPayments(receivable.id);
    const statusUpdate = this.resolveReceivablePaymentStatus(receivable, totals);

    const [updatedReceivable] = await this.databaseService.database
      .update(financialReceivables)
      .set(statusUpdate)
      .where(eq(financialReceivables.id, receivable.id))
      .returning();

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: receivable.userId,
      entity: 'financial.payment',
      entityId: payment.id,
      action: 'create',
      before: null,
      after: payment,
      metadata: this.buildAuditMetadata(audit),
    });

    if (updatedReceivable) {
      await this.auditService.log({
        actorUserId: audit?.actorUserId,
        targetUserId: receivable.userId,
        entity: 'financial.receivable',
        entityId: receivable.id,
        action: 'update',
        before: receivable,
        after: updatedReceivable,
        metadata: this.buildAuditMetadata(audit),
      });
    }

    return {
      payment,
      receivable: updatedReceivable ?? receivable,
      totals,
    };
  }

  async voidPayment(id: string, payload: VoidPaymentDto, audit?: AuditContext) {
    const [payment] = await this.databaseService.database
      .select()
      .from(financialPayments)
      .where(and(eq(financialPayments.id, id), isNull(financialPayments.deletedAt)))
      .limit(1);

    if (!payment) {
      throw new BadRequestException('Pagamento nao encontrado');
    }

    if (payment.voidedAt) {
      throw new BadRequestException('Pagamento ja estornado');
    }

    const [updatedPayment] = await this.databaseService.database
      .update(financialPayments)
      .set({
        voidedAt: new Date(),
        voidReason: payload.voidReason,
      })
      .where(eq(financialPayments.id, payment.id))
      .returning();

    const [receivable] = await this.databaseService.database
      .select()
      .from(financialReceivables)
      .where(
        and(
          eq(financialReceivables.id, payment.receivableId),
          isNull(financialReceivables.deletedAt),
        ),
      )
      .limit(1);

    if (!receivable) {
      throw new BadRequestException('Recebivel nao encontrado');
    }

    const totals = await this.sumPayments(receivable.id);
    const statusUpdate = this.resolveReceivablePaymentStatus(receivable, totals);

    const [updatedReceivable] = await this.databaseService.database
      .update(financialReceivables)
      .set(statusUpdate)
      .where(eq(financialReceivables.id, receivable.id))
      .returning();

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: receivable.userId,
      entity: 'financial.payment',
      entityId: payment.id,
      action: 'void',
      before: payment,
      after: updatedPayment ?? payment,
      metadata: this.buildAuditMetadata(audit),
    });

    if (updatedReceivable) {
      await this.auditService.log({
        actorUserId: audit?.actorUserId,
        targetUserId: receivable.userId,
        entity: 'financial.receivable',
        entityId: receivable.id,
        action: 'update',
        before: receivable,
        after: updatedReceivable,
        metadata: this.buildAuditMetadata(audit),
      });
    }

    return {
      payment: updatedPayment ?? payment,
      receivable: updatedReceivable ?? receivable,
      totals,
    };
  }

  async listExpenseTemplates(filters?: { active?: boolean }) {
    const whereFilters = [isNull(expenseTemplates.deletedAt)];
    if (filters?.active !== undefined) {
      whereFilters.push(eq(expenseTemplates.active, filters.active));
    }

    const where =
      whereFilters.length === 1 ? whereFilters[0] : and(...whereFilters);

    return this.databaseService.database
      .select()
      .from(expenseTemplates)
      .where(where)
      .orderBy(desc(expenseTemplates.createdAt));
  }

  async createExpenseTemplate(
    payload: CreateExpenseTemplateDto,
    audit?: AuditContext,
  ) {
    const name = payload.name.trim();

    const [existing] = await this.databaseService.database
      .select({ id: expenseTemplates.id })
      .from(expenseTemplates)
      .where(and(eq(expenseTemplates.name, name), isNull(expenseTemplates.deletedAt)))
      .limit(1);

    if (existing) {
      throw new BadRequestException('Template ja existe');
    }

    const [template] = await this.databaseService.database
      .insert(expenseTemplates)
      .values({
        name,
        category: payload.category ?? 'other',
        defaultAmountCents: payload.defaultAmountCents,
        billingDay: payload.billingDay,
        active: payload.active ?? true,
        notes: payload.notes?.trim() ?? null,
      })
      .returning();

    if (!template) {
      throw new BadRequestException('Falha ao criar template');
    }

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      entity: 'financial.expense_template',
      entityId: template.id,
      action: 'create',
      before: null,
      after: template,
      metadata: this.buildAuditMetadata(audit),
    });

    return template;
  }

  async updateExpenseTemplate(
    id: string,
    payload: UpdateExpenseTemplateDto,
    audit?: AuditContext,
  ) {
    const [current] = await this.databaseService.database
      .select()
      .from(expenseTemplates)
      .where(and(eq(expenseTemplates.id, id), isNull(expenseTemplates.deletedAt)))
      .limit(1);

    if (!current) {
      throw new BadRequestException('Template nao encontrado');
    }

    const updates: Partial<typeof expenseTemplates.$inferInsert> = {};
    if (payload.name !== undefined) {
      updates.name = payload.name.trim();
    }
    if (payload.category !== undefined) {
      updates.category = payload.category;
    }
    if (payload.defaultAmountCents !== undefined) {
      updates.defaultAmountCents = payload.defaultAmountCents;
    }
    if (payload.billingDay !== undefined) {
      updates.billingDay = payload.billingDay;
    }
    if (payload.active !== undefined) {
      updates.active = payload.active;
    }
    if (payload.notes !== undefined) {
      updates.notes = payload.notes?.trim() ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return current;
    }

    const [updated] = await this.databaseService.database
      .update(expenseTemplates)
      .set(updates)
      .where(eq(expenseTemplates.id, id))
      .returning();

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      entity: 'financial.expense_template',
      entityId: id,
      action: 'update',
      before: current,
      after: updated ?? current,
      metadata: this.buildAuditMetadata(audit),
    });

    return updated ?? current;
  }

  async generateExpenses(payload: GenerateExpensesDto, audit?: AuditContext) {
    const baseDate =
      this.toDateOnlyDate(payload.competence ?? null) ?? new Date();
    const competenceDate = this.firstDayOfMonth(baseDate);
    const competence = this.formatDateOnly(competenceDate);

    const templates = await this.databaseService.database
      .select()
      .from(expenseTemplates)
      .where(and(eq(expenseTemplates.active, true), isNull(expenseTemplates.deletedAt)));

    if (templates.length === 0) {
      return { competence, created: [], skipped: 0 };
    }

    const templateIds = templates.map((template) => template.id);
    const existing = await this.databaseService.database
      .select({ templateId: financialExpenses.templateId })
      .from(financialExpenses)
      .where(
        and(
          eq(financialExpenses.competence, competence),
          inArray(financialExpenses.templateId, templateIds),
          isNull(financialExpenses.deletedAt),
        ),
      );

    const existingSet = new Set(existing.map((row) => row.templateId));

    const values = templates
      .filter((template) => !existingSet.has(template.id))
      .map((template) => ({
        templateId: template.id,
        category: template.category,
        description: template.name,
        competence,
        dueDate: this.formatDateOnly(
          new Date(
            competenceDate.getFullYear(),
            competenceDate.getMonth(),
            Math.min(template.billingDay, this.daysInMonth(competenceDate)),
          ),
        ),
        amountCents: template.defaultAmountCents,
        status: 'planned' as const,
      }));

    if (values.length === 0) {
      return { competence, created: [], skipped: existingSet.size };
    }

    const created = await this.databaseService.database
      .insert(financialExpenses)
      .values(values)
      .returning();

    if (audit) {
      for (const expense of created) {
        await this.auditService.log({
          actorUserId: audit.actorUserId,
          entity: 'financial.expense',
          entityId: expense.id,
          action: 'create',
          before: null,
          after: expense,
          metadata: this.buildAuditMetadata(audit),
        });
      }
    }

    return { competence, created, skipped: existingSet.size };
  }

  async listExpenses(filters?: {
    competence?: string;
    status?: ExpenseStatus;
    category?: ExpenseCategory;
    templateId?: string;
  }) {
    const whereFilters = [isNull(financialExpenses.deletedAt)];

    if (filters?.competence) {
      const competence = this.formatDateOnly(
        this.firstDayOfMonth(
          this.toDateOnlyDate(filters.competence) ?? new Date(),
        ),
      );
      whereFilters.push(eq(financialExpenses.competence, competence));
    }
    if (filters?.status) {
      whereFilters.push(eq(financialExpenses.status, filters.status));
    }
    if (filters?.category) {
      whereFilters.push(eq(financialExpenses.category, filters.category));
    }
    if (filters?.templateId) {
      whereFilters.push(eq(financialExpenses.templateId, filters.templateId));
    }

    const where =
      whereFilters.length === 1 ? whereFilters[0] : and(...whereFilters);

    return this.databaseService.database
      .select()
      .from(financialExpenses)
      .where(where)
      .orderBy(desc(financialExpenses.competence));
  }

  async createExpense(payload: CreateExpenseDto, audit?: AuditContext) {
    let template: ExpenseTemplateRow | null = null;
    if (payload.templateId) {
      const [templateRow] = await this.databaseService.database
        .select()
        .from(expenseTemplates)
        .where(
          and(
            eq(expenseTemplates.id, payload.templateId),
            isNull(expenseTemplates.deletedAt),
          ),
        )
        .limit(1);

      if (!templateRow) {
        throw new BadRequestException('Template nao encontrado');
      }
      template = templateRow;
    }

    const competenceDate = this.firstDayOfMonth(
      this.toDateOnlyDate(payload.competence) ?? new Date(),
    );
    const competence = this.formatDateOnly(competenceDate);
    const dueDate = this.formatDateOnly(
      this.toDateOnlyDate(payload.dueDate) ?? new Date(),
    );

    const [expense] = await this.databaseService.database
      .insert(financialExpenses)
      .values({
        templateId: payload.templateId ?? null,
        category: payload.category ?? template?.category ?? 'other',
        description: payload.description.trim(),
        competence,
        dueDate,
        amountCents: payload.amountCents,
        status: payload.status ?? 'planned',
        paidAt: this.parseDateTime(payload.paidAt ?? null) ?? null,
        notes: payload.notes?.trim() ?? null,
      })
      .returning();

    if (!expense) {
      throw new BadRequestException('Falha ao criar despesa');
    }

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      entity: 'financial.expense',
      entityId: expense.id,
      action: 'create',
      before: null,
      after: expense,
      metadata: this.buildAuditMetadata(audit),
    });

    return expense;
  }

  async updateExpense(id: string, payload: UpdateExpenseDto, audit?: AuditContext) {
    const [current] = await this.databaseService.database
      .select()
      .from(financialExpenses)
      .where(and(eq(financialExpenses.id, id), isNull(financialExpenses.deletedAt)))
      .limit(1);

    if (!current) {
      throw new BadRequestException('Despesa nao encontrada');
    }

    const updates: Partial<typeof financialExpenses.$inferInsert> = {};
    if (payload.category !== undefined) {
      updates.category = payload.category;
    }
    if (payload.description !== undefined) {
      updates.description = payload.description.trim();
    }
    if (payload.competence !== undefined) {
      updates.competence = this.formatDateOnly(
        this.firstDayOfMonth(
          this.toDateOnlyDate(payload.competence) ?? new Date(),
        ),
      );
    }
    if (payload.dueDate !== undefined) {
      updates.dueDate = this.formatDateOnly(
        this.toDateOnlyDate(payload.dueDate) ?? new Date(),
      );
    }
    if (payload.amountCents !== undefined) {
      updates.amountCents = payload.amountCents;
    }
    if (payload.status !== undefined) {
      updates.status = payload.status;
    }
    if (payload.paidAt !== undefined) {
      updates.paidAt = this.parseDateTime(payload.paidAt ?? null) ?? null;
    }
    if (payload.notes !== undefined) {
      updates.notes = payload.notes?.trim() ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return current;
    }

    const [updated] = await this.databaseService.database
      .update(financialExpenses)
      .set(updates)
      .where(eq(financialExpenses.id, id))
      .returning();

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      entity: 'financial.expense',
      entityId: id,
      action: 'update',
      before: current,
      after: updated ?? current,
      metadata: this.buildAuditMetadata(audit),
    });

    return updated ?? current;
  }

  async getDashboard(filters?: { competence?: string }) {
    const baseDate =
      this.toDateOnlyDate(filters?.competence ?? null) ?? new Date();
    const competence = this.formatDateOnly(this.firstDayOfMonth(baseDate));

    const [receivableTotals] = await this.databaseService.database
      .select({
        total: sql<number>`COALESCE(SUM(${financialReceivables.amountCents}), 0)`,
      })
      .from(financialReceivables)
      .where(
        and(
          eq(financialReceivables.competence, competence),
          isNull(financialReceivables.deletedAt),
          sql`${financialReceivables.status} <> 'cancelled'`,
        ),
      );

    const [paymentTotals] = await this.databaseService.database
      .select({
        total: sql<number>`COALESCE(SUM(${financialPayments.amountCents}), 0)`,
      })
      .from(financialPayments)
      .innerJoin(
        financialReceivables,
        eq(financialPayments.receivableId, financialReceivables.id),
      )
      .where(
        and(
          eq(financialReceivables.competence, competence),
          isNull(financialReceivables.deletedAt),
          isNull(financialPayments.deletedAt),
          isNull(financialPayments.voidedAt),
        ),
      );

    const [expenseTotals] = await this.databaseService.database
      .select({
        total: sql<number>`COALESCE(SUM(${financialExpenses.amountCents}), 0)`,
      })
      .from(financialExpenses)
      .where(
        and(
          eq(financialExpenses.competence, competence),
          isNull(financialExpenses.deletedAt),
          sql`${financialExpenses.status} <> 'cancelled'`,
        ),
      );

    return {
      competence,
      receivablesCents: Number(receivableTotals?.total ?? 0),
      receivedCents: Number(paymentTotals?.total ?? 0),
      expensesCents: Number(expenseTotals?.total ?? 0),
    };
  }
}
