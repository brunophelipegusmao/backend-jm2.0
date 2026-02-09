import { z } from 'zod';

export const planRequestTypeSchema = z.enum([
  'plan_change',
  'plan_activation',
]);

export const createPlanRequestSchema = z
  .object({
    type: planRequestTypeSchema,
    targetPlanId: z.string().uuid().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(
    (payload) =>
      payload.type === 'plan_activation' || Boolean(payload.targetPlanId),
    {
      message: 'targetPlanId é obrigatório para troca de plano.',
      path: ['targetPlanId'],
    },
  );

export type CreatePlanRequestDto = z.infer<typeof createPlanRequestSchema>;
