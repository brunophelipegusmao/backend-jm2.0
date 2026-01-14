CREATE TYPE "public"."expense_category" AS ENUM('rent', 'payroll', 'utilities', 'marketing', 'software', 'equipment', 'maintenance', 'taxes', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('planned', 'approved', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'card', 'cash', 'transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_source" AS ENUM('manual', 'gateway');--> statement-breakpoint
CREATE TYPE "public"."receivable_kind" AS ENUM('regular', 'prorated', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."receivable_status" AS ENUM('open', 'paid', 'overdue', 'cancelled', 'renegotiated');--> statement-breakpoint
CREATE TYPE "public"."subscription_due_date_mode" AS ENUM('fixed_day', 'custom_date');--> statement-breakpoint
CREATE TYPE "public"."subscription_proration_base" AS ENUM('calendar_month', '30_days');--> statement-breakpoint
CREATE TYPE "public"."subscription_proration_mode" AS ENUM('first_month_prorated', 'none', 'full_first_month');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'paused', 'cancelled', 'finished');--> statement-breakpoint
CREATE TABLE "tb_expense_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" "expense_category" DEFAULT 'other' NOT NULL,
	"default_amount_cents" integer NOT NULL,
	"billing_day" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tb_financial_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"category" "expense_category" DEFAULT 'other' NOT NULL,
	"description" varchar(160) NOT NULL,
	"competence" date NOT NULL,
	"due_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "expense_status" DEFAULT 'planned' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tb_financial_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"receivable_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "payment_source" DEFAULT 'manual' NOT NULL,
	"external_ref" varchar(140),
	"metadata" jsonb,
	"notes" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tb_financial_receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"competence" date NOT NULL,
	"due_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "receivable_status" DEFAULT 'open' NOT NULL,
	"kind" "receivable_kind" DEFAULT 'regular' NOT NULL,
	"paid_at" timestamp with time zone,
	"period_start" date,
	"period_end" date,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tb_user_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"due_date_mode" "subscription_due_date_mode" DEFAULT 'fixed_day' NOT NULL,
	"billing_day" integer,
	"custom_due_day" integer,
	"custom_due_date" date,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"monthly_amount_cents_snapshot" integer NOT NULL,
	"proration_mode" "subscription_proration_mode" DEFAULT 'first_month_prorated' NOT NULL,
	"proration_base" "subscription_proration_base" DEFAULT 'calendar_month' NOT NULL,
	"plan_name_snapshot" varchar(80) NOT NULL,
	"plan_slug_snapshot" varchar(120) NOT NULL,
	"plan_price_cents_snapshot" integer NOT NULL,
	"plan_promo_price_cents_snapshot" integer,
	"plan_months_snapshot" integer,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tb_financial_expenses" ADD CONSTRAINT "tb_financial_expenses_template_id_tb_expense_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."tb_expense_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tb_financial_expenses" ADD CONSTRAINT "tb_financial_expenses_created_by_user_id_tb_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."tb_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tb_financial_payments" ADD CONSTRAINT "tb_financial_payments_user_id_tb_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."tb_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tb_financial_payments" ADD CONSTRAINT "tb_financial_payments_receivable_id_tb_financial_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."tb_financial_receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tb_financial_receivables" ADD CONSTRAINT "tb_financial_receivables_user_id_tb_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."tb_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tb_financial_receivables" ADD CONSTRAINT "tb_financial_receivables_subscription_id_tb_user_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."tb_user_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tb_user_subscriptions" ADD CONSTRAINT "tb_user_subscriptions_user_id_tb_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."tb_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tb_user_subscriptions" ADD CONSTRAINT "tb_user_subscriptions_plan_id_tb_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."tb_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tb_expense_templates_active_idx" ON "tb_expense_templates" USING btree ("active") WHERE "tb_expense_templates"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_expense_templates_category_idx" ON "tb_expense_templates" USING btree ("category") WHERE "tb_expense_templates"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_expense_templates_unique_name_active" ON "tb_expense_templates" USING btree ("name") WHERE "tb_expense_templates"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_expenses_competence_idx" ON "tb_financial_expenses" USING btree ("competence") WHERE "tb_financial_expenses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_expenses_due_idx" ON "tb_financial_expenses" USING btree ("due_date") WHERE "tb_financial_expenses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_expenses_status_idx" ON "tb_financial_expenses" USING btree ("status") WHERE "tb_financial_expenses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_expenses_template_idx" ON "tb_financial_expenses" USING btree ("template_id") WHERE "tb_financial_expenses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_expenses_category_idx" ON "tb_financial_expenses" USING btree ("category") WHERE "tb_financial_expenses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_financial_expenses_unique_template_competence" ON "tb_financial_expenses" USING btree ("template_id","competence") WHERE "tb_financial_expenses"."deleted_at" IS NULL AND "tb_financial_expenses"."template_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_payments_user_idx" ON "tb_financial_payments" USING btree ("user_id") WHERE "tb_financial_payments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_payments_receivable_idx" ON "tb_financial_payments" USING btree ("receivable_id") WHERE "tb_financial_payments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_payments_paid_at_idx" ON "tb_financial_payments" USING btree ("paid_at") WHERE "tb_financial_payments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_financial_payments_external_ref_unique" ON "tb_financial_payments" USING btree ("external_ref") WHERE "tb_financial_payments"."deleted_at" IS NULL AND "tb_financial_payments"."external_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_receivables_user_idx" ON "tb_financial_receivables" USING btree ("user_id") WHERE "tb_financial_receivables"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_receivables_due_idx" ON "tb_financial_receivables" USING btree ("due_date") WHERE "tb_financial_receivables"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_receivables_status_idx" ON "tb_financial_receivables" USING btree ("status") WHERE "tb_financial_receivables"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_receivables_competence_idx" ON "tb_financial_receivables" USING btree ("competence") WHERE "tb_financial_receivables"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_financial_receivables_subscription_idx" ON "tb_financial_receivables" USING btree ("subscription_id") WHERE "tb_financial_receivables"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_financial_receivables_unique_sub_comp" ON "tb_financial_receivables" USING btree ("subscription_id","competence") WHERE "tb_financial_receivables"."deleted_at" IS NULL AND "tb_financial_receivables"."kind" = 'regular';--> statement-breakpoint
CREATE INDEX "tb_user_subscriptions_user_idx" ON "tb_user_subscriptions" USING btree ("user_id") WHERE "tb_user_subscriptions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tb_user_subscriptions_status_idx" ON "tb_user_subscriptions" USING btree ("status") WHERE "tb_user_subscriptions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_user_subscriptions_one_active_per_user" ON "tb_user_subscriptions" USING btree ("user_id") WHERE "tb_user_subscriptions"."deleted_at" IS NULL AND "tb_user_subscriptions"."status" = 'active';