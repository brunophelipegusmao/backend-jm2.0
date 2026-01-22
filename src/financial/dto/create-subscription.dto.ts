import { z } from 'zod';
import {
  subscriptionDueDateModeValues,
  subscriptionProrationBaseValues,
  subscriptionProrationModeValues,
} from './financial.enums';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date',
  });

export const createSubscriptionSchema = z.object({
  userId: z.string().uuid(),
  planId: z.string().uuid(),
  startsAt: dateString.optional(),
  dueDateMode: z.enum(subscriptionDueDateModeValues).optional(),
  billingDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  customDueDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  customDueDate: dateString.optional().nullable(),
  prorationMode: z.enum(subscriptionProrationModeValues).optional(),
  prorationBase: z.enum(subscriptionProrationBaseValues).optional(),
  notes: z.string().max(2000).optional().nullable(),
  replaceActive: z.boolean().optional(),
});

export type CreateSubscriptionDto = z.infer<typeof createSubscriptionSchema>;
