CREATE TABLE "rate_limit_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "cost_micros" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "cost_micros" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(summary, '')), 'B') || setweight(to_tsvector('english', coalesce(markdown, '')), 'C')) STORED;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "license" text;--> statement-breakpoint
CREATE INDEX "pages_tsv_idx" ON "pages" USING gin ("tsv");