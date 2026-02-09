import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import {
  financialPayments,
  financialReceivables,
  userSubscriptions,
} from '../../drizzle/schema/financial';
import { plans } from '../../drizzle/schema/plans';
import { users } from '../../drizzle/schema/users';
import { FREE_PLAN_SLUGS, MASTER_PLAN_SLUG } from '../../common/constants/plans';
import { FinancialService } from '../../financial/financial.service';

type SessionUser = { id?: string };

type AuthSession = { user?: SessionUser };

type RequestWithSession = Request & { session?: AuthSession };

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

type BillingDatabase = DatabaseService['database'];

const parseDateOnly = (value: Date | string) => {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = DATE_ONLY_REGEX.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addBusinessDays = (date: Date, days: number) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return result;
};

const isOverdueBusinessDays = (
  dueDate: Date,
  days: number,
  now = new Date(),
) => {
  const limit = addBusinessDays(startOfDay(dueDate), days);
  const today = startOfDay(now);
  return today > limit;
};

export const ensureUserBillingStatus = async (
  database: BillingDatabase,
  userId: string,
) => {
  const [userPlan] = await database
    .select({ planSlug: plans.slug })
    .from(users)
    .leftJoin(plans, eq(users.planId, plans.id))
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (userPlan?.planSlug && FREE_PLAN_SLUGS.has(userPlan.planSlug)) {
    throw new ForbiddenException('Plano free nao permite check-in');
  }

  if (userPlan?.planSlug === MASTER_PLAN_SLUG) {
    return;
  }

  const [activeSubscription] = await database
    .select({ id: userSubscriptions.id })
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, 'active'),
        isNull(userSubscriptions.deletedAt),
      ),
    )
    .limit(1);

  if (!activeSubscription) {
    throw new ForbiddenException('Usuario sem assinatura ativa');
  }

  const receivables = await database
    .select({
      id: financialReceivables.id,
      dueDate: financialReceivables.dueDate,
      amountCents: financialReceivables.amountCents,
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
    .where(
      and(
        eq(financialReceivables.userId, userId),
        isNull(financialReceivables.deletedAt),
        inArray(financialReceivables.status, ['open', 'overdue']),
      ),
    )
    .groupBy(financialReceivables.id);

  const now = new Date();

  for (const receivable of receivables) {
    const paidTotal = Number(receivable.paidTotal ?? 0);
    if (paidTotal >= receivable.amountCents) {
      continue;
    }
    const dueDate = parseDateOnly(receivable.dueDate);
    if (isOverdueBusinessDays(dueDate, 5, now)) {
      throw new ForbiddenException({
        code: 'BILLING_OVERDUE_BUSINESS_DAYS',
        message: 'Mensalidade vencida ha mais de 5 dias uteis',
      });
    }
  }
};

@Injectable()
export class BillingGuard implements CanActivate {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly financialService: FinancialService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const userId = request.session?.user?.id;

    if (!userId) {
      throw new ForbiddenException('Sessao invalida');
    }

    const [user] = await this.databaseService.database
      .select({ id: users.id, active: users.active })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user || !user.active) {
      throw new ForbiddenException('Usuario inativo');
    }

    await this.financialService.expireSubscriptionIfNeeded(userId, {
      actorUserId: userId,
    });

    await ensureUserBillingStatus(this.databaseService.database, userId);

    return true;
  }
}
