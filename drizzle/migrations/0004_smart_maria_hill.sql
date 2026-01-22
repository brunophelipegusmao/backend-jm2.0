CREATE TABLE "tb_checkin_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tb_checkin_blocks_ends_after_starts" CHECK ("tb_checkin_blocks"."ends_at" > "tb_checkin_blocks"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "tb_checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tb_checkin_blocks" ADD CONSTRAINT "tb_checkin_blocks_user_id_tb_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."tb_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tb_checkins" ADD CONSTRAINT "tb_checkins_user_id_tb_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."tb_users"("id") ON DELETE cascade ON UPDATE no action;