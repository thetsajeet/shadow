DROP INDEX "conversations_gen_idx";--> statement-breakpoint
DROP INDEX "jobs_session_status_idx";--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_user_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "jobs_session_status_idx" ON "jobs" USING btree ("user_id","status");