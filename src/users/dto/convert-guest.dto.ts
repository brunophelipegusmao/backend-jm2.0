import { z } from 'zod';

export const convertGuestSchema = z.object({
  cpf: z
    .string()
    .trim()
    .regex(/^\d{11}$/, 'CPF deve conter 11 digitos numericos'),
  phone: z.string().trim().min(8).max(20),
  planId: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
});

export type ConvertGuestDto = z.infer<typeof convertGuestSchema>;
