import { z } from 'zod';

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date',
  });

export const createPlanSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  priceCents: z.coerce.number().int().min(0),
  promoPriceCents: z.coerce.number().int().min(0).optional().nullable(),
  promoActive: z.boolean().optional(),
  promoEndsAt: dateString.optional().nullable(),
  popular: z.boolean().optional(),
  active: z.boolean().optional(),
  durationDays: z
    .coerce.number()
    .int()
    .positive()
    .optional()
    .nullable(),
});

export type CreatePlanDto = z.infer<typeof createPlanSchema>;
