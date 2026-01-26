import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Session, UserSession } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { z } from 'zod';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateExpenseDto,
  createExpenseSchema,
} from './dto/create-expense.dto';
import {
  CreateExpenseTemplateDto,
  createExpenseTemplateSchema,
} from './dto/create-expense-template.dto';
import {
  CreatePaymentDto,
  createPaymentSchema,
} from './dto/create-payment.dto';
import {
  CreateSubscriptionDto,
  createSubscriptionSchema,
} from './dto/create-subscription.dto';
import {
  expenseCategoryValues,
  expenseStatusValues,
  receivableKindValues,
  receivableStatusValues,
  subscriptionStatusValues,
} from './dto/financial.enums';
import {
  GenerateExpensesDto,
  generateExpensesSchema,
} from './dto/generate-expenses.dto';
import {
  GenerateReceivablesDto,
  generateReceivablesSchema,
} from './dto/generate-receivables.dto';
import {
  UpdateExpenseDto,
  updateExpenseSchema,
} from './dto/update-expense.dto';
import {
  UpdateExpenseTemplateDto,
  updateExpenseTemplateSchema,
} from './dto/update-expense-template.dto';
import {
  UpdateSubscriptionDto,
  updateSubscriptionSchema,
} from './dto/update-subscription.dto';
import { VoidPaymentDto, voidPaymentSchema } from './dto/void-payment.dto';
import { FinancialService } from './financial.service';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date',
  });

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return value;
}, z.boolean().optional());

const subscriptionQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  status: z.enum(subscriptionStatusValues).optional(),
});

const receivableQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  subscriptionId: z.string().uuid().optional(),
  status: z.enum(receivableStatusValues).optional(),
  kind: z.enum(receivableKindValues).optional(),
  competence: dateString.optional(),
});

const expenseTemplateQuerySchema = z.object({
  active: optionalBoolean,
});

const expenseQuerySchema = z.object({
  competence: dateString.optional(),
  status: z.enum(expenseStatusValues).optional(),
  category: z.enum(expenseCategoryValues).optional(),
  templateId: z.string().uuid().optional(),
});

const dashboardQuerySchema = z.object({
  competence: dateString.optional(),
});

const normalizeQuery = (query: Record<string, string | string[] | undefined>) =>
  Object.fromEntries(
    Object.entries(query).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );

const parseQuery = <T>(
  schema: z.ZodSchema<T>,
  query: Record<string, string | string[] | undefined>,
) => {
  const normalized = normalizeQuery(query);
  const parsed = schema.safeParse(normalized);
  if (!parsed.success) {
    throw new BadRequestException('Query invalida');
  }
  return parsed.data;
};

@Controller('financial')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MASTER', 'ADMIN', 'STAFF')
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  private requireUserId(session: UserSession | undefined) {
    const userId = session?.user?.id;
    if (!userId) {
      throw new BadRequestException('Sessao invalida');
    }
    return userId;
  }

  private buildAuditContext(
    session: UserSession | undefined,
    request: Request,
  ) {
    const actorUserId = this.requireUserId(session);
    return {
      actorUserId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }

  @Post('subscriptions')
  createSubscription(
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(createSubscriptionSchema))
    payload: CreateSubscriptionDto,
  ) {
    return this.financialService.createSubscription(
      payload,
      this.buildAuditContext(session, request),
    );
  }

  @Get('subscriptions')
  listSubscriptions(
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    const filters = parseQuery(subscriptionQuerySchema, query);
    return this.financialService.findSubscriptions(filters);
  }

  @Get('subscriptions/:id')
  getSubscription(@Param('id') id: string) {
    return this.financialService.getSubscription(id);
  }

  @Patch('subscriptions/:id')
  updateSubscription(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(updateSubscriptionSchema))
    payload: UpdateSubscriptionDto,
  ) {
    return this.financialService.updateSubscription(
      id,
      payload,
      this.buildAuditContext(session, request),
    );
  }

  @Post('receivables/generate')
  generateReceivables(
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(generateReceivablesSchema))
    payload: GenerateReceivablesDto,
  ) {
    return this.financialService.generateReceivables(
      payload,
      this.buildAuditContext(session, request),
    );
  }

  @Get('receivables')
  listReceivables(
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    const filters = parseQuery(receivableQuerySchema, query);
    return this.financialService.listReceivables(filters);
  }

  @Get('receivables/:id')
  getReceivable(@Param('id') id: string) {
    return this.financialService.getReceivable(id);
  }

  @Post('payments')
  createPayment(
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(createPaymentSchema))
    payload: CreatePaymentDto,
  ) {
    return this.financialService.createPayment(
      payload,
      this.buildAuditContext(session, request),
    );
  }

  @Post('payments/:id/void')
  voidPayment(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(voidPaymentSchema))
    payload: VoidPaymentDto,
  ) {
    return this.financialService.voidPayment(
      id,
      payload,
      this.buildAuditContext(session, request),
    );
  }

  @Get('expense-templates')
  listExpenseTemplates(
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    const filters = parseQuery(expenseTemplateQuerySchema, query);
    return this.financialService.listExpenseTemplates(filters);
  }

  @Post('expense-templates')
  createExpenseTemplate(
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(createExpenseTemplateSchema))
    payload: CreateExpenseTemplateDto,
  ) {
    return this.financialService.createExpenseTemplate(
      payload,
      this.buildAuditContext(session, request),
    );
  }

  @Patch('expense-templates/:id')
  updateExpenseTemplate(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(updateExpenseTemplateSchema))
    payload: UpdateExpenseTemplateDto,
  ) {
    return this.financialService.updateExpenseTemplate(
      id,
      payload,
      this.buildAuditContext(session, request),
    );
  }

  @Post('expenses/generate')
  generateExpenses(
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(generateExpensesSchema))
    payload: GenerateExpensesDto,
  ) {
    return this.financialService.generateExpenses(
      payload,
      this.buildAuditContext(session, request),
    );
  }

  @Get('expenses')
  listExpenses(@Query() query: Record<string, string | string[] | undefined>) {
    const filters = parseQuery(expenseQuerySchema, query);
    return this.financialService.listExpenses(filters);
  }

  @Post('expenses')
  createExpense(
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(createExpenseSchema))
    payload: CreateExpenseDto,
  ) {
    return this.financialService.createExpense(
      payload,
      this.buildAuditContext(session, request),
    );
  }

  @Patch('expenses/:id')
  updateExpense(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(updateExpenseSchema))
    payload: UpdateExpenseDto,
  ) {
    return this.financialService.updateExpense(
      id,
      payload,
      this.buildAuditContext(session, request),
    );
  }

  @Get('dashboard')
  getDashboard(@Query() query: Record<string, string | string[] | undefined>) {
    const filters = parseQuery(dashboardQuerySchema, query);
    return this.financialService.getDashboard(filters);
  }
}
