import { z } from 'zod';
import { baseEventSchema } from './create-event.dto';

export const updateEventSchema = baseEventSchema.partial();

export type UpdateEventDto = z.infer<typeof updateEventSchema>;
