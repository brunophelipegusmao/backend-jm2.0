export const FREE_PLAN_SLUG = process.env.FREE_PLAN_SLUG || 'free';
export const LEGACY_FREE_PLAN_SLUG = 'padrao';
export const FREE_PLAN_SLUGS = new Set([FREE_PLAN_SLUG, LEGACY_FREE_PLAN_SLUG]);

export const MASTER_PLAN_SLUG = process.env.MASTER_PLAN_SLUG || 'master';
export const MASTER_PLAN_NAME = process.env.MASTER_PLAN_NAME || 'Plano Master';
export const MASTER_PLAN_DESCRIPTION =
  process.env.MASTER_PLAN_DESCRIPTION || 'Acesso completa do sistema';
