import { z } from 'zod';
import { expenseCategoryValues, expenseStatusValues } from './financial.enums';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date',
  });

export const createExpenseSchema = z.object({
  templateId: z.string().uuid().optional().nullable(),
  category: z.enum(expenseCategoryValues).optional(),
  description: z.string().min(1).max(160),
  competence: dateString,
  dueDate: dateString,
  amountCents: z.coerce.number().int().min(0),
  status: z.enum(expenseStatusValues).optional(),
  paidAt: dateString.optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;
