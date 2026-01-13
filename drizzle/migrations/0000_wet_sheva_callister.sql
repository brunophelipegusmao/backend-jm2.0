CREATE TYPE "public"."blood_type" AS ENUM('A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('MALE', 'FEMALE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('MASTER', 'ADMIN', 'STAFF', 'COACH', 'STUDENT');--> statement-breakpoint
CREATE TABLE "tb_health_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"sex" "sex",
	"birth_date" date NOT NULL,
	"height_cm" numeric(5, 2),
	"weight_kg" numeric(6, 2),
	"blood_type" "blood_type",
	"skinfold_chest" numeric(5, 2),
	"skinfold_abdomen" numeric(5, 2),
	"skinfold_thigh" numeric(5, 2),
	"skinfold_triceps" numeric(5, 2),
	"skinfold_subscapular" numeric(5, 2),
	"skinfold_suprailiac" numeric(5, 2),
	"skinfold_midaxillary" numeric(5, 2),
	"injuries" text,
	"takes_medication" boolean,
	"medications" text,
	"exercises_regularly" boolean,
	"uses_supplementation" boolean,
	"supplements" text,
	"daily_routine" text,
	"food_routine" text,
	"notes_public" text,
	"notes_private" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tb_health_profiles_birth_valid" CHECK ("tb_health_profiles"."birth_date" <= CURRENT_DATE AND "tb_health_profiles"."birth_date" >= DATE '1900-01-01'),
	CONSTRAINT "tb_health_profiles_height_positive" CHECK ("tb_health_profiles"."height_cm" IS NULL OR ("tb_health_profiles"."height_cm" > 0 AND "tb_health_profiles"."height_cm" < 300)),
	CONSTRAINT "tb_health_profiles_weight_positive" CHECK ("tb_health_profiles"."weight_kg" IS NULL OR ("tb_health_profiles"."weight_kg" > 0 AND "tb_health_profiles"."weight_kg" < 500)),
	CONSTRAINT "tb_health_profiles_skinfolds_range" CHECK ((
        ("tb_health_profiles"."skinfold_chest" IS NULL OR ("tb_health_profiles"."skinfold_chest" >= 0 AND "tb_health_profiles"."skinfold_chest" < 100)) AND
        ("tb_health_profiles"."skinfold_abdomen" IS NULL OR ("tb_health_profiles"."skinfold_abdomen" >= 0 AND "tb_health_profiles"."skinfold_abdomen" < 100)) AND
        ("tb_health_profiles"."skinfold_thigh" IS NULL OR ("tb_health_profiles"."skinfold_thigh" >= 0 AND "tb_health_profiles"."skinfold_thigh" < 100)) AND
        ("tb_health_profiles"."skinfold_triceps" IS NULL OR ("tb_health_profiles"."skinfold_triceps" >= 0 AND "tb_health_profiles"."skinfold_triceps" < 100)) AND
        ("tb_health_profiles"."skinfold_subscapular" IS NULL OR ("tb_health_profiles"."skinfold_subscapular" >= 0 AND "tb_health_profiles"."skinfold_subscapular" < 100)) AND
        ("tb_health_profiles"."skinfold_suprailiac" IS NULL OR ("tb_health_profiles"."skinfold_suprailiac" >= 0 AND "tb_health_profiles"."skinfold_suprailiac" < 100)) AND
        ("tb_health_profiles"."skinfold_midaxillary" IS NULL OR ("tb_health_profiles"."skinfold_midaxillary" >= 0 AND "tb_health_profiles"."skinfold_midaxillary" < 100))
      ))
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tb_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"cpf" varchar(11) NOT NULL,
	"name" text,
	"password" varchar(255) NOT NULL,
	"address" text,
	"phone" varchar(15),
	"active" boolean DEFAULT true NOT NULL,
	"role" "user_role" DEFAULT 'STUDENT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tb_users_email_unique" UNIQUE("email"),
	CONSTRAINT "tb_users_cpf_unique" UNIQUE("cpf"),
	CONSTRAINT "password_complexity" CHECK ("tb_users"."password" ~ '^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W).{6,}$')
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tb_health_profiles" ADD CONSTRAINT "tb_health_profiles_user_id_tb_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."tb_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_tb_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."tb_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_tb_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."tb_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tb_health_profiles_user_unique" ON "tb_health_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tb_users_phone_unique" ON "tb_users" USING btree ("phone");