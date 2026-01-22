import { z } from 'zod';
import { createPlanSchema } from './create-plan.dto';

export const updatePlanSchema = createPlanSchema.partial();

export type UpdatePlanDto = z.infer<typeof updatePlanSchema>;
