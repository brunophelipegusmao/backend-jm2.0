CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"maintenance_message" text,
	"maintenance_allowed_routes" jsonb,
	"operating_hours" jsonb,
	"address" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"phone" text,
	"whatsapp_link" text,
	"social_links" jsonb,
	"carousel_images" jsonb,
	"promo_popups" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tb_plans" ADD COLUMN "duration_days" integer;