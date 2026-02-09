import { z } from 'zod';

const sexValues = ['MALE', 'FEMALE'] as const;
const bloodTypeValues = [
  'A_POSITIVE',
  'A_NEGATIVE',
  'B_POSITIVE',
  'B_NEGATIVE',
  'AB_POSITIVE',
  'AB_NEGATIVE',
  'O_POSITIVE',
  'O_NEGATIVE',
] as const;

const dateString = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Data invalida',
  });

const healthBaseSchema = z.object({
  sex: z.enum(sexValues, {
    message: 'Sexo é obrigatório',
  }),
  birthDate: dateString,
  heightCm: z.coerce.number().positive(),
  weightKg: z.coerce.number().positive(),
  bloodType: z.enum(bloodTypeValues, {
    message: 'Tipo sanguineo é obrigatório',
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
    message: 'Informe se faz uso de medicacao',
  }),
  medications: z.string().trim().optional(),
  exercisesRegularly: z.boolean({
    message: 'Informe se pratica exercicios regularmente',
  }),
  usesSupplementation: z.boolean({
    message: 'Informe se utiliza suplementacao',
  }),
  supplements: z.string().trim().optional(),
  dailyRoutine: z.string().optional(),
  foodRoutine: z.string().optional(),
  notesPublic: z.string().optional(),
  notesPrivate: z.string().optional(),
});

const applyMedicationRules = (
  data: {
    takesMedication?: boolean;
    medications?: string;
    usesSupplementation?: boolean;
    supplements?: string;
  },
  ctx: z.RefinementCtx,
) => {
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
};

export const createHealthSchema = healthBaseSchema.superRefine(
  applyMedicationRules,
);

export const updateHealthBaseSchema = healthBaseSchema;

export type CreateHealthDto = z.infer<typeof createHealthSchema>;
