import { z } from 'zod';

export const eventRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().max(160).optional(),
});

export type EventRegistrationDto = z.infer<typeof eventRegistrationSchema>;
