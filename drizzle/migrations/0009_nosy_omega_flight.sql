DO $$ BEGIN
	CREATE TYPE "public"."event_access_mode" AS ENUM('open', 'registered_only');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."event_registration_status" AS ENUM('confirmed', 'cancelled', 'waitlisted');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tb_event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"name" varchar(160),
	"email" varchar(160),
	"status" "event_registration_status" DEFAULT 'confirmed' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tb_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(160) NOT NULL,
	"slug" varchar(220) NOT NULL,
	"description" text NOT NULL,
	"date" date NOT NULL,
	"time" varchar(5) NOT NULL,
	"end_time" varchar(5),
	"location" varchar(160),
	"hide_location" boolean DEFAULT false NOT NULL,
	"thumbnail_public_id" varchar(140),
	"thumbnail_url" varchar(500),
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"access_mode" "event_access_mode" DEFAULT 'open' NOT NULL,
	"capacity" integer,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tb_users" ADD COLUMN IF NOT EXISTS "avatar_public_id" varchar(140);--> statement-breakpoint
ALTER TABLE "tb_users" ADD COLUMN IF NOT EXISTS "avatar_url" varchar(500);--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'tb_event_registrations_event_id_tb_events_id_fk'
			AND conrelid = 'tb_event_registrations'::regclass
	) THEN
		ALTER TABLE "tb_event_registrations"
			ADD CONSTRAINT "tb_event_registrations_event_id_tb_events_id_fk"
			FOREIGN KEY ("event_id") REFERENCES "public"."tb_events"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'tb_event_registrations_user_id_tb_users_id_fk'
			AND conrelid = 'tb_event_registrations'::regclass
	) THEN
		ALTER TABLE "tb_event_registrations"
			ADD CONSTRAINT "tb_event_registrations_user_id_tb_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."tb_users"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'tb_events_created_by_user_id_tb_users_id_fk'
			AND conrelid = 'tb_events'::regclass
	) THEN
		ALTER TABLE "tb_events"
			ADD CONSTRAINT "tb_events_created_by_user_id_tb_users_id_fk"
			FOREIGN KEY ("created_by_user_id") REFERENCES "public"."tb_users"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tb_event_registrations_event_idx" ON "tb_event_registrations" USING btree ("event_id") WHERE "tb_event_registrations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tb_event_registrations_status_idx" ON "tb_event_registrations" USING btree ("status") WHERE "tb_event_registrations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tb_event_registrations_event_user_unique" ON "tb_event_registrations" USING btree ("event_id","user_id") WHERE "tb_event_registrations"."deleted_at" IS NULL AND "tb_event_registrations"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tb_event_registrations_event_email_unique" ON "tb_event_registrations" USING btree ("event_id","email") WHERE "tb_event_registrations"."deleted_at" IS NULL AND "tb_event_registrations"."email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tb_events_slug_unique" ON "tb_events" USING btree ("slug") WHERE "tb_events"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tb_events_date_idx" ON "tb_events" USING btree ("date") WHERE "tb_events"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tb_events_published_idx" ON "tb_events" USING btree ("is_published") WHERE "tb_events"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tb_events_date_published_idx" ON "tb_events" USING btree ("date","is_published") WHERE "tb_events"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tb_events_slug_idx" ON "tb_events" USING btree ("slug") WHERE "tb_events"."deleted_at" IS NULL;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM "tb_plans"
		WHERE "slug" = 'free' AND "deleted_at" IS NULL
	) THEN
		INSERT INTO "tb_plans" (
			"name",
			"slug",
			"description",
			"price_cents",
			"promo_price_cents",
			"promo_active",
			"promo_ends_at",
			"popular",
			"active"
		) VALUES (
			'Plano Free',
			'free',
			'Plano gratuito para eventos',
			0,
			null,
			false,
			null,
			false,
			true
		);
	END IF;
END $$;
