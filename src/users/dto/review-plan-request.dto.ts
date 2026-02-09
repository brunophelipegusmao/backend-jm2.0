import { z } from 'zod';

export const reviewPlanRequestSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.status === 'rejected' && !payload.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe o motivo da recusa.',
        path: ['reason'],
      });
    }
  });

export type ReviewPlanRequestDto = z.infer<typeof reviewPlanRequestSchema>;
