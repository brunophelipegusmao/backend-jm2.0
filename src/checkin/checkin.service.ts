import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../db/database.service';
import { checkinBlocks, checkins } from '../drizzle/schema/checkin';
import { users } from '../drizzle/schema/users';
import { ensureUserBillingStatus } from '../financial/guards/billing.guard';
import { AnonymousCheckinRateLimiter } from './anonymous-checkin-rate-limiter';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { CreateIdentifierCheckinDto } from './dto/create-identifier-checkin.dto';
import { UpdateCheckinDto } from './dto/update-checkin.dto';

const CHECKIN_ROLES = new Set(['STAFF', 'COACH', 'STUDENT', 'MASTER', 'ADMIN']);
const CPF_REGEX = /^\d{11}$/;
const CHECKIN_ANON_ACTION = 'anonymous_create';

type IdentifierType = 'email' | 'cpf' | 'email_cpf';

type CheckinAuditContext = {
  ip?: string;
  userAgent?: string;
  identifierType?: IdentifierType;
};

@Injectable()
export class CheckinService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly anonymousRateLimiter: AnonymousCheckinRateLimiter,
  ) {}

  private parseCheckedInAt(value?: string | Date) {
    if (!value) {
      return undefined;
    }
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('checkedInAt invalido');
    }
    return parsed;
  }

  private buildAuditMetadata(context?: CheckinAuditContext) {
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
    if (context.identifierType) {
      metadata.identifierType = context.identifierType;
    }
    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  private normalizeEmail(value?: string) {
    if (!value) {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
  }

  private normalizeCpf(value?: string) {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const digits = trimmed.replace(/\D/g, '');
    if (!CPF_REGEX.test(digits)) {
      throw new BadRequestException('CPF deve conter 11 digitos numericos');
    }
    return digits;
  }

  private assertUserCanCheckin(
    user?: { role: string; active: boolean } | null,
  ) {
    if (!user) {
      throw new BadRequestException('Usuario nao encontrado');
    }

    if (!user.active) {
      throw new ForbiddenException('Usuario inativo');
    }

    if (user.role === 'GUEST') {
      throw new ForbiddenException('Convidado nao pode fazer check-in');
    }

    if (!CHECKIN_ROLES.has(user.role)) {
      throw new ForbiddenException('Usuario sem permissao para check-in');
    }
  }

  private async ensureUserCanCheckin(userId: string) {
    const [user] = await this.databaseService.database
      .select({ role: users.role, active: users.active })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    this.assertUserCanCheckin(user);
  }

  private async ensureUserCanCheckinByIdentifier(
    { email, cpf }: CreateIdentifierCheckinDto,
    context?: Pick<CheckinAuditContext, 'ip'>,
  ) {
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedCpf = this.normalizeCpf(cpf);

    if (!normalizedEmail && !normalizedCpf) {
      throw new BadRequestException('Email ou CPF obrigatorio');
    }

    const identifiers = [normalizedEmail, normalizedCpf].filter(
      (value): value is string => Boolean(value),
    );

    if (identifiers.length > 0) {
      this.anonymousRateLimiter.assertWithinLimit({
        ip: context?.ip,
        identifiers,
      });
    }

    const whereFilters = [isNull(users.deletedAt)];
    if (normalizedEmail && normalizedCpf) {
      whereFilters.push(eq(users.email, normalizedEmail));
      whereFilters.push(eq(users.cpf, normalizedCpf));
    } else if (normalizedEmail) {
      whereFilters.push(eq(users.email, normalizedEmail));
    } else if (normalizedCpf) {
      whereFilters.push(eq(users.cpf, normalizedCpf));
    }

    const [user] = await this.databaseService.database
      .select({ id: users.id, role: users.role, active: users.active })
      .from(users)
      .where(and(...whereFilters))
      .limit(1);

    this.assertUserCanCheckin(user);

    const identifierType: IdentifierType = normalizedEmail
      ? normalizedCpf
        ? 'email_cpf'
        : 'email'
      : 'cpf';

    return { user: user, identifierType };
  }

  private async ensureNotBlocked(userId: string, checkedInAt: Date) {
    const [block] = await this.databaseService.database
      .select({ id: checkinBlocks.id })
      .from(checkinBlocks)
      .where(
        and(
          eq(checkinBlocks.active, true),
          isNull(checkinBlocks.deletedAt),
          lte(checkinBlocks.startsAt, checkedInAt),
          gt(checkinBlocks.endsAt, checkedInAt),
          or(eq(checkinBlocks.userId, userId), isNull(checkinBlocks.userId)),
        ),
      )
      .limit(1);

    if (block) {
      throw new ForbiddenException('Check-in bloqueado no momento');
    }
  }

  private getDayRange(checkedInAt: Date) {
    const startOfDay = new Date(
      checkedInAt.getFullYear(),
      checkedInAt.getMonth(),
      checkedInAt.getDate(),
    );
    const endOfDay = new Date(
      checkedInAt.getFullYear(),
      checkedInAt.getMonth(),
      checkedInAt.getDate() + 1,
    );
    return { startOfDay, endOfDay };
  }

  private async insertCheckinOncePerDay(userId: string, checkedInAt: Date) {
    const { startOfDay, endOfDay } = this.getDayRange(checkedInAt);
    const rows = await this.databaseService.rawQuery(
      `insert into tb_checkins (user_id, checked_in_at)
       select $1, $2
       where not exists (
         select 1
         from tb_checkins
         where user_id = $1
           and checked_in_at >= $3
           and checked_in_at < $4
       )
       returning id, user_id, checked_in_at, created_at, updated_at`,
      [userId, checkedInAt, startOfDay, endOfDay],
    );

    const result = Array.isArray(rows)
      ? rows
      : ((rows as any)?.rows ?? []);
    const row = result[0];
    if (!row) {
      throw new BadRequestException('Check-in ja registrado neste dia');
    }
    return {
      id: row.id,
      userId: row.user_id,
      checkedInAt: row.checked_in_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createForUser(userId: string, createCheckinDto: CreateCheckinDto) {
    const checkedInAt =
      this.parseCheckedInAt(createCheckinDto.checkedInAt) ?? new Date();

    await this.ensureUserCanCheckin(userId);
    await this.ensureNotBlocked(userId, checkedInAt);
    const checkin = await this.insertCheckinOncePerDay(userId, checkedInAt);

    return checkin ?? null;
  }

  async createForIdentifier(
    createCheckinDto: CreateIdentifierCheckinDto,
    context?: Pick<CheckinAuditContext, 'ip' | 'userAgent'>,
  ) {
    const checkedInAt =
      this.parseCheckedInAt(createCheckinDto.checkedInAt) ?? new Date();

    const { user, identifierType } =
      await this.ensureUserCanCheckinByIdentifier(createCheckinDto, context);
    await ensureUserBillingStatus(this.databaseService.database, user.id);
    await this.ensureNotBlocked(user.id, checkedInAt);
    const checkin = await this.insertCheckinOncePerDay(user.id, checkedInAt);

    if (checkin) {
      await this.auditService.log({
        actorUserId: null,
        targetUserId: user.id,
        entity: 'checkin',
        entityId: String(checkin.id),
        action: CHECKIN_ANON_ACTION,
        before: null,
        after: checkin,
        metadata: this.buildAuditMetadata({
          ...context,
          identifierType,
        }),
      });
    }

    return checkin ?? null;
  }

  findAll(userId?: string) {
    const query = this.databaseService.database
      .select()
      .from(checkins)
      .orderBy(desc(checkins.checkedInAt));

    if (userId) {
      return query.where(eq(checkins.userId, userId));
    }

    return query;
  }

  async findOne(id: number) {
    const [checkin] = await this.databaseService.database
      .select()
      .from(checkins)
      .where(eq(checkins.id, id))
      .limit(1);

    return checkin ?? null;
  }

  async update(id: number, updateCheckinDto: UpdateCheckinDto) {
    const checkedInAt = this.parseCheckedInAt(updateCheckinDto.checkedInAt);
    if (!checkedInAt) {
      throw new BadRequestException('checkedInAt e obrigatorio');
    }

    const [checkin] = await this.databaseService.database
      .update(checkins)
      .set({ checkedInAt })
      .where(eq(checkins.id, id))
      .returning();

    return checkin ?? null;
  }

  async remove(id: number) {
    const [checkin] = await this.databaseService.database
      .delete(checkins)
      .where(eq(checkins.id, id))
      .returning();

    return checkin ?? null;
  }

  async findLatestForUser(userId: string) {
    const [checkin] = await this.databaseService.database
      .select()
      .from(checkins)
      .where(eq(checkins.userId, userId))
      .orderBy(desc(checkins.checkedInAt))
      .limit(1);

    return checkin ?? null;
  }
}
