import { z } from 'zod';

export const voidPaymentSchema = z.object({
  voidReason: z.string().min(1).max(2000),
});

export type VoidPaymentDto = z.infer<typeof voidPaymentSchema>;
