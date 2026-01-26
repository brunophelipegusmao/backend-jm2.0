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
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { DatabaseService } from '../db/database.service';
import { eventRegistrations, events } from '../drizzle/schema/events';
import { CreateEventDto } from './dto/create-event.dto';
import type { EventRegistrationDto } from './dto/event-registration.dto';
import type {
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

@Injectable()
export class EventsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

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

  private toDateOnlyDate(value?: string | Date | null) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
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
      return null;
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
    const accessMode = payload.accessMode ?? 'open';
    const capacity = this.resolveCapacity(accessMode, payload.capacity ?? null);
    const date = this.normalizeDateInput(payload.date);
    if (!date) {
      throw new BadRequestException('Data invalida');
    }

    const baseSlug = this.slugify(payload.title);
    if (!baseSlug) {
      throw new BadRequestException('Titulo invalido');
    }

    const created = await this.databaseService.database.transaction(
      async (tx) => {
        let attempt = 0;
        while (attempt < 10) {
          const slug =
            attempt === 0
              ? this.buildSlugCandidate(baseSlug)
              : this.buildSlugCandidate(baseSlug, attempt + 1);

          try {
            const [event] = await tx
              .insert(events)
              .values({
                title: payload.title,
                slug,
                description: payload.description,
                date,
                time: payload.time,
                endTime: payload.endTime ?? null,
                location: payload.location ?? null,
                hideLocation: payload.hideLocation ?? false,
                accessMode,
                capacity,
                createdByUserId,
              })
              .returning();

            if (!event) {
              throw new BadRequestException('Falha ao criar evento');
            }

            return event;
          } catch (error) {
            if (this.isUniqueViolation(error, SLUG_UNIQUE_CONSTRAINT)) {
              attempt += 1;
              continue;
            }
            throw error;
          }
        }

        throw new ConflictException('Falha ao gerar slug unico');
      },
    );

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

    const query = this.databaseService.database.select().from(events);
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

    const [updated] = await this.databaseService.database
      .update(events)
      .set(updates)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .returning();

    const result = updated ?? current;

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

    const restored = await this.databaseService.database.transaction(
      async (tx) => {
        let slug = current.slug;

        const [slugConflict] = await tx
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
            const [existing] = await tx
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

        const [updated] = await tx
          .update(events)
          .set({ deletedAt: null, slug, updatedAt: new Date() })
          .where(eq(events.id, id))
          .returning();

        if (!updated) {
          throw new BadRequestException('Falha ao restaurar evento');
        }

        return updated;
      },
    );

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

    const [published] = await this.databaseService.database
      .update(events)
      .set({
        isPublished: true,
        publishedAt: new Date(),
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

    const [unpublished] = await this.databaseService.database
      .update(events)
      .set({ isPublished: false, publishedAt: null, updatedAt: new Date() })
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
        confirmedAt: eventRegistrations.confirmedAt,
        cancelledAt: eventRegistrations.cancelledAt,
        createdAt: eventRegistrations.createdAt,
      })
      .from(eventRegistrations)
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
    const result = await this.databaseService.database.transaction(
      async (tx) => {
        const [event] = await tx
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

        const [registration] = await tx
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
          const [updated] = await tx
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
          const [waitlisted] = await tx
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
            const [promotedRow] = await tx
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

        return {
          event,
          before,
          cancelled,
          promoted,
        };
      },
    );

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

  async listPublic(filters?: PublicEventsQueryDto) {
    const whereFilters = [
      eq(events.isPublished, true),
      isNull(events.deletedAt),
    ];

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
        accessMode: events.accessMode,
        capacity: events.capacity,
      })
      .from(events)
      .where(and(...whereFilters))
      .orderBy(asc(events.date), asc(events.time));

    return rows.map((event) => ({
      ...event,
      location: event.hideLocation ? null : event.location,
    }));
  }

  async listCalendar(filters?: PublicEventsQueryDto) {
    const whereFilters = [
      eq(events.isPublished, true),
      isNull(events.deletedAt),
    ];

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

    return this.databaseService.database
      .select({
        id: events.id,
        title: events.title,
        slug: events.slug,
        date: events.date,
        time: events.time,
        endTime: events.endTime,
        thumbnailUrl: events.thumbnailUrl,
        accessMode: events.accessMode,
        capacity: events.capacity,
      })
      .from(events)
      .where(and(...whereFilters))
      .orderBy(asc(events.date), asc(events.time));
  }

  async getPublicBySlug(slug: string) {
    const [event] = await this.databaseService.database
      .select()
      .from(events)
      .where(
        and(
          eq(events.slug, slug),
          eq(events.isPublished, true),
          isNull(events.deletedAt),
        ),
      )
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
    const [event] = await this.databaseService.database
      .select()
      .from(events)
      .where(
        and(
          eq(events.slug, slug),
          eq(events.isPublished, true),
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

    const normalizedEmail = payload.email?.trim().toLowerCase();
    const normalizedName = payload.name?.trim();

    if (!userId && !normalizedEmail) {
      throw new BadRequestException('Email obrigatorio');
    }

    const registration = await this.databaseService.database.transaction(
      async (tx) => {
        if (userId) {
          const [existing] = await tx
            .select({ id: eventRegistrations.id })
            .from(eventRegistrations)
            .where(
              and(
                eq(eventRegistrations.eventId, event.id),
                eq(eventRegistrations.userId, userId),
                isNull(eventRegistrations.deletedAt),
              ),
            )
            .limit(1);

          if (existing) {
            throw new ConflictException('Inscricao ja existente');
          }
        } else if (normalizedEmail) {
          const [existing] = await tx
            .select({ id: eventRegistrations.id })
            .from(eventRegistrations)
            .where(
              and(
                eq(eventRegistrations.eventId, event.id),
                eq(eventRegistrations.email, normalizedEmail),
                isNull(eventRegistrations.deletedAt),
              ),
            )
            .limit(1);

          if (existing) {
            throw new ConflictException('Inscricao ja existente');
          }
        }

        let status: RegistrationRow['status'] = 'confirmed';
        let confirmedAt: Date | null = new Date();

        if (event.capacity !== null) {
          const [countRow] = await tx
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
            status = 'waitlisted';
            confirmedAt = null;
          }
        }

        try {
          const [created] = await tx
            .insert(eventRegistrations)
            .values({
              eventId: event.id,
              userId: userId ?? null,
              name: userId ? null : (normalizedName ?? null),
              email: userId ? null : (normalizedEmail ?? null),
              status,
              confirmedAt,
            })
            .returning();

          if (!created) {
            throw new BadRequestException('Falha ao registrar inscricao');
          }

          return created;
        } catch (error) {
          if (
            this.isUniqueViolation(error, REG_USER_UNIQUE_CONSTRAINT) ||
            this.isUniqueViolation(error, REG_EMAIL_UNIQUE_CONSTRAINT)
          ) {
            throw new ConflictException('Inscricao ja existente');
          }
          throw error;
        }
      },
    );

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
}
