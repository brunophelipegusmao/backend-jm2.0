import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data invalida')
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Data invalida',
  });

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return value;
}, z.boolean().optional());

export const eventsQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  isPublished: optionalBoolean,
  includeDeleted: optionalBoolean,
  search: z.string().trim().min(1).optional(),
});

export type EventsQueryDto = z.infer<typeof eventsQuerySchema>;

export const publicEventsQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
});

export type PublicEventsQueryDto = z.infer<typeof publicEventsQuerySchema>;
