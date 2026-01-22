import { z } from 'zod';
import { bloodTypeEnum, sexEnum } from '../../drizzle/schema/health';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date',
  });

export const createHealthSchema = z.object({
  sex: z.enum(sexEnum.enumValues).optional(),
  birthDate: dateString,
  heightCm: z.coerce.number().positive().optional(),
  weightKg: z.coerce.number().positive().optional(),
  bloodType: z.enum(bloodTypeEnum.enumValues).optional(),
  targetBodyFatPercent: z.coerce.number().min(1).max(60).optional(),
  skinfoldChest: z.coerce.number().positive().optional(),
  skinfoldAbdomen: z.coerce.number().positive().optional(),
  skinfoldThigh: z.coerce.number().positive().optional(),
  skinfoldTriceps: z.coerce.number().positive().optional(),
  skinfoldSubscapular: z.coerce.number().positive().optional(),
  skinfoldSuprailiac: z.coerce.number().positive().optional(),
  skinfoldMidaxillary: z.coerce.number().positive().optional(),
  injuries: z.string().optional(),
  takesMedication: z.boolean().optional(),
  medications: z.string().optional(),
  exercisesRegularly: z.boolean().optional(),
  usesSupplementation: z.boolean().optional(),
  supplements: z.string().optional(),
  dailyRoutine: z.string().optional(),
  foodRoutine: z.string().optional(),
  notesPublic: z.string().optional(),
  notesPrivate: z.string().optional(),
});

export type CreateHealthDto = z.infer<typeof createHealthSchema>;
