CREATE TABLE IF NOT EXISTS "privileges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exchange_role" text DEFAULT 'user' NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_orders_stock_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_orders_trader_status";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "privileges" ADD CONSTRAINT "privileges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_stock_status" ON "orders" USING btree ("stock_id" text_ops,"status" int8_ops,"type" uuid_ops,"limit_price_cents" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_trader_status" ON "orders" USING btree ("trader_id" uuid_ops,"status" text_ops);