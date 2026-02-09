import { z } from 'zod';
import { updateHealthBaseSchema } from './create-health.dto';

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

export const updateHealthSchema = updateHealthBaseSchema
  .partial()
  .superRefine(applyMedicationRules);

export type UpdateHealthDto = z.infer<typeof updateHealthSchema>;
