import { z } from 'zod';
import { expenseCategoryValues } from './financial.enums';

export const createExpenseTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(expenseCategoryValues).optional(),
  defaultAmountCents: z.coerce.number().int().min(0),
  billingDay: z.coerce.number().int().min(1).max(31),
  active: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateExpenseTemplateDto = z.infer<
  typeof createExpenseTemplateSchema
>;
