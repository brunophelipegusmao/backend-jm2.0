import { z } from 'zod';
import {
  subscriptionDueDateModeValues,
  subscriptionProrationBaseValues,
  subscriptionProrationModeValues,
  subscriptionStatusValues,
} from './financial.enums';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date',
  });

export const updateSubscriptionSchema = z.object({
  status: z.enum(subscriptionStatusValues).optional(),
  startsAt: dateString.optional(),
  endsAt: dateString.optional().nullable(),
  dueDateMode: z.enum(subscriptionDueDateModeValues).optional(),
  billingDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  customDueDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  customDueDate: dateString.optional().nullable(),
  prorationMode: z.enum(subscriptionProrationModeValues).optional(),
  prorationBase: z.enum(subscriptionProrationBaseValues).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export type UpdateSubscriptionDto = z.infer<typeof updateSubscriptionSchema>;
