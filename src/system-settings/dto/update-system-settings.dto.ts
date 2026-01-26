import { z } from 'zod';

const timeRegex = /^\d{2}:\d{2}$/;

const dayEnum = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

const segmentSchema = z.object({
  start: z.string().regex(timeRegex, 'formato HH:MM'),
  end: z.string().regex(timeRegex, 'formato HH:MM'),
});

const dayScheduleSchema = z.object({
  day: dayEnum,
  segments: z.array(segmentSchema).min(1),
});

const urlSchema = z.string().url();

const carouselImageSchema = z.object({
  imageUrl: urlSchema,
  altText: z.string().optional(),
});

const popupSchema = z.object({
  type: z.enum(['lightbox', 'welcome', 'modal']),
  imageUrl: urlSchema,
  link: urlSchema.optional(),
  active: z.boolean().optional(),
});

export const updateSystemSettingsSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().optional().nullable(),
  maintenanceAllowedRoutes: z.array(z.string()).optional(),
  operatingHours: z.array(dayScheduleSchema).optional(),
  contact: z
    .object({
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      phone: z.string().optional(),
      whatsappLink: urlSchema.optional(),
    })
    .optional(),
  socialLinks: z
    .object({
      instagram: urlSchema.optional(),
      facebook: urlSchema.optional(),
      youtube: urlSchema.optional(),
      tiktok: urlSchema.optional(),
      other: urlSchema.optional(),
    })
    .optional(),
  carouselImages: z.array(carouselImageSchema).max(5).optional(),
  promoPopups: z.array(popupSchema).max(3).optional(),
});

export type UpdateSystemSettingsDto = z.infer<
  typeof updateSystemSettingsSchema
>;
