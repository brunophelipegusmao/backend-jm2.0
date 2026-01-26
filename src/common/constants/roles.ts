export const USER_ROLES = [
  'MASTER',
  'ADMIN',
  'STAFF',
  'COACH',
  'STUDENT',
  'GUEST',
] as const;

export type UserRole = (typeof USER_ROLES)[number];
