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
import { users } from '../../drizzle/schema/users';

type SessionUser = { id?: string };

type AuthSession = { user?: SessionUser };

type RequestWithSession = Request & { session?: AuthSession };

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

@Injectable()
export class BillingGuard implements CanActivate {
  constructor(private readonly databaseService: DatabaseService) {}

  private parseDateOnly(value: Date | string) {
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
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addBusinessDays(date: Date, days: number) {
    const result = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    let remaining = days;
    while (remaining > 0) {
      result.setDate(result.getDate() + 1);
      const day = result.getDay();
      if (day !== 0 && day !== 6) {
        remaining -= 1;
      }
    }
    return result;
  }

  private isOverdueBusinessDays(dueDate: Date, days: number, now = new Date()) {
    const limit = this.addBusinessDays(this.startOfDay(dueDate), days);
    const today = this.startOfDay(now);
    return today > limit;
  }

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

    const [activeSubscription] = await this.databaseService.database
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

    const receivables = await this.databaseService.database
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
      const dueDate = this.parseDateOnly(receivable.dueDate);
      if (this.isOverdueBusinessDays(dueDate, 5, now)) {
        throw new ForbiddenException({
          code: 'BILLING_OVERDUE_BUSINESS_DAYS',
          message: 'Mensalidade vencida ha mais de 5 dias uteis',
        });
      }
    }

    return true;
  }
}
