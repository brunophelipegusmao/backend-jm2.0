import { z } from 'zod';
import { createHealthSchema } from './create-health.dto';

export const updateHealthSchema = createHealthSchema.partial();

export type UpdateHealthDto = z.infer<typeof updateHealthSchema>;
