export const USER_ROLES = [
  'MASTER',
  'ADMIN',
  'STAFF',
  'COACH',
  'STUDENT',
  'GUEST',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const MASTER_PLAN_ROLES = ['MASTER', 'ADMIN', 'STAFF', 'COACH'] as const;
export const MASTER_PLAN_ROLE_SET = new Set<string>(MASTER_PLAN_ROLES);
