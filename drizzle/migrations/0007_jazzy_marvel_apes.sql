CREATE TABLE "tb_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"target_user_id" uuid,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tb_audit_logs" ADD CONSTRAINT "tb_audit_logs_actor_user_id_tb_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."tb_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tb_audit_logs" ADD CONSTRAINT "tb_audit_logs_target_user_id_tb_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."tb_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tb_audit_logs_actor_idx" ON "tb_audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "tb_audit_logs_target_idx" ON "tb_audit_logs" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "tb_audit_logs_entity_idx" ON "tb_audit_logs" USING btree ("entity","entity_id");