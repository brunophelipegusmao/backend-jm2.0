import { z } from 'zod';

export const confirmRegistrationSchema = z.object({
  paymentAmountCents: z.number().int().min(1).optional(),
  paymentMethod: z.string().trim().min(2).max(60).optional(),
});

export type ConfirmRegistrationDto = z.infer<typeof confirmRegistrationSchema>;
