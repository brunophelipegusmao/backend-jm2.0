import { z } from 'zod';
import { baseEventSchema } from './create-event.dto';

export const updateEventSchema = baseEventSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.accessMode === 'open') {
      if (data.capacity !== undefined && data.capacity !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capacity'],
          message: 'Capacidade deve ser nula para eventos abertos',
        });
      }
    }

    if (data.isPaid === true) {
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
      if (data.requiresConfirmation === false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requiresConfirmation'],
          message: 'Eventos pagos exigem confirmacao de presenca',
        });
      }
    }
  });

export type UpdateEventDto = z.infer<typeof updateEventSchema>;
