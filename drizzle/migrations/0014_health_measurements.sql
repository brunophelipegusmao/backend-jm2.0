CREATE TABLE "tb_health_measurements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sex" "sex",
	"birth_date" date,
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
	"target_body_fat_percent" numeric(5, 2),
	"bmi" numeric(6, 2),
	"bmi_category" text,
	"pollock_sum" numeric(6, 2),
	"body_density" numeric(7, 4),
	"body_fat_percent" numeric(5, 2),
	"fat_mass_kg" numeric(6, 2),
	"lean_mass_kg" numeric(6, 2),
	"ideal_body_mass_kg" numeric(6, 2),
	"excess_mass_kg" numeric(6, 2),
	"kcal_deficit" numeric(10, 2)
);
--> statement-breakpoint
ALTER TABLE "tb_health_measurements" ADD CONSTRAINT "tb_health_measurements_user_id_tb_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."tb_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tb_health_measurements_user_recorded_idx" ON "tb_health_measurements" USING btree ("user_id","recorded_at");
