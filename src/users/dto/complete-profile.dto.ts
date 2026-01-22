import { z } from 'zod';

export const completeProfileSchema = z.object({
  cpf: z
    .string()
    .trim()
    .regex(/^\d{11}$/, 'CPF deve conter 11 digitos numericos'),
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(8).max(20).optional(),
  address: z.string().trim().min(4).max(255).optional(),
  image: z.string().trim().url().optional(),
});

export type CompleteProfileDto = z.infer<typeof completeProfileSchema>;
