import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  like,
  lte,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { DatabaseService } from '../db/database.service';
import { auditLogs } from '../drizzle/schema/audit';
import { eventRegistrations, events } from '../drizzle/schema/events';
import { plans } from '../drizzle/schema/plans';
import { users } from '../drizzle/schema/users';
import { GUEST_PLAN_SLUG } from '../common/constants/plans';
import { ensureGuestPlanId } from '../plans/plan.utils';
import { BirthdayEventsService } from './birthday-events.service';
import { CreateEventDto } from './dto/create-event.dto';
import type { EventGuestRegistrationDto } from './dto/event-guest-registration.dto';
import type { EventRegistrationDto } from './dto/event-registration.dto';
import type { ConfirmRegistrationDto } from './dto/confirm-registration.dto';
import type {
  PublicBirthdaysQueryDto,
  EventsQueryDto,
  PublicEventsQueryDto,
} from './dto/events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';

type AuditContext = {
  actorUserId?: string | null;
  ip?: string;
  userAgent?: string;
};

type EventRow = typeof events.$inferSelect;
type RegistrationRow = typeof eventRegistrations.$inferSelect;

const SLUG_UNIQUE_CONSTRAINT = 'tb_events_slug_unique';
const REG_USER_UNIQUE_CONSTRAINT = 'tb_event_registrations_event_user_unique';
const REG_EMAIL_UNIQUE_CONSTRAINT = 'tb_event_registrations_event_email_unique';
const BIRTHDAY_EVENT_SLUG_LIKE = 'aniversario-%';

@Injectable()
export class EventsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly birthdayEventsService: BirthdayEventsService,
  ) {}

  private async ensureBirthdayEventsUpToDate() {
    await this.birthdayEventsService.syncAllUsersFromHealthIfStale();
  }

  private async ensureBirthdayEventsUpToDateSafe() {
    try {
      await this.ensureBirthdayEventsUpToDate();
    } catch (error) {
      console.warn('[events] Failed to sync birthday events', error);
    }
  }

  private eventStatusSupported: boolean | null = null;

  private async supportsEventStatusColumn() {
    if (this.eventStatusSupported !== null) {
      return this.eventStatusSupported;
    }
    try {
      const rows = await this.databaseService.rawQuery(
        `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tb_events' and column_name = 'status' limit 1`,
      );
      this.eventStatusSupported = rows.length > 0;
    } catch {
      this.eventStatusSupported = true;
    }
    return this.eventStatusSupported;
  }

  private async buildPublishedFilters(filters?: PublicEventsQueryDto) {
    const whereFilters: SQL[] = [isNull(events.deletedAt)];
    const includeCancelled = filters?.includeCancelled === true;

    if (await this.supportsEventStatusColumn()) {
      if (includeCancelled) {
        const visibilityFilter = or(
          and(eq(events.status, 'published'), eq(events.isPublished, true)),
          and(eq(events.status, 'cancelled'), isNotNull(events.publishedAt)),
        );
        if (visibilityFilter) {
          whereFilters.push(visibilityFilter);
        }
      } else {
        whereFilters.push(eq(events.isPublished, true));
        whereFilters.push(eq(events.status, 'published'));
      }
    } else {
      whereFilters.push(eq(events.isPublished, true));
    }

    if (filters?.from) {
      const from = this.normalizeDateInput(filters.from);
      if (from) {
        whereFilters.push(gte(events.date, from));
      }
    }
    if (filters?.to) {
      const to = this.normalizeDateInput(filters.to);
      if (to) {
        whereFilters.push(lte(events.date, to));
      }
    }

    return whereFilters;
  }

  private resolveBirthdayMonth(monthRef?: string) {
    if (!monthRef) {
      return new Date().getMonth() + 1;
    }
    const [, monthText] = monthRef.split('-');
    const month = Number(monthText);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Mes invalido');
    }
    return month;
  }

  private buildAuditMetadata(
    context?: AuditContext,
    extra?: Record<string, unknown>,
  ) {
    const metadata: Record<string, unknown> = { ...(extra ?? {}) };
    if (context?.ip) {
      metadata.ip = context.ip;
    }
    if (context?.userAgent) {
      metadata.userAgent = context.userAgent;
    }
    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  private confirmedRegistrationsCountSql() {
    return sql<number>`(
      select count(*)::int
      from ${eventRegistrations}
      where ${eventRegistrations.eventId} = ${events.id}
        and ${eventRegistrations.status} = 'confirmed'
        and ${eventRegistrations.deletedAt} is null
    )`;
  }

  private async getConfirmedRegistrationsCount(eventId: string) {
    const [countRow] = await this.databaseService.database
      .select({ total: sql<number>`count(*)::int` })
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.status, 'confirmed'),
          isNull(eventRegistrations.deletedAt),
        ),
      );

    return Number(countRow?.total ?? 0);
  }

  private async assertCapacityAvailable(
    eventId: string,
    capacity: number | null,
  ) {
    if (capacity === null) {
      return;
    }

    const confirmedCount = await this.getConfirmedRegistrationsCount(eventId);
    if (confirmedCount >= capacity) {
      throw new ConflictException('Evento lotado');
    }
  }

  private async notifyPaymentReview(
    event: Pick<EventRow, 'id' | 'title' | 'priceCents' | 'paymentMethod'>,
    registration: RegistrationRow,
  ) {
    const webhookUrl = process.env.PAYMENT_REVIEW_WEBHOOK_URL;
    if (!webhookUrl) {
      console.info(
        `[events] Payment review pending for registration ${registration.id} (${event.title})`,
      );
      return;
    }

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          eventTitle: event.title,
          priceCents: event.priceCents,
          paymentMethod: event.paymentMethod,
          registrationId: registration.id,
          userId: registration.userId,
          status: registration.status,
          createdAt: registration.createdAt,
        }),
      });
    } catch (error) {
      console.warn('[events] Failed to notify payment review', error);
    }
  }

  private toDateOnlyDate(value?: string | Date | null) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }

    if (typeof value === 'string') {
      const directMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
      if (directMatch) {
        const year = Number(directMatch[1]);
        const month = Number(directMatch[2]);
        const day = Number(directMatch[3]);
        const parsed = new Date(year, month - 1, day);
        if (
          parsed.getFullYear() !== year ||
          parsed.getMonth() !== month - 1 ||
          parsed.getDate() !== day
        ) {
          throw new BadRequestException('Data invalida');
        }
        return parsed;
      }
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Data invalida');
    }
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  private formatDateOnly(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeDateInput(value?: string) {
    if (!value) {
      return undefined;
    }
    const parsed = this.toDateOnlyDate(value);
    if (!parsed) {
      return undefined;
    }
    return this.formatDateOnly(parsed);
  }

  private slugify(value: string) {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    return normalized;
  }

  private buildSlugCandidate(base: string, suffix?: number) {
    const maxLength = 220;
    if (!suffix) {
      return base.slice(0, maxLength);
    }
    const suffixText = `-${suffix}`;
    const trimmedBase = base.slice(0, maxLength - suffixText.length);
    return `${trimmedBase}${suffixText}`;
  }

  private isUniqueViolation(error: unknown, constraint?: string) {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const typed = error as {
      code?: string;
      constraint?: string;
      message?: string;
    };
    if (typed.code !== '23505') {
      return false;
    }
    if (!constraint) {
      return true;
    }
    return (
      typed.constraint === constraint ||
      (typeof typed.message === 'string' && typed.message.includes(constraint))
    );
  }

  private resolveCapacity(
    accessMode: EventRow['accessMode'],
    capacity?: number | null,
  ) {
    if (accessMode === 'open') {
      return null;
    }
    if (capacity === undefined || capacity === null) {
      throw new BadRequestException('Capacidade obrigatoria');
    }
    if (capacity < 1) {
      throw new BadRequestException('Capacidade invalida');
    }
    return capacity;
  }

  async create(
    payload: CreateEventDto,
    createdByUserId: string,
    audit?: AuditContext,
  ) {
    const accessMode = payload.accessMode;
    const capacity = this.resolveCapacity(accessMode, payload.capacity ?? null);
    const date = this.normalizeDateInput(payload.date);
    if (!date) {
      throw new BadRequestException('Data invalida');
    }

    const baseSlug = this.slugify(payload.title);
    if (!baseSlug) {
      throw new BadRequestException('Titulo invalido');
    }

    const requiresConfirmation = payload.isPaid
      ? true
      : payload.requiresConfirmation;

    let attempt = 0;
    let created: EventRow | null = null;
    while (attempt < 10) {
      const slug =
        attempt === 0
          ? this.buildSlugCandidate(baseSlug)
          : this.buildSlugCandidate(baseSlug, attempt + 1);

      try {
        const [event] = await this.databaseService.database
          .insert(events)
          .values({
            title: payload.title,
            slug,
            description: payload.description,
            date,
            time: payload.time,
            endTime: payload.endTime ?? null,
            location: payload.location,
            hideLocation: payload.hideLocation ?? false,
            accessMode,
            capacity,
            allowGuests: payload.allowGuests,
            requiresConfirmation,
            isPaid: payload.isPaid,
            priceCents: payload.isPaid ? (payload.priceCents ?? null) : null,
            paymentMethod: payload.isPaid
              ? (payload.paymentMethod?.trim() ?? null)
              : null,
            isFeatured: payload.isFeatured ?? false,
            status: 'draft',
            createdByUserId,
          })
          .returning();

        if (!event) {
          throw new BadRequestException('Falha ao criar evento');
        }

        created = event;
        break;
      } catch (error) {
        if (this.isUniqueViolation(error, SLUG_UNIQUE_CONSTRAINT)) {
          attempt += 1;
          continue;
        }
        throw error;
      }
    }

    if (!created) {
      throw new ConflictException('Falha ao gerar slug unico');
    }

    if (created.isFeatured) {
      await this.databaseService.database
        .update(events)
        .set({
          isFeatured: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            isNull(events.deletedAt),
            eq(events.isFeatured, true),
            sql`${events.id} <> ${created.id}`,
          ),
        );
    }

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: created.createdByUserId,
      entity: 'events',
      entityId: created.id,
      action: 'created',
      before: null,
      after: created,
      metadata: this.buildAuditMetadata(audit, {
        accessMode: created.accessMode,
        capacity: created.capacity,
      }),
    });

    return created;
  }

  async findAll(filters?: EventsQueryDto) {
    await this.ensureBirthdayEventsUpToDateSafe();
    const whereFilters: SQL[] = [];

    if (!filters?.includeDeleted) {
      whereFilters.push(isNull(events.deletedAt));
    }
    if (filters?.isPublished !== undefined) {
      whereFilters.push(eq(events.isPublished, filters.isPublished));
    }
    if (filters?.from) {
      const from = this.normalizeDateInput(filters.from);
      if (from) {
        whereFilters.push(gte(events.date, from));
      }
    }
    if (filters?.to) {
      const to = this.normalizeDateInput(filters.to);
      if (to) {
        whereFilters.push(lte(events.date, to));
      }
    }
    if (filters?.search) {
      const term = `%${filters.search}%`;
      const searchFilter = or(
        ilike(events.title, term),
        ilike(events.description, term),
      );
      if (searchFilter) {
        whereFilters.push(searchFilter);
      }
    }

    const query = this.databaseService.database
      .select({
        id: events.id,
        title: events.title,
        slug: events.slug,
        description: events.description,
        date: events.date,
        time: events.time,
        endTime: events.endTime,
        location: events.location,
        hideLocation: events.hideLocation,
        allowGuests: events.allowGuests,
        requiresConfirmation: events.requiresConfirmation,
        isPaid: events.isPaid,
        priceCents: events.priceCents,
        paymentMethod: events.paymentMethod,
        thumbnailPublicId: events.thumbnailPublicId,
        thumbnailUrl: events.thumbnailUrl,
        isFeatured: events.isFeatured,
        status: events.status,
        isPublished: events.isPublished,
        publishedAt: events.publishedAt,
        accessMode: events.accessMode,
        capacity: events.capacity,
        createdByUserId: events.createdByUserId,
        deletedAt: events.deletedAt,
        createdAt: events.createdAt,
        updatedAt: events.updatedAt,
        confirmedRegistrations: this.confirmedRegistrationsCountSql(),
      })
      .from(events);
    if (whereFilters.length > 0) {
      return query.where(and(...whereFilters)).orderBy(desc(events.date));
    }
    return query.orderBy(desc(events.date));
  }

  async findOne(id: string) {
    const [event] = await this.databaseService.database
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1);

    if (!event) {
      throw new NotFoundException('Evento nao encontrado');
    }

    return event;
  }

  async update(id: string, payload: UpdateEventDto, audit?: AuditContext) {
    const [current] = await this.databaseService.database
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1);

    if (!current) {
      throw new NotFoundException('Evento nao encontrado');
    }

    const accessMode = payload.accessMode ?? current.accessMode;
    const incomingCapacity =
      payload.capacity === undefined ? current.capacity : payload.capacity;
    const capacity =
      accessMode === 'open'
        ? null
        : this.resolveCapacity(accessMode, incomingCapacity);

    const updates: Partial<typeof events.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (payload.title !== undefined) {
      updates.title = payload.title;
    }
    if (payload.description !== undefined) {
      updates.description = payload.description;
    }
    if (payload.date !== undefined) {
      const parsedDate = this.normalizeDateInput(payload.date);
      if (!parsedDate) {
        throw new BadRequestException('Data invalida');
      }
      updates.date = parsedDate;
    }
    if (payload.time !== undefined) {
      updates.time = payload.time;
    }
    if (payload.endTime !== undefined) {
      updates.endTime = payload.endTime;
    }
    if (payload.location !== undefined) {
      updates.location = payload.location;
    }
    if (payload.hideLocation !== undefined) {
      updates.hideLocation = payload.hideLocation;
    }
    if (payload.accessMode !== undefined) {
      updates.accessMode = accessMode;
    }
    if (payload.capacity !== undefined || payload.accessMode !== undefined) {
      updates.capacity = capacity;
    }

    const nextIsPaid = payload.isPaid ?? current.isPaid;
    const nextRequiresConfirmation = nextIsPaid
      ? true
      : (payload.requiresConfirmation ?? current.requiresConfirmation);
    const nextPaymentMethod =
      payload.paymentMethod !== undefined
        ? (payload.paymentMethod?.trim() ?? null)
        : current.paymentMethod;
    const nextPriceCents =
      payload.priceCents !== undefined
        ? payload.priceCents
        : current.priceCents;

    if (payload.allowGuests !== undefined) {
      updates.allowGuests = payload.allowGuests;
    }
    if (
      payload.requiresConfirmation !== undefined ||
      payload.isPaid !== undefined
    ) {
      updates.requiresConfirmation = nextRequiresConfirmation;
    }
    if (payload.isPaid !== undefined) {
      updates.isPaid = payload.isPaid;
    }
    if (payload.priceCents !== undefined || payload.isPaid !== undefined) {
      updates.priceCents = nextIsPaid ? (nextPriceCents ?? null) : null;
    }
    if (payload.paymentMethod !== undefined || payload.isPaid !== undefined) {
      updates.paymentMethod = nextIsPaid ? nextPaymentMethod : null;
    }
    if (payload.isFeatured !== undefined) {
      updates.isFeatured = payload.isFeatured;
    }

    if (nextIsPaid) {
      if (!nextPriceCents || nextPriceCents < 1) {
        throw new BadRequestException('Valor do evento é obrigatório');
      }
      if (!nextPaymentMethod) {
        throw new BadRequestException('Forma de pagamento é obrigatória');
      }
    }

    const [updated] = await this.databaseService.database
      .update(events)
      .set(updates)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .returning();

    const result = updated ?? current;

    if (result.isFeatured) {
      await this.databaseService.database
        .update(events)
        .set({
          isFeatured: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            isNull(events.deletedAt),
            eq(events.isFeatured, true),
            sql`${events.id} <> ${result.id}`,
          ),
        );
    }

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: result.createdByUserId,
      entity: 'events',
      entityId: result.id,
      action: 'updated',
      before: current,
      after: result,
      metadata: this.buildAuditMetadata(audit),
    });

    return result;
  }

  async remove(id: string, audit?: AuditContext) {
    const [current] = await this.databaseService.database
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1);

    if (!current) {
      throw new NotFoundException('Evento nao encontrado');
    }

    const [publishLog] = await this.databaseService.database
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entity, 'events'),
          eq(auditLogs.entityId, id),
          eq(auditLogs.action, 'published'),
        ),
      )
      .limit(1);

    const wasPublishedAtLeastOnce =
      current.status === 'published' ||
      current.isPublished ||
      Boolean(current.publishedAt) ||
      Boolean(publishLog);

    if (wasPublishedAtLeastOnce) {
      return this.cancel(id, audit);
    }

    const [removed] = await this.databaseService.database
      .update(events)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .returning();

    const result = removed ?? current;

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: result.createdByUserId,
      entity: 'events',
      entityId: result.id,
      action: 'deleted',
      before: current,
      after: result,
      metadata: this.buildAuditMetadata(audit),
    });

    return result;
  }

  async restore(id: string, audit?: AuditContext) {
    const [current] = await this.databaseService.database
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!current) {
      throw new NotFoundException('Evento nao encontrado');
    }

    let slug = current.slug;

    const [slugConflict] = await this.databaseService.database
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.slug, slug),
          isNull(events.deletedAt),
          sql`${events.id} <> ${current.id}`,
        ),
      )
      .limit(1);

    if (slugConflict) {
      const baseSlug = this.slugify(slug) || slug;
      let attempt = 1;
      let resolved = false;
      while (attempt < 10) {
        const candidate = this.buildSlugCandidate(baseSlug, attempt + 1);
        const [existing] = await this.databaseService.database
          .select({ id: events.id })
          .from(events)
          .where(and(eq(events.slug, candidate), isNull(events.deletedAt)))
          .limit(1);
        if (!existing) {
          slug = candidate;
          resolved = true;
          break;
        }
        attempt += 1;
      }
      if (!resolved) {
        throw new ConflictException('Falha ao restaurar slug');
      }
    }

    const [restored] = await this.databaseService.database
      .update(events)
      .set({ deletedAt: null, slug, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();

    if (!restored) {
      throw new BadRequestException('Falha ao restaurar evento');
    }

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: restored.createdByUserId,
      entity: 'events',
      entityId: restored.id,
      action: 'restored',
      before: current,
      after: restored,
      metadata: this.buildAuditMetadata(audit),
    });

    return restored;
  }

  async publish(id: string, audit?: AuditContext) {
    const [current] = await this.databaseService.database
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1);

    if (!current) {
      throw new NotFoundException('Evento nao encontrado');
    }
    if (current.status === 'cancelled') {
      throw new BadRequestException('Evento cancelado');
    }

    const [published] = await this.databaseService.database
      .update(events)
      .set({
        isPublished: true,
        publishedAt: new Date(),
        status: 'published',
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .returning();

    const result = published ?? current;

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: result.createdByUserId,
      entity: 'events',
      entityId: result.id,
      action: 'published',
      before: current,
      after: result,
      metadata: this.buildAuditMetadata(audit),
    });

    return result;
  }

  async unpublish(id: string, audit?: AuditContext) {
    const [current] = await this.databaseService.database
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1);

    if (!current) {
      throw new NotFoundException('Evento nao encontrado');
    }
    if (current.status === 'cancelled') {
      throw new BadRequestException('Evento cancelado');
    }

    const [unpublished] = await this.databaseService.database
      .update(events)
      .set({
        isPublished: false,
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .returning();

    const result = unpublished ?? current;

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: result.createdByUserId,
      entity: 'events',
      entityId: result.id,
      action: 'unpublished',
      before: current,
      after: result,
      metadata: this.buildAuditMetadata(audit),
    });

    return result;
  }

  async cancel(id: string, audit?: AuditContext) {
    const [current] = await this.databaseService.database
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1);

    if (!current) {
      throw new NotFoundException('Evento nao encontrado');
    }

    if (current.status === 'cancelled') {
      return current;
    }

    const [cancelled] = await this.databaseService.database
      .update(events)
      .set({
        status: 'cancelled',
        isPublished: false,
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .returning();

    const result = cancelled ?? current;

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: result.createdByUserId,
      entity: 'events',
      entityId: result.id,
      action: 'cancelled',
      before: current,
      after: result,
      metadata: this.buildAuditMetadata(audit),
    });

    return result;
  }

  async uncancel(id: string, audit?: AuditContext) {
    const [current] = await this.databaseService.database
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1);

    if (!current) {
      throw new NotFoundException('Evento nao encontrado');
    }

    if (current.status !== 'cancelled') {
      throw new BadRequestException('Evento nao esta cancelado');
    }

    const [restored] = await this.databaseService.database
      .update(events)
      .set({
        status: 'draft',
        isPublished: false,
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .returning();

    const result = restored ?? current;

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: result.createdByUserId,
      entity: 'events',
      entityId: result.id,
      action: 'uncancelled',
      before: current,
      after: result,
      metadata: this.buildAuditMetadata(audit),
    });

    return result;
  }

  async updateThumbnail(
    id: string,
    file: { buffer: Buffer },
    audit?: AuditContext,
  ) {
    const [current] = await this.databaseService.database
      .select({
        id: events.id,
        createdByUserId: events.createdByUserId,
        thumbnailPublicId: events.thumbnailPublicId,
        thumbnailUrl: events.thumbnailUrl,
      })
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .limit(1);

    if (!current) {
      throw new NotFoundException('Evento nao encontrado');
    }

    const uploaded = await this.cloudinaryService.uploadImage(file.buffer, {
      folder: 'events',
    });

    const [updated] = await this.databaseService.database
      .update(events)
      .set({
        thumbnailPublicId: uploaded.publicId,
        thumbnailUrl: uploaded.secureUrl,
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .returning();

    const result = updated ?? current;

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: result.createdByUserId,
      entity: 'events',
      entityId: result.id,
      action: 'thumbnail_updated',
      before: current,
      after: result,
      metadata: this.buildAuditMetadata(audit),
    });

    if (current.thumbnailPublicId) {
      try {
        await this.cloudinaryService.deleteImage(current.thumbnailPublicId);
      } catch {
        // Ignore cleanup failures to avoid breaking thumbnail update.
      }
    }

    return result;
  }

  async listRegistrations(eventId: string) {
    const [event] = await this.databaseService.database
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .limit(1);

    if (!event) {
      throw new NotFoundException('Evento nao encontrado');
    }

    return this.databaseService.database
      .select({
        id: eventRegistrations.id,
        status: eventRegistrations.status,
        userId: eventRegistrations.userId,
        name: eventRegistrations.name,
        email: eventRegistrations.email,
        userName: users.name,
        userEmail: users.email,
        confirmedByUserId: eventRegistrations.confirmedByUserId,
        paymentMethod: eventRegistrations.paymentMethod,
        paymentAmountCents: eventRegistrations.paymentAmountCents,
        confirmedAt: eventRegistrations.confirmedAt,
        cancelledAt: eventRegistrations.cancelledAt,
        createdAt: eventRegistrations.createdAt,
      })
      .from(eventRegistrations)
      .leftJoin(users, eq(eventRegistrations.userId, users.id))
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          isNull(eventRegistrations.deletedAt),
        ),
      )
      .orderBy(desc(eventRegistrations.createdAt));
  }

  async cancelRegistration(
    eventId: string,
    registrationId: string,
    audit?: AuditContext,
  ) {
    const [event] = await this.databaseService.database
      .select({
        id: events.id,
        accessMode: events.accessMode,
        capacity: events.capacity,
        createdByUserId: events.createdByUserId,
      })
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .limit(1);

    if (!event) {
      throw new NotFoundException('Evento nao encontrado');
    }

    const [registration] = await this.databaseService.database
      .select()
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.id, registrationId),
          eq(eventRegistrations.eventId, eventId),
          isNull(eventRegistrations.deletedAt),
        ),
      )
      .limit(1);

    if (!registration) {
      throw new NotFoundException('Inscricao nao encontrada');
    }

    const now = new Date();
    const before = registration;
    let cancelled = registration;
    if (registration.status !== 'cancelled') {
      const [updated] = await this.databaseService.database
        .update(eventRegistrations)
        .set({
          status: 'cancelled',
          cancelledAt: now,
        })
        .where(eq(eventRegistrations.id, registrationId))
        .returning();
      cancelled = updated ?? registration;
    }

    let promoted: RegistrationRow | null = null;
    if (
      registration.status === 'confirmed' &&
      event.accessMode === 'registered_only' &&
      event.capacity !== null
    ) {
      const [waitlisted] = await this.databaseService.database
        .select()
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, eventId),
            eq(eventRegistrations.status, 'waitlisted'),
            isNull(eventRegistrations.deletedAt),
          ),
        )
        .orderBy(asc(eventRegistrations.createdAt))
        .limit(1);

      if (waitlisted) {
        const [promotedRow] = await this.databaseService.database
          .update(eventRegistrations)
          .set({
            status: 'confirmed',
            confirmedAt: now,
          })
          .where(eq(eventRegistrations.id, waitlisted.id))
          .returning();
        promoted = promotedRow ?? waitlisted;
      }
    }

    const result = {
      event,
      before,
      cancelled,
      promoted,
    };

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: result.event.createdByUserId,
      entity: 'events',
      entityId: result.event.id,
      action: 'registration_cancelled',
      before: result.before,
      after: result.cancelled,
      metadata: this.buildAuditMetadata(audit, {
        registrationId: result.cancelled.id,
      }),
    });

    if (result.promoted) {
      await this.auditService.log({
        actorUserId: audit?.actorUserId,
        targetUserId: result.event.createdByUserId,
        entity: 'events',
        entityId: result.event.id,
        action: 'waitlist_promoted',
        before: null,
        after: result.promoted,
        metadata: this.buildAuditMetadata(audit, {
          registrationId: result.promoted.id,
        }),
      });
    }

    return {
      cancelled: result.cancelled,
      promoted: result.promoted,
    };
  }

  async confirmRegistration(
    eventId: string,
    registrationId: string,
    payload: ConfirmRegistrationDto,
    audit?: AuditContext,
  ) {
    const [event] = await this.databaseService.database
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .limit(1);

    if (!event) {
      throw new NotFoundException('Evento nao encontrado');
    }

    const [registration] = await this.databaseService.database
      .select()
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.id, registrationId),
          eq(eventRegistrations.eventId, eventId),
          isNull(eventRegistrations.deletedAt),
        ),
      )
      .limit(1);

    if (!registration) {
      throw new NotFoundException('Inscricao nao encontrada');
    }

    if (registration.status === 'cancelled') {
      throw new BadRequestException('Inscricao cancelada');
    }

    const paymentMethod = payload.paymentMethod ?? event.paymentMethod ?? null;
    const paymentAmountCents =
      payload.paymentAmountCents ?? event.priceCents ?? null;

    if (event.isPaid) {
      if (!paymentMethod) {
        throw new BadRequestException('Forma de pagamento obrigatoria');
      }
      if (!paymentAmountCents || paymentAmountCents < 1) {
        throw new BadRequestException('Valor do pagamento obrigatorio');
      }
    }

    if (registration.status !== 'confirmed' && event.capacity !== null) {
      const [countRow] = await this.databaseService.database
        .select({ total: sql<number>`count(*)` })
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, event.id),
            eq(eventRegistrations.status, 'confirmed'),
            isNull(eventRegistrations.deletedAt),
          ),
        );

      const confirmedCount = Number(countRow?.total ?? 0);
      if (confirmedCount >= event.capacity) {
        throw new ConflictException('Evento lotado');
      }
    }

    if (registration.status === 'confirmed') {
      return registration;
    }

    const now = new Date();
    const [updated] = await this.databaseService.database
      .update(eventRegistrations)
      .set({
        status: 'confirmed',
        confirmedAt: now,
        confirmedByUserId: audit?.actorUserId ?? null,
        paymentMethod: event.isPaid ? paymentMethod : null,
        paymentAmountCents: event.isPaid ? paymentAmountCents : null,
      })
      .where(eq(eventRegistrations.id, registrationId))
      .returning();

    const result = updated ?? registration;

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: event.createdByUserId,
      entity: 'events',
      entityId: event.id,
      action: 'registration_confirmed',
      before: registration,
      after: result,
      metadata: this.buildAuditMetadata(audit, {
        registrationId: result.id,
        paymentMethod: event.isPaid ? paymentMethod : null,
        paymentAmountCents: event.isPaid ? paymentAmountCents : null,
      }),
    });

    return result;
  }

  async listMyRegistrations(userId: string) {
    await this.ensureBirthdayEventsUpToDateSafe();

    const rows = await this.databaseService.database
      .select({
        registrationId: eventRegistrations.id,
        registrationStatus: eventRegistrations.status,
        registrationCreatedAt: eventRegistrations.createdAt,
        confirmedAt: eventRegistrations.confirmedAt,
        cancelledAt: eventRegistrations.cancelledAt,
        paymentMethod: eventRegistrations.paymentMethod,
        paymentAmountCents: eventRegistrations.paymentAmountCents,
        id: events.id,
        title: events.title,
        slug: events.slug,
        description: events.description,
        date: events.date,
        time: events.time,
        endTime: events.endTime,
        location: events.location,
        hideLocation: events.hideLocation,
        thumbnailUrl: events.thumbnailUrl,
        status: events.status,
        isPublished: events.isPublished,
        accessMode: events.accessMode,
        capacity: events.capacity,
        allowGuests: events.allowGuests,
        requiresConfirmation: events.requiresConfirmation,
        isPaid: events.isPaid,
        priceCents: events.priceCents,
        confirmedRegistrations: this.confirmedRegistrationsCountSql(),
      })
      .from(eventRegistrations)
      .innerJoin(events, eq(eventRegistrations.eventId, events.id))
      .where(
        and(
          eq(eventRegistrations.userId, userId),
          isNull(eventRegistrations.deletedAt),
          isNull(events.deletedAt),
          not(like(events.slug, BIRTHDAY_EVENT_SLUG_LIKE)),
        ),
      )
      .orderBy(desc(events.date), desc(events.time), desc(events.createdAt));

    return rows.map((row) => ({
      ...row,
      location: row.hideLocation ? null : row.location,
      path: `/events/event-${row.slug}`,
    }));
  }

  async listPublic(filters?: PublicEventsQueryDto) {
    await this.ensureBirthdayEventsUpToDateSafe();
    const whereFilters = await this.buildPublishedFilters(filters);
    whereFilters.push(not(like(events.slug, BIRTHDAY_EVENT_SLUG_LIKE)));

    const rows = await this.databaseService.database
      .select({
        id: events.id,
        title: events.title,
        slug: events.slug,
        description: events.description,
        date: events.date,
        status: events.status,
        isFeatured: events.isFeatured,
        time: events.time,
        endTime: events.endTime,
        location: events.location,
        hideLocation: events.hideLocation,
        thumbnailUrl: events.thumbnailUrl,
        accessMode: events.accessMode,
        capacity: events.capacity,
        allowGuests: events.allowGuests,
        requiresConfirmation: events.requiresConfirmation,
        isPaid: events.isPaid,
        priceCents: events.priceCents,
        paymentMethod: events.paymentMethod,
        confirmedRegistrations: this.confirmedRegistrationsCountSql(),
      })
      .from(events)
      .where(and(...whereFilters))
      .orderBy(asc(events.date), asc(events.time));

    return rows.map((event) => ({
      ...event,
      location: event.hideLocation ? null : event.location,
    }));
  }

  async listPublicCards(filters?: PublicEventsQueryDto) {
    await this.ensureBirthdayEventsUpToDateSafe();
    const whereFilters = await this.buildPublishedFilters(filters);
    whereFilters.push(not(like(events.slug, BIRTHDAY_EVENT_SLUG_LIKE)));

    const rows = await this.databaseService.database
      .select({
        id: events.id,
        title: events.title,
        slug: events.slug,
        description: events.description,
        date: events.date,
        status: events.status,
        isFeatured: events.isFeatured,
        time: events.time,
        endTime: events.endTime,
        location: events.location,
        hideLocation: events.hideLocation,
        thumbnailUrl: events.thumbnailUrl,
        accessMode: events.accessMode,
        capacity: events.capacity,
        allowGuests: events.allowGuests,
        isPaid: events.isPaid,
        priceCents: events.priceCents,
        confirmedRegistrations: this.confirmedRegistrationsCountSql(),
      })
      .from(events)
      .where(and(...whereFilters))
      .orderBy(asc(events.date), asc(events.time));

    return rows.map((event) => ({
      ...event,
      location: event.hideLocation ? null : event.location,
      path: `/events/event-${event.slug}`,
    }));
  }

  async listPublicBirthdays(filters?: PublicBirthdaysQueryDto) {
    await this.ensureBirthdayEventsUpToDateSafe();
    const whereFilters = await this.buildPublishedFilters();
    const targetMonth = this.resolveBirthdayMonth(filters?.month);

    whereFilters.push(like(events.slug, BIRTHDAY_EVENT_SLUG_LIKE));
    whereFilters.push(
      sql`extract(month from ${events.date}::date) = ${targetMonth}`,
    );

    const rows = await this.databaseService.database
      .select({
        title: events.title,
        slug: events.slug,
        description: events.description,
        date: events.date,
        time: events.time,
        endTime: events.endTime,
        location: events.location,
        hideLocation: events.hideLocation,
        thumbnailUrl: events.thumbnailUrl,
      })
      .from(events)
      .where(and(...whereFilters))
      .orderBy(
        sql`extract(day from ${events.date}::date) asc`,
        asc(events.time),
      );

    return rows.map((event) => ({
      ...event,
      location: event.hideLocation ? null : event.location,
      path: `/events/event-${event.slug}`,
    }));
  }

  async listCalendar(filters?: PublicEventsQueryDto) {
    await this.ensureBirthdayEventsUpToDateSafe();
    const whereFilters = await this.buildPublishedFilters(filters);
    whereFilters.push(not(like(events.slug, BIRTHDAY_EVENT_SLUG_LIKE)));

    return this.databaseService.database
      .select({
        id: events.id,
        title: events.title,
        slug: events.slug,
        isFeatured: events.isFeatured,
        date: events.date,
        time: events.time,
        endTime: events.endTime,
        thumbnailUrl: events.thumbnailUrl,
        accessMode: events.accessMode,
        capacity: events.capacity,
        allowGuests: events.allowGuests,
        requiresConfirmation: events.requiresConfirmation,
        isPaid: events.isPaid,
        priceCents: events.priceCents,
        paymentMethod: events.paymentMethod,
        confirmedRegistrations: this.confirmedRegistrationsCountSql(),
      })
      .from(events)
      .where(and(...whereFilters))
      .orderBy(asc(events.date), asc(events.time));
  }

  async getPublicBySlug(slug: string) {
    const whereFilters: SQL[] = [
      eq(events.slug, slug),
      eq(events.isPublished, true),
      isNull(events.deletedAt),
    ];
    if (await this.supportsEventStatusColumn()) {
      whereFilters.push(eq(events.status, 'published'));
    }
    const [event] = await this.databaseService.database
      .select({
        id: events.id,
        title: events.title,
        slug: events.slug,
        description: events.description,
        date: events.date,
        time: events.time,
        endTime: events.endTime,
        location: events.location,
        hideLocation: events.hideLocation,
        allowGuests: events.allowGuests,
        requiresConfirmation: events.requiresConfirmation,
        isPaid: events.isPaid,
        priceCents: events.priceCents,
        paymentMethod: events.paymentMethod,
        thumbnailPublicId: events.thumbnailPublicId,
        thumbnailUrl: events.thumbnailUrl,
        isFeatured: events.isFeatured,
        status: events.status,
        isPublished: events.isPublished,
        publishedAt: events.publishedAt,
        accessMode: events.accessMode,
        capacity: events.capacity,
        createdByUserId: events.createdByUserId,
        deletedAt: events.deletedAt,
        createdAt: events.createdAt,
        updatedAt: events.updatedAt,
        confirmedRegistrations: this.confirmedRegistrationsCountSql(),
      })
      .from(events)
      .where(and(...whereFilters))
      .limit(1);

    if (!event) {
      throw new NotFoundException('Evento nao encontrado');
    }

    if (event.hideLocation) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { location, ...rest } = event;
      return rest;
    }

    return event;
  }

  async registerPublic(
    slug: string,
    payload: EventRegistrationDto,
    context?: AuditContext,
    userId?: string | null,
  ) {
    const whereFilters: SQL[] = [
      eq(events.slug, slug),
      eq(events.isPublished, true),
      isNull(events.deletedAt),
    ];
    if (await this.supportsEventStatusColumn()) {
      whereFilters.push(eq(events.status, 'published'));
    }
    const [event] = await this.databaseService.database
      .select()
      .from(events)
      .where(and(...whereFilters))
      .limit(1);

    if (!event) {
      throw new NotFoundException('Evento nao encontrado');
    }

    if (event.accessMode !== 'registered_only') {
      throw new BadRequestException('Evento aberto, nao requer inscricao');
    }

    let authenticatedEmail: string | null = null;

    if (userId) {
      const [userPlan] = await this.databaseService.database
        .select({
          role: users.role,
          active: users.active,
          email: users.email,
          planSlug: plans.slug,
        })
        .from(users)
        .leftJoin(plans, eq(users.planId, plans.id))
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);

      if (!userPlan || !userPlan.active) {
        throw new BadRequestException('Usuario inativo');
      }

      const isGuest =
        userPlan.role === 'GUEST' || userPlan.planSlug === GUEST_PLAN_SLUG;

      if (isGuest && !event.allowGuests) {
        throw new BadRequestException('Evento exclusivo para alunos');
      }

      authenticatedEmail = userPlan.email?.trim().toLowerCase() ?? null;
      if (!authenticatedEmail) {
        throw new BadRequestException('Email do usuario invalido');
      }
    } else {
      if (!event.allowGuests) {
        throw new BadRequestException('Evento exclusivo para alunos');
      }
      throw new BadRequestException(
        'Use o cadastro de convidado para este evento',
      );
    }

    const normalizedEmail = payload.email?.trim().toLowerCase();
    const normalizedName = payload.name?.trim();

    if (!userId && !normalizedEmail) {
      throw new BadRequestException('Email obrigatorio');
    }

    const registrationEmail = userId
      ? authenticatedEmail
      : (normalizedEmail ?? null);
    if (!registrationEmail) {
      throw new BadRequestException('Email obrigatorio');
    }

    const duplicateFilters: SQL[] = [
      eq(eventRegistrations.eventId, event.id),
      isNull(eventRegistrations.deletedAt),
    ];
    if (userId) {
      const duplicateByUserOrEmail = or(
        eq(eventRegistrations.userId, userId),
        eq(eventRegistrations.email, registrationEmail),
      );
      if (duplicateByUserOrEmail) {
        duplicateFilters.push(duplicateByUserOrEmail);
      }
    } else {
      duplicateFilters.push(eq(eventRegistrations.email, registrationEmail));
    }

    const [existing] = await this.databaseService.database
      .select({ id: eventRegistrations.id })
      .from(eventRegistrations)
      .where(and(...duplicateFilters))
      .limit(1);

    if (existing) {
      throw new ConflictException('Inscricao ja existente');
    }

    await this.assertCapacityAvailable(event.id, event.capacity);

    let status: RegistrationRow['status'] = 'confirmed';
    let confirmedAt: Date | null = new Date();

    if (event.isPaid || event.requiresConfirmation) {
      status = 'pending';
      confirmedAt = null;
    }

    let registration: RegistrationRow;
    try {
      const [created] = await this.databaseService.database
        .insert(eventRegistrations)
        .values({
          eventId: event.id,
          userId: userId ?? null,
          name: userId ? null : (normalizedName ?? null),
          email: registrationEmail,
          status,
          confirmedAt,
        })
        .returning();

      if (!created) {
        throw new BadRequestException('Falha ao registrar inscricao');
      }

      registration = created;
    } catch (error) {
      if (
        this.isUniqueViolation(error, REG_USER_UNIQUE_CONSTRAINT) ||
        this.isUniqueViolation(error, REG_EMAIL_UNIQUE_CONSTRAINT)
      ) {
        throw new ConflictException('Inscricao ja existente');
      }
      throw error;
    }

    if (registration.userId) {
      await this.birthdayEventsService.syncForUser(registration.userId);
    }

    if (event.isPaid) {
      await this.notifyPaymentReview(event, registration);
    }

    await this.auditService.log({
      actorUserId: context?.actorUserId ?? userId ?? null,
      targetUserId: event.createdByUserId,
      entity: 'events',
      entityId: event.id,
      action: 'registration_created',
      before: null,
      after: registration,
      metadata: this.buildAuditMetadata(context, {
        registrationId: registration.id,
        status: registration.status,
      }),
    });

    return registration;
  }

  async registerGuestForEvent(
    slug: string,
    payload: EventGuestRegistrationDto,
    context?: AuditContext,
  ) {
    const [event] = await this.databaseService.database
      .select()
      .from(events)
      .where(
        and(
          eq(events.slug, slug),
          eq(events.isPublished, true),
          eq(events.status, 'published'),
          isNull(events.deletedAt),
        ),
      )
      .limit(1);

    if (!event) {
      throw new NotFoundException('Evento nao encontrado');
    }

    if (event.accessMode !== 'registered_only') {
      throw new BadRequestException('Evento aberto, nao requer inscricao');
    }
    if (!event.allowGuests) {
      throw new BadRequestException('Evento exclusivo para alunos');
    }
    await this.assertCapacityAvailable(event.id, event.capacity);

    const normalizedEmail = payload.email.trim().toLowerCase();
    const normalizedCpf = payload.cpf.replace(/\D/g, '');
    const normalizedPhone = payload.phone.trim();
    const normalizedName = payload.name?.trim() || null;

    const guestPlanId = await ensureGuestPlanId(this.databaseService.database);

    const candidates = await this.databaseService.database
      .select({
        id: users.id,
        email: users.email,
        cpf: users.cpf,
        phone: users.phone,
        name: users.name,
        active: users.active,
        role: users.role,
        planId: users.planId,
      })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          or(
            eq(users.email, normalizedEmail),
            eq(users.cpf, normalizedCpf),
            eq(users.phone, normalizedPhone),
          ),
        ),
      );

    const uniqueIds = new Set(candidates.map((row) => row.id));
    if (uniqueIds.size > 1) {
      throw new BadRequestException(
        'Email, CPF e telefone ja cadastrados em usuarios diferentes',
      );
    }

    let userId: string;
    const existing = candidates[0];

    if (existing) {
      if (!existing.active) {
        throw new BadRequestException('Usuario inativo');
      }
      if (existing.email && existing.email.toLowerCase() !== normalizedEmail) {
        throw new BadRequestException('Email ja cadastrado');
      }
      if (existing.cpf && existing.cpf !== normalizedCpf) {
        throw new BadRequestException('CPF ja cadastrado');
      }
      if (existing.phone && existing.phone !== normalizedPhone) {
        throw new BadRequestException('Telefone ja cadastrado');
      }

      userId = existing.id;

      const updates: Partial<typeof users.$inferInsert> = {};
      if (!existing.cpf) {
        updates.cpf = normalizedCpf;
      }
      if (!existing.phone) {
        updates.phone = normalizedPhone;
      }
      if (!existing.name && normalizedName) {
        updates.name = normalizedName;
      }
      if (existing.role === 'GUEST' && existing.planId !== guestPlanId) {
        updates.planId = guestPlanId;
      }

      if (Object.keys(updates).length > 0) {
        await this.databaseService.database
          .update(users)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }
    } else {
      const [created] = await this.databaseService.database
        .insert(users)
        .values({
          email: normalizedEmail,
          cpf: normalizedCpf,
          phone: normalizedPhone,
          name: normalizedName,
          role: 'GUEST',
          planId: guestPlanId,
          active: true,
        })
        .returning({ id: users.id });

      if (!created) {
        throw new BadRequestException('Falha ao criar usuario');
      }

      userId = created.id;
    }

    const [existingRegistration] = await this.databaseService.database
      .select({ id: eventRegistrations.id })
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, event.id),
          or(
            eq(eventRegistrations.userId, userId),
            eq(eventRegistrations.email, normalizedEmail),
          ),
          isNull(eventRegistrations.deletedAt),
        ),
      )
      .limit(1);

    if (existingRegistration) {
      throw new ConflictException('Inscricao ja existente');
    }

    let status: RegistrationRow['status'] = 'confirmed';
    let confirmedAt: Date | null = new Date();

    if (event.isPaid || event.requiresConfirmation) {
      status = 'pending';
      confirmedAt = null;
    }

    let registration: RegistrationRow;
    try {
      const [created] = await this.databaseService.database
        .insert(eventRegistrations)
        .values({
          eventId: event.id,
          userId,
          name: normalizedName,
          email: normalizedEmail,
          status,
          confirmedAt,
        })
        .returning();

      if (!created) {
        throw new BadRequestException('Falha ao registrar inscricao');
      }

      registration = created;
    } catch (error) {
      if (
        this.isUniqueViolation(error, REG_USER_UNIQUE_CONSTRAINT) ||
        this.isUniqueViolation(error, REG_EMAIL_UNIQUE_CONSTRAINT)
      ) {
        throw new ConflictException('Inscricao ja existente');
      }
      throw error;
    }

    if (event.isPaid) {
      await this.notifyPaymentReview(event, registration);
    }

    await this.auditService.log({
      actorUserId: context?.actorUserId ?? null,
      targetUserId: event.createdByUserId,
      entity: 'events',
      entityId: event.id,
      action: 'registration_created',
      before: null,
      after: registration,
      metadata: this.buildAuditMetadata(context, {
        registrationId: registration.id,
        status: registration.status,
      }),
    });

    return registration;
  }
}
