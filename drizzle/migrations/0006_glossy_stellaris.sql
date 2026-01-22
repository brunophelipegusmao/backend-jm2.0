ALTER TABLE "tb_users" DROP CONSTRAINT "tb_users_email_unique";--> statement-breakpoint
ALTER TABLE "tb_users" DROP CONSTRAINT "tb_users_cpf_unique";--> statement-breakpoint
DROP INDEX "tb_health_profiles_user_unique";--> statement-breakpoint
DROP INDEX "tb_users_phone_unique";--> statement-breakpoint
DROP INDEX "tb_plans_name_unique";--> statement-breakpoint
DROP INDEX "tb_plans_slug_unique";--> statement-breakpoint
DROP INDEX "tb_plans_active_idx";--> statement-breakpoint
DROP INDEX "tb_plans_popular_idx";--> statement-breakpoint
ALTER TABLE "tb_checkin_blocks" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tb_checkins" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tb_checkins" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tb_health_profiles" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tb_users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tb_plans" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_users_email_unique" ON "tb_users" USING btree ("email") WHERE "tb_users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_users_cpf_unique" ON "tb_users" USING btree ("cpf") WHERE "tb_users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_health_profiles_user_unique" ON "tb_health_profiles" USING btree ("user_id") WHERE "tb_health_profiles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_users_phone_unique" ON "tb_users" USING btree ("phone") WHERE "tb_users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_plans_name_unique" ON "tb_plans" USING btree ("name") WHERE "tb_plans"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_plans_slug_unique" ON "tb_plans" USING btree ("slug") WHERE "tb_plans"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_plans_active_idx" ON "tb_plans" USING btree ("active") WHERE "tb_plans"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_plans_popular_idx" ON "tb_plans" USING btree ("popular") WHERE "tb_plans"."deleted_at" IS NULL;