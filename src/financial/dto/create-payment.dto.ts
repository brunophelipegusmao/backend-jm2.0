import { z } from 'zod';
import { paymentMethodValues } from './financial.enums';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date',
  });

export const createPaymentSchema = z.object({
  receivableId: z.string().uuid(),
  amountCents: z.coerce.number().int().min(1),
  method: z.enum(paymentMethodValues),
  paidAt: dateString.optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;
