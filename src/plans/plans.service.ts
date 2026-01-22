import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, ne, or } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { plans } from '../drizzle/schema/plans';
import { users } from '../drizzle/schema/users';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

type PlanRow = typeof plans.$inferSelect;

type UniqueCheckInput = {
  name?: string;
  slug?: string;
  ignoreId?: string;
};

@Injectable()
export class PlansService {
  constructor(private readonly databaseService: DatabaseService) {}

  private normalizeSlug(value: string) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Slug invalido');
    }
    return normalized;
  }

  private parseDate(value?: string | Date | null) {
    if (value === null) {
      return null;
    }
    if (value === undefined) {
      return undefined;
    }
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('promoEndsAt invalido');
    }
    return parsed;
  }

  private async ensureUnique({ name, slug, ignoreId }: UniqueCheckInput) {
    if (!name && !slug) {
      return;
    }

    const filters = [] as Array<ReturnType<typeof eq>>;
    if (name) {
      filters.push(eq(plans.name, name));
    }
    if (slug) {
      filters.push(eq(plans.slug, slug));
    }

    const where = filters.length === 1 ? filters[0] : or(...filters);
    const baseWhere = and(where, isNull(plans.deletedAt));
    const whereWithIgnore = ignoreId
      ? and(baseWhere, ne(plans.id, ignoreId))
      : baseWhere;

    const [existing] = await this.databaseService.database
      .select({ id: plans.id, name: plans.name, slug: plans.slug })
      .from(plans)
      .where(whereWithIgnore)
      .limit(1);

    if (existing) {
      throw new BadRequestException('Nome ou slug ja cadastrado');
    }
  }

  private resolvePromo(
    payload: {
      promoActive?: boolean;
      promoPriceCents?: number | null;
      promoEndsAt?: string | Date | null;
      priceCents?: number;
    },
    current?: PlanRow | null,
  ) {
    const promoPriceCents =
      payload.promoPriceCents !== undefined
        ? payload.promoPriceCents
        : current?.promoPriceCents ?? null;

    const promoActive =
      payload.promoActive !== undefined
        ? payload.promoActive
        : payload.promoPriceCents !== undefined
          ? payload.promoPriceCents !== null
          : current?.promoActive ?? false;

    const promoEndsAt =
      payload.promoEndsAt !== undefined
        ? this.parseDate(payload.promoEndsAt)
        : current?.promoEndsAt
          ? this.parseDate(current.promoEndsAt)
          : null;

    if (promoActive && promoPriceCents === null) {
      throw new BadRequestException(
        'promoPriceCents e obrigatorio quando promoActive for true',
      );
    }

    const priceCents = payload.priceCents ?? current?.priceCents;
    if (
      promoPriceCents !== null &&
      priceCents !== undefined &&
      promoPriceCents > priceCents
    ) {
      throw new BadRequestException(
        'promoPriceCents deve ser menor ou igual ao priceCents',
      );
    }

    return {
      promoActive,
      promoPriceCents,
      promoEndsAt,
    };
  }

  async create(createPlanDto: CreatePlanDto) {
    const name = createPlanDto.name.trim();
    const slug = this.normalizeSlug(createPlanDto.slug);

    await this.ensureUnique({ name, slug });

    const promo = this.resolvePromo(createPlanDto);

    const [plan] = await this.databaseService.database
      .insert(plans)
      .values({
        name,
        slug,
        description: createPlanDto.description?.trim() ?? null,
        priceCents: createPlanDto.priceCents,
        promoActive: promo.promoActive,
        promoPriceCents: promo.promoPriceCents,
        promoEndsAt: promo.promoEndsAt ?? null,
        popular: createPlanDto.popular ?? false,
        active: createPlanDto.active ?? true,
      })
      .returning();

    return plan ?? null;
  }

  findAll(options?: { includeInactive?: boolean }) {
    const includeInactive = options?.includeInactive ?? false;
    const query = this.databaseService.database
      .select()
      .from(plans)
      .orderBy(desc(plans.popular), plans.name);

    if (!includeInactive) {
      return query.where(and(eq(plans.active, true), isNull(plans.deletedAt)));
    }

    return query.where(isNull(plans.deletedAt));
  }

  async findOne(id: string) {
    const [plan] = await this.databaseService.database
      .select()
      .from(plans)
      .where(and(eq(plans.id, id), isNull(plans.deletedAt)))
      .limit(1);

    return plan ?? null;
  }

  async update(id: string, updatePlanDto: UpdatePlanDto) {
    const [current] = await this.databaseService.database
      .select()
      .from(plans)
      .where(and(eq(plans.id, id), isNull(plans.deletedAt)))
      .limit(1);

    if (!current) {
      throw new BadRequestException('Plano nao encontrado');
    }

    const updates: Partial<typeof plans.$inferInsert> = {};

    if (updatePlanDto.name !== undefined) {
      updates.name = updatePlanDto.name.trim();
    }

    if (updatePlanDto.slug !== undefined) {
      updates.slug = this.normalizeSlug(updatePlanDto.slug);
    }

    if (updatePlanDto.description !== undefined) {
      updates.description = updatePlanDto.description?.trim() ?? null;
    }

    if (updatePlanDto.priceCents !== undefined) {
      updates.priceCents = updatePlanDto.priceCents;
    }

    if (
      updatePlanDto.promoActive !== undefined ||
      updatePlanDto.promoPriceCents !== undefined ||
      updatePlanDto.promoEndsAt !== undefined ||
      updatePlanDto.priceCents !== undefined
    ) {
      const promo = this.resolvePromo(updatePlanDto, current);
      updates.promoActive = promo.promoActive;
      updates.promoPriceCents = promo.promoPriceCents;
      updates.promoEndsAt = promo.promoEndsAt ?? null;
    }

    if (updatePlanDto.popular !== undefined) {
      updates.popular = updatePlanDto.popular;
    }

    if (updatePlanDto.active !== undefined) {
      updates.active = updatePlanDto.active;
    }

    if (updates.name && updates.name !== current.name) {
      await this.ensureUnique({ name: updates.name, ignoreId: id });
    }

    if (updates.slug && updates.slug !== current.slug) {
      await this.ensureUnique({ slug: updates.slug, ignoreId: id });
    }

    if (Object.keys(updates).length === 0) {
      return current;
    }

    const [plan] = await this.databaseService.database
      .update(plans)
      .set(updates)
      .where(and(eq(plans.id, id), isNull(plans.deletedAt)))
      .returning();

    return plan ?? null;
  }

  async remove(id: string) {
    const [activeUser] = await this.databaseService.database
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.planId, id),
          eq(users.active, true),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);

    if (activeUser) {
      throw new BadRequestException('Plano possui usuarios ativos');
    }

    const [plan] = await this.databaseService.database
      .update(plans)
      .set({ active: false, deletedAt: new Date() })
      .where(and(eq(plans.id, id), isNull(plans.deletedAt)))
      .returning();

    return plan ?? null;
  }
}
