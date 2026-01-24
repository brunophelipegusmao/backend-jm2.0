import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
} from 'drizzle-orm/pg-core';

export const systemSettingsTable = pgTable('system_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  maintenanceMode: boolean('maintenance_mode').notNull().default(false),
  maintenanceMessage: text('maintenance_message'),
  maintenanceAllowedRoutes: jsonb('maintenance_allowed_routes'),
  operatingHours: jsonb('operating_hours'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zip_code'),
  phone: text('phone'),
  whatsappLink: text('whatsapp_link'),
  socialLinks: jsonb('social_links'),
  carouselImages: jsonb('carousel_images'),
  promoPopups: jsonb('promo_popups'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
