import { z } from 'zod';
import { expenseCategoryValues, expenseStatusValues } from './financial.enums';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date',
  });

export const updateExpenseSchema = z.object({
  category: z.enum(expenseCategoryValues).optional(),
  description: z.string().min(1).max(160).optional(),
  competence: dateString.optional(),
  dueDate: dateString.optional(),
  amountCents: z.coerce.number().int().min(0).optional(),
  status: z.enum(expenseStatusValues).optional(),
  paidAt: dateString.optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type UpdateExpenseDto = z.infer<typeof updateExpenseSchema>;
