import { z } from 'zod';
import { sexEnum } from '../../../drizzle/schema/health';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date',
  });

export const computeBodyCompositionSchema = z
  .object({
    sex: z.enum(sexEnum.enumValues),
    age: z.coerce.number().int().min(10).max(100).optional(),
    birthDate: dateString.optional(),
    weightKg: z.coerce.number().positive(),
    heightCm: z.coerce.number().positive().optional(),
    chestMm: z.coerce.number().positive().optional(),
    abdominalMm: z.coerce.number().positive().optional(),
    tricepsMm: z.coerce.number().positive().optional(),
    suprailiacMm: z.coerce.number().positive().optional(),
    thighMm: z.coerce.number().positive(),
    goalBodyFatPct: z.coerce.number().min(1).max(60).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.age && !data.birthDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'age ou birthDate é obrigatório',
        path: ['age'],
      });
    }

    if (data.sex === 'MALE') {
      if (data.chestMm === undefined || data.abdominalMm === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Dobras de peitoral e abdômen são obrigatórias para masculino',
          path: ['chestMm'],
        });
      }
    }

    if (data.sex === 'FEMALE') {
      if (data.tricepsMm === undefined || data.suprailiacMm === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Dobras de tríceps e supra-ilíaca são obrigatórias para feminino',
          path: ['tricepsMm'],
        });
      }
    }
  });

export type ComputeBodyCompositionDto = z.infer<
  typeof computeBodyCompositionSchema
>;
