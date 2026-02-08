import { z } from 'zod';
import { bloodTypeEnum, sexEnum } from '../../drizzle/schema/health';

const dateString = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Data invalida',
  });

export const createHealthSchema = z
  .object({
    sex: z.enum(sexEnum.enumValues, {
      required_error: 'Sexo é obrigatório',
    }),
    birthDate: dateString,
    heightCm: z.coerce.number().positive(),
    weightKg: z.coerce.number().positive(),
    bloodType: z.enum(bloodTypeEnum.enumValues, {
      required_error: 'Tipo sanguineo é obrigatório',
    }),
    targetBodyFatPercent: z.coerce.number().min(1).max(60).optional(),
    skinfoldChest: z.coerce.number().positive().optional(),
    skinfoldAbdomen: z.coerce.number().positive().optional(),
    skinfoldThigh: z.coerce.number().positive().optional(),
    skinfoldTriceps: z.coerce.number().positive().optional(),
    skinfoldSubscapular: z.coerce.number().positive().optional(),
    skinfoldSuprailiac: z.coerce.number().positive().optional(),
    skinfoldMidaxillary: z.coerce.number().positive().optional(),
    injuries: z.string().trim().min(1, 'Informe lesoes ou "nenhuma"'),
    takesMedication: z.boolean({
      required_error: 'Informe se faz uso de medicacao',
    }),
    medications: z.string().trim().optional(),
    exercisesRegularly: z.boolean({
      required_error: 'Informe se pratica exercicios regularmente',
    }),
    usesSupplementation: z.boolean({
      required_error: 'Informe se utiliza suplementacao',
    }),
    supplements: z.string().trim().optional(),
    dailyRoutine: z.string().optional(),
    foodRoutine: z.string().optional(),
    notesPublic: z.string().optional(),
    notesPrivate: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.takesMedication && !data.medications?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['medications'],
        message: 'Medicacoes sao obrigatorias quando takesMedication for true',
      });
    }

    if (data.usesSupplementation && !data.supplements?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supplements'],
        message: 'Suplementos sao obrigatorios quando usesSupplementation for true',
      });
    }
  });

export type CreateHealthDto = z.infer<typeof createHealthSchema>;
