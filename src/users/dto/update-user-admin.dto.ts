import { z } from 'zod';
import { USER_ROLES } from '../../common/constants/roles';

export const updateUserAdminSchema = z
  .object({
    email: z.string().trim().email().optional(),
    cpf: z
      .string()
      .trim()
      .regex(/^\d{11}$/, 'CPF deve conter 11 digitos numericos')
      .optional(),
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(8).max(20).optional(),
    address: z.string().trim().min(4).max(255).optional(),
    image: z.string().trim().url().optional(),
    active: z.boolean().optional(),
    role: z.enum(USER_ROLES).optional(),
    planId: z.string().uuid().optional(),
  })
  .strict();

export type UpdateUserAdminDto = z.infer<typeof updateUserAdminSchema>;
