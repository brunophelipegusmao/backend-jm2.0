import { z } from 'zod';

export const setPasswordSchema = z.object({
  newPassword: z.string().min(6).max(255),
});

export type SetPasswordDto = z.infer<typeof setPasswordSchema>;
