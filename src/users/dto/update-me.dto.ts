import { z } from 'zod';

export const updateMeSchema = z
  .object({
    email: z.string().trim().email().optional(),
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(8).max(20).optional(),
    address: z.string().trim().max(255).optional(),
    image: z.string().trim().url().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

export type UpdateMeDto = z.infer<typeof updateMeSchema>;

