import { z } from 'zod';
import { expenseCategoryValues } from './financial.enums';

export const updateExpenseTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: z.enum(expenseCategoryValues).optional(),
  defaultAmountCents: z.coerce.number().int().min(0).optional(),
  billingDay: z.coerce.number().int().min(1).max(31).optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export type UpdateExpenseTemplateDto = z.infer<
  typeof updateExpenseTemplateSchema
>;
