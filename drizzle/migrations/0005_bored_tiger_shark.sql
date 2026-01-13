CREATE TABLE "tb_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"promo_price_cents" integer,
	"promo_active" boolean DEFAULT false NOT NULL,
	"promo_ends_at" timestamp with time zone,
	"popular" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tb_users" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_plans_name_unique" ON "tb_plans" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "tb_plans_slug_unique" ON "tb_plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tb_plans_active_idx" ON "tb_plans" USING btree ("active");--> statement-breakpoint
CREATE INDEX "tb_plans_popular_idx" ON "tb_plans" USING btree ("popular");--> statement-breakpoint
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
  'Plano Padrao',
  'padrao',
  null,
  0,
  null,
  false,
  null,
  false,
  true
);--> statement-breakpoint
UPDATE "tb_users"
SET "plan_id" = (SELECT "id" FROM "tb_plans" WHERE "slug" = 'padrao')
WHERE "plan_id" IS NULL;--> statement-breakpoint
ALTER TABLE "tb_users" ALTER COLUMN "plan_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tb_users" ADD CONSTRAINT "tb_users_plan_id_tb_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."tb_plans"("id") ON DELETE restrict ON UPDATE no action;
