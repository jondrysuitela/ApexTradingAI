ALTER TABLE "paper_orders" ADD COLUMN "filled_price" numeric(24, 10);--> statement-breakpoint
ALTER TABLE "paper_orders" ADD COLUMN "filled_at" timestamp with time zone;