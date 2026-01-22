import { z } from 'zod';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date',
  });

export const generateReceivablesSchema = z.object({
  competence: dateString.optional(),
});

export type GenerateReceivablesDto = z.infer<typeof generateReceivablesSchema>;
