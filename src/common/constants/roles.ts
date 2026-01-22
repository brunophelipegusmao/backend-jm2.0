export const USER_ROLES = [
  'MASTER',
  'ADMIN',
  'STAFF',
  'COACH',
  'STUDENT',
] as const;

export type UserRole = (typeof USER_ROLES)[number];
