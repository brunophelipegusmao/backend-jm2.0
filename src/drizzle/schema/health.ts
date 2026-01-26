import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const sexEnum = pgEnum('sex', ['MALE', 'FEMALE']);

export const bloodTypeEnum = pgEnum('blood_type', [
  'A_POSITIVE',
  'A_NEGATIVE',
  'B_POSITIVE',
  'B_NEGATIVE',
  'AB_POSITIVE',
  'AB_NEGATIVE',
  'O_POSITIVE',
  'O_NEGATIVE',
]);

export const healthProfiles = pgTable(
  'tb_health_profiles',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    sex: sexEnum('sex'),
    birthDate: date('birth_date').notNull(),

    heightCm: numeric('height_cm', { precision: 5, scale: 2 }),
    weightKg: numeric('weight_kg', { precision: 6, scale: 2 }),
    bloodType: bloodTypeEnum('blood_type'),

    // Pollock 7-site skinfolds (mm)
    skinfoldChest: numeric('skinfold_chest', { precision: 5, scale: 2 }),
    skinfoldAbdomen: numeric('skinfold_abdomen', { precision: 5, scale: 2 }),
    skinfoldThigh: numeric('skinfold_thigh', { precision: 5, scale: 2 }),
    skinfoldTriceps: numeric('skinfold_triceps', { precision: 5, scale: 2 }),
    skinfoldSubscapular: numeric('skinfold_subscapular', {
      precision: 5,
      scale: 2,
    }),
    skinfoldSuprailiac: numeric('skinfold_suprailiac', {
      precision: 5,
      scale: 2,
    }),
    skinfoldMidaxillary: numeric('skinfold_midaxillary', {
      precision: 5,
      scale: 2,
    }),

    injuries: text('injuries'),
    takesMedication: boolean('takes_medication'),
    medications: text('medications'),
    exercisesRegularly: boolean('exercises_regularly'),
    usesSupplementation: boolean('uses_supplementation'),
    supplements: text('supplements'),
    dailyRoutine: text('daily_routine'),
    foodRoutine: text('food_routine'),
    notesPublic: text('notes_public'),
    notesPrivate: text('notes_private'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    userHealthUnique: uniqueIndex('tb_health_profiles_user_unique')
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    birthValid: check(
      'tb_health_profiles_birth_valid',
      sql`${table.birthDate} <= CURRENT_DATE AND ${table.birthDate} >= DATE '1900-01-01'`,
    ),
    heightPositive: check(
      'tb_health_profiles_height_positive',
      sql`${table.heightCm} IS NULL OR (${table.heightCm} > 0 AND ${table.heightCm} < 300)`,
    ),
    weightPositive: check(
      'tb_health_profiles_weight_positive',
      sql`${table.weightKg} IS NULL OR (${table.weightKg} > 0 AND ${table.weightKg} < 500)`,
    ),
    skinfoldsRange: check(
      'tb_health_profiles_skinfolds_range',
      sql`(
        (${table.skinfoldChest} IS NULL OR (${table.skinfoldChest} >= 0 AND ${table.skinfoldChest} < 100)) AND
        (${table.skinfoldAbdomen} IS NULL OR (${table.skinfoldAbdomen} >= 0 AND ${table.skinfoldAbdomen} < 100)) AND
        (${table.skinfoldThigh} IS NULL OR (${table.skinfoldThigh} >= 0 AND ${table.skinfoldThigh} < 100)) AND
        (${table.skinfoldTriceps} IS NULL OR (${table.skinfoldTriceps} >= 0 AND ${table.skinfoldTriceps} < 100)) AND
        (${table.skinfoldSubscapular} IS NULL OR (${table.skinfoldSubscapular} >= 0 AND ${table.skinfoldSubscapular} < 100)) AND
        (${table.skinfoldSuprailiac} IS NULL OR (${table.skinfoldSuprailiac} >= 0 AND ${table.skinfoldSuprailiac} < 100)) AND
        (${table.skinfoldMidaxillary} IS NULL OR (${table.skinfoldMidaxillary} >= 0 AND ${table.skinfoldMidaxillary} < 100))
      )`,
    ),
  }),
);

export const healthProfilesRelations = relations(healthProfiles, ({ one }) => ({
  user: one(users, {
    fields: [healthProfiles.userId],
    references: [users.id],
  }),
}));
