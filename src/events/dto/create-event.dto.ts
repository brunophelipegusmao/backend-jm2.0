import { z } from 'zod';
import { eventAccessModeValues } from './events.enums';

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horario invalido');

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data invalida')
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Data invalida',
  });

const baseEventSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(3),
  date: dateString,
  time: timeString,
  endTime: timeString.optional().nullable(),
  location: z.string().trim().max(160).optional().nullable(),
  hideLocation: z.boolean().optional(),
  accessMode: z.enum(eventAccessModeValues).optional(),
  capacity: z.number().int().min(1).optional().nullable(),
});

export const createEventSchema = baseEventSchema.superRefine((data, ctx) => {
  const accessMode = data.accessMode ?? 'open';
  if (accessMode === 'open' && data.capacity !== undefined && data.capacity !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['capacity'],
      message: 'Capacidade deve ser nula para eventos abertos',
    });
  }
});

export type CreateEventDto = z.infer<typeof createEventSchema>;

export { baseEventSchema };
