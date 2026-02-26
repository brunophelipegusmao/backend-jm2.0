import { z } from 'zod';
import { cpfSchema } from '../../common/validators/cpf.schema';

export const completeProfileSchema = z.object({
  cpf: cpfSchema,
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(8).max(20),
  address: z.string().trim().min(4).max(255).optional(),
  image: z.string().trim().url().optional(),
});

export type CompleteProfileDto = z.infer<typeof completeProfileSchema>;
