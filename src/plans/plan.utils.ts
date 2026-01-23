import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, eq, isNull } from 'drizzle-orm';
import { plans } from '../drizzle/schema/plans';
import {
  MASTER_PLAN_DESCRIPTION,
  MASTER_PLAN_NAME,
  MASTER_PLAN_SLUG,
} from '../common/constants/plans';

export type EnsurePlanOptions = {
  slug: string;
  name: string;
  description?: string | null;
  priceCents: number;
  promoPriceCents?: number | null;
  promoActive?: boolean;
  promoEndsAt?: Date | null;
  popular?: boolean;
  active?: boolean;
};

export async function findActivePlanIdBySlug(
  database: NeonHttpDatabase,
  slug: string,
) {
  const [plan] = await database
    .select({ id: plans.id })
    .from(plans)
    .where(
      and(eq(plans.slug, slug), eq(plans.active, true), isNull(plans.deletedAt)),
    )
    .limit(1);

  return plan?.id ?? null;
}

export async function ensurePlanBySlug(
  database: NeonHttpDatabase,
  options: EnsurePlanOptions,
) {
  const existing = await findActivePlanIdBySlug(database, options.slug);
  if (existing) {
    return existing;
  }

  const [created] = await database
    .insert(plans)
    .values({
      name: options.name,
      slug: options.slug,
      description: options.description ?? null,
      priceCents: options.priceCents,
      promoPriceCents: options.promoPriceCents ?? null,
      promoActive: options.promoActive ?? false,
      promoEndsAt: options.promoEndsAt ?? null,
      popular: options.popular ?? false,
      active: options.active ?? true,
    })
    .onConflictDoNothing()
    .returning({ id: plans.id });

  if (created?.id) {
    return created.id;
  }

  const fallback = await findActivePlanIdBySlug(database, options.slug);
  if (fallback) {
    return fallback;
  }

  throw new Error(`Nao foi possivel garantir o plano ${options.slug}`);
}

let cachedMasterPlanId: string | null = null;

export async function ensureMasterPlanId(database: NeonHttpDatabase) {
  if (cachedMasterPlanId) {
    return cachedMasterPlanId;
  }

  cachedMasterPlanId = await ensurePlanBySlug(database, {
    slug: MASTER_PLAN_SLUG,
    name: MASTER_PLAN_NAME,
    description: MASTER_PLAN_DESCRIPTION,
    priceCents: 0,
    promoPriceCents: null,
    promoActive: false,
    popular: false,
    active: true,
  });

  return cachedMasterPlanId;
}
