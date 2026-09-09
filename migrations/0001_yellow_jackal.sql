CREATE TYPE "public"."paper_order_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."paper_order_status" AS ENUM('open', 'filled', 'cancelled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."paper_order_type" AS ENUM('market', 'limit', 'stop');--> statement-breakpoint
CREATE TABLE "paper_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_currency" text DEFAULT 'USD' NOT NULL,
	"balance" numeric(24, 10) DEFAULT '100000' NOT NULL,
	"equity" numeric(24, 10) DEFAULT '100000' NOT NULL,
	"realized_pnl" numeric(24, 10) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"side" "paper_order_side" NOT NULL,
	"order_type" "paper_order_type" NOT NULL,
	"quantity" numeric(28, 10) NOT NULL,
	"limit_price" numeric(24, 10),
	"stop_price" numeric(24, 10),
	"status" "paper_order_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"quantity" numeric(28, 10) DEFAULT '0' NOT NULL,
	"average_price" numeric(24, 10) DEFAULT '0' NOT NULL,
	"unrealized_pnl" numeric(24, 10) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paper_accounts" ADD CONSTRAINT "paper_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_account_id_paper_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."paper_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_account_id_paper_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."paper_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paper_positions_account_symbol_idx" ON "paper_positions" USING btree ("account_id","symbol");