DROP INDEX IF EXISTS "idx_orders_stock_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_orders_trader_status";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_stock_status" ON "orders" USING btree ("stock_id" text_ops,"status" int8_ops,"type" uuid_ops,"limit_price_cents" uuid_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_trader_status" ON "orders" USING btree ("trader_id" uuid_ops,"status" text_ops);