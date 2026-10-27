ALTER TABLE "jobs" ADD COLUMN "client_ip" text;--> statement-breakpoint
CREATE INDEX "jobs_ip_created_idx" ON "jobs" USING btree ("client_ip","created_at");