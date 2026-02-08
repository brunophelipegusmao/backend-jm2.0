import { z } from 'zod';

export const eventGuestRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().max(160),
  cpf: z
    .string()
    .trim()
    .regex(/^\d{11}$/, 'CPF deve conter 11 digitos numericos'),
  phone: z.string().trim().min(8).max(20),
});

export type EventGuestRegistrationDto = z.infer<
  typeof eventGuestRegistrationSchema
>;
