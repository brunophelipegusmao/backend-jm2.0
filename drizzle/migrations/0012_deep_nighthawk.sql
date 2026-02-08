ALTER TYPE "public"."event_registration_status" ADD VALUE 'pending';--> statement-breakpoint
ALTER TABLE "tb_events" ALTER COLUMN "location" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tb_event_registrations" ADD COLUMN "confirmed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "tb_event_registrations" ADD COLUMN "payment_method" varchar(60);--> statement-breakpoint
ALTER TABLE "tb_event_registrations" ADD COLUMN "payment_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "tb_events" ADD COLUMN "allow_guests" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tb_events" ADD COLUMN "requires_confirmation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tb_events" ADD COLUMN "is_paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tb_events" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "tb_events" ADD COLUMN "payment_method" varchar(60);--> statement-breakpoint
ALTER TABLE "tb_event_registrations" ADD CONSTRAINT "tb_event_registrations_confirmed_by_user_id_tb_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."tb_users"("id") ON DELETE restrict ON UPDATE no action;