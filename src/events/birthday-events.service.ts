import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull, like } from 'drizzle-orm';
import { FREE_PLAN_SLUGS, MASTER_PLAN_SLUG } from '../common/constants/plans';
import { DatabaseService } from '../db/database.service';
import { events } from '../drizzle/schema/events';
import { healthProfiles } from '../drizzle/schema/health';
import { plans } from '../drizzle/schema/plans';
import { users } from '../drizzle/schema/users';

const ELIGIBLE_BIRTHDAY_ROLES = new Set([
  'MASTER',
  'STUDENT',
  'ADMIN',
  'STAFF',
  'COACH',
  'ALUNO',
]);

const BIRTHDAY_EVENT_TIME = '08:00';
const BIRTHDAY_EVENT_LOCATION = 'Academia JM';
const BIRTHDAY_SYNC_INTERVAL_MS = 60_000;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class BirthdayEventsService {
  constructor(private readonly databaseService: DatabaseService) {}
  private lastFullSyncAt = 0;
  private fullSyncPromise: Promise<void> | null = null;

  private buildBirthdaySlug(userId: string) {
    return `aniversario-${userId}`;
  }

  private parseUserIdFromBirthdaySlug(slug: string) {
    const prefix = 'aniversario-';
    if (!slug.startsWith(prefix)) {
      return null;
    }
    const userId = slug.slice(prefix.length).trim();
    if (!UUID_REGEX.test(userId)) {
      return null;
    }
    return userId;
  }

  private toDateKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseBirthDate(value: string | Date) {
    const toBirthDate = (year: number, month: number, day: number) => {
      if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        month < 1 ||
        month > 12 ||
        day < 1
      ) {
        return null;
      }

      const maxDay = new Date(year, month, 0).getDate();
      const safeDay = Math.min(day, maxDay);
      return new Date(year, month - 1, safeDay);
    };

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }
      // Use UTC fields to avoid timezone day-shift for date-only values.
      return toBirthDate(
        value.getUTCFullYear(),
        value.getUTCMonth() + 1,
        value.getUTCDate(),
      );
    }

    const trimmed = String(value).trim();
    const directMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (directMatch) {
      return toBirthDate(
        Number(directMatch[1]),
        Number(directMatch[2]),
        Number(directMatch[3]),
      );
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return toBirthDate(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth() + 1,
      parsed.getUTCDate(),
    );
  }

  private nextBirthdayDate(birthDate: string | Date) {
    const parsedBirthDate = this.parseBirthDate(birthDate);
    if (!parsedBirthDate) {
      return null;
    }

    const month = parsedBirthDate.getMonth() + 1;
    const day = parsedBirthDate.getDate();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const buildBirthdayDate = (year: number) => {
      const maxDay = new Date(year, month, 0).getDate();
      const safeDay = Math.min(day, maxDay);
      return new Date(year, month - 1, safeDay);
    };

    let birthday = buildBirthdayDate(today.getFullYear());
    if (birthday < today) {
      birthday = buildBirthdayDate(today.getFullYear() + 1);
    }

    return this.toDateKey(birthday);
  }

  private shouldHaveBirthdayEvent(input: {
    role: string | null;
    userActive: boolean | null;
    birthDate: string | Date | null;
    planSlug: string | null;
    planActive: boolean | null;
  }) {
    const planSlug = input.planSlug?.trim() ?? '';
    const hasMasterPlan =
      planSlug.toLowerCase() === MASTER_PLAN_SLUG.toLowerCase();
    const hasEligibleRole = ELIGIBLE_BIRTHDAY_ROLES.has(input.role ?? '');

    return (
      Boolean(input.userActive) &&
      Boolean(input.birthDate) &&
      Boolean(planSlug) &&
      input.planActive === true &&
      !FREE_PLAN_SLUGS.has(planSlug) &&
      (hasEligibleRole || hasMasterPlan)
    );
  }

  private async findExistingBirthdayEvent(slug: string) {
    const [activeEvent] = await this.databaseService.database
      .select({
        id: events.id,
        deletedAt: events.deletedAt,
      })
      .from(events)
      .where(and(eq(events.slug, slug), isNull(events.deletedAt)))
      .limit(1);
    if (activeEvent) {
      return activeEvent;
    }
    return (
      await this.databaseService.database
        .select({
          id: events.id,
          deletedAt: events.deletedAt,
        })
        .from(events)
        .where(and(eq(events.slug, slug), isNotNull(events.deletedAt)))
        .orderBy(desc(events.updatedAt))
        .limit(1)
    )[0];
  }

  private async softDeleteBirthdayEvent(eventId: string) {
    await this.databaseService.database
      .update(events)
      .set({
        deletedAt: new Date(),
        isPublished: false,
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));
  }

  async syncForUser(userId: string) {
    const slug = this.buildBirthdaySlug(userId);
    const existingEvent = await this.findExistingBirthdayEvent(slug);

    const [userContext] = await this.databaseService.database
      .select({
        role: users.role,
        userActive: users.active,
        name: users.name,
        planSlug: plans.slug,
        planActive: plans.active,
        birthDate: healthProfiles.birthDate,
      })
      .from(users)
      .leftJoin(plans, eq(users.planId, plans.id))
      .leftJoin(
        healthProfiles,
        and(
          eq(healthProfiles.userId, users.id),
          isNull(healthProfiles.deletedAt),
        ),
      )
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!userContext) {
      if (existingEvent && !existingEvent.deletedAt) {
        await this.softDeleteBirthdayEvent(existingEvent.id);
      }
      return;
    }

    const shouldHaveEvent = this.shouldHaveBirthdayEvent({
      role: userContext.role,
      userActive: userContext.userActive,
      birthDate: userContext.birthDate,
      planSlug: userContext.planSlug,
      planActive: userContext.planActive,
    });

    if (!shouldHaveEvent) {
      if (existingEvent && !existingEvent.deletedAt) {
        await this.softDeleteBirthdayEvent(existingEvent.id);
      }
      return;
    }

    const birthdayDate = this.nextBirthdayDate(userContext.birthDate as string);
    if (!birthdayDate) {
      return;
    }

    const displayName = userContext.name?.trim() || 'Aluno';
    const title = `Aniversario de ${displayName}`;
    const description = `Evento automatico de aniversario do usuario ${displayName}.`;
    const now = new Date();

    const payload = {
      title,
      description,
      date: birthdayDate,
      time: BIRTHDAY_EVENT_TIME,
      endTime: null,
      location: BIRTHDAY_EVENT_LOCATION,
      hideLocation: true,
      allowGuests: false,
      requiresConfirmation: false,
      isPaid: false,
      priceCents: null,
      paymentMethod: null,
      status: 'published' as const,
      isPublished: true,
      publishedAt: now,
      accessMode: 'open' as const,
      capacity: null,
      createdByUserId: userId,
      deletedAt: null,
      updatedAt: now,
    };

    if (existingEvent) {
      await this.databaseService.database
        .update(events)
        .set(payload)
        .where(eq(events.id, existingEvent.id));
      return;
    }

    await this.databaseService.database.insert(events).values({
      ...payload,
      slug,
    });
  }

  async syncAllUsersFromHealth() {
    if (this.fullSyncPromise) {
      await this.fullSyncPromise;
      return;
    }

    this.fullSyncPromise = (async () => {
      const [allUsers, birthdayEventSlugs] = await Promise.all([
        this.databaseService.database
          .select({ id: users.id })
          .from(users)
          .where(isNull(users.deletedAt)),
        this.databaseService.database
          .select({ slug: events.slug })
          .from(events)
          .where(like(events.slug, 'aniversario-%')),
      ]);

      const ids = new Set<string>();
      for (const user of allUsers) {
        ids.add(user.id);
      }
      for (const event of birthdayEventSlugs) {
        const parsedUserId = this.parseUserIdFromBirthdaySlug(event.slug);
        if (parsedUserId) {
          ids.add(parsedUserId);
        }
      }

      for (const userId of ids) {
        try {
          await this.syncForUser(userId);
        } catch (error) {
          console.warn(
            `[events] Birthday sync skipped for user ${userId}`,
            error,
          );
        }
      }
      this.lastFullSyncAt = Date.now();
    })().finally(() => {
      this.fullSyncPromise = null;
    });

    await this.fullSyncPromise;
  }

  async syncAllUsersFromHealthIfStale() {
    const isFresh =
      Date.now() - this.lastFullSyncAt < BIRTHDAY_SYNC_INTERVAL_MS;
    if (isFresh) {
      return;
    }
    await this.syncAllUsersFromHealth();
  }
}
