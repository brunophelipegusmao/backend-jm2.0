import { z } from 'zod';
import { cpfSchema } from '../../common/validators/cpf.schema';

export const convertGuestSchema = z.object({
  cpf: cpfSchema,
  phone: z.string().trim().min(8).max(20),
  planId: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
});

export type ConvertGuestDto = z.infer<typeof convertGuestSchema>;
