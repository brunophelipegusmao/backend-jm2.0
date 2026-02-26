import { z } from 'zod';
import { cpfSchema } from '../../common/validators/cpf.schema';

export const eventGuestRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().max(160),
  cpf: cpfSchema,
  phone: z.string().trim().min(8).max(20),
});

export type EventGuestRegistrationDto = z.infer<
  typeof eventGuestRegistrationSchema
>;
