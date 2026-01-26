import { z } from 'zod';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date',
  });

export const generateExpensesSchema = z.object({
  competence: dateString.optional(),
});

export type GenerateExpensesDto = z.infer<typeof generateExpensesSchema>;
