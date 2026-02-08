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
  location: z.string().trim().min(3).max(160),
  hideLocation: z.boolean().optional(),
  accessMode: z.enum(eventAccessModeValues),
  capacity: z.number().int().min(1).optional().nullable(),
  allowGuests: z.boolean(),
  requiresConfirmation: z.boolean(),
  isPaid: z.boolean(),
  priceCents: z.number().int().min(1).optional().nullable(),
  paymentMethod: z.string().trim().min(2).max(60).optional().nullable(),
});

export const createEventSchema = baseEventSchema.superRefine((data, ctx) => {
  const accessMode = data.accessMode;
  if (accessMode === 'open') {
    if (data.capacity !== undefined && data.capacity !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capacity'],
        message: 'Capacidade deve ser nula para eventos abertos',
      });
    }
  } else if (data.capacity === undefined || data.capacity === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['capacity'],
      message: 'Capacidade é obrigatoria para eventos com inscricao',
    });
  }

  if (data.isPaid) {
    if (!data.priceCents || data.priceCents < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceCents'],
        message: 'Valor do evento é obrigatório',
      });
    }
    if (!data.paymentMethod || !data.paymentMethod.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paymentMethod'],
        message: 'Forma de pagamento é obrigatória',
      });
    }
    if (!data.requiresConfirmation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requiresConfirmation'],
        message: 'Eventos pagos exigem confirmacao de presenca',
      });
    }
  } else {
    if (data.priceCents !== undefined && data.priceCents !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceCents'],
        message: 'Valor só deve ser informado em eventos pagos',
      });
    }
    if (data.paymentMethod !== undefined && data.paymentMethod !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paymentMethod'],
        message: 'Forma de pagamento só deve ser informada em eventos pagos',
      });
    }
  }
});

export type CreateEventDto = z.infer<typeof createEventSchema>;

export { baseEventSchema };
