ALTER TABLE "alerts" ADD COLUMN "last_triggered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "last_triggered_value" numeric(24, 10);