CREATE TABLE "token_budgets" (
	"key" text PRIMARY KEY NOT NULL,
	"tokens_reserved" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
