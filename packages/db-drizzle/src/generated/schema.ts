import { pgTable, index, foreignKey, check, uuid, text, bigint, integer, timestamp, boolean, unique, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const orders = pgTable("orders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	stock_id: uuid().notNull(),
	trader_id: uuid().notNull(),
	type: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	limit_price_cents: bigint({ mode: "number" }).notNull(),
	quantity: integer().notNull(),
	status: text().default('OPEN').notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => {
	return {
		idx_orders_stock_status: index("idx_orders_stock_status").using("btree", table.stock_id.asc().nullsLast().op("int8_ops"), table.status.asc().nullsLast().op("int8_ops"), table.type.asc().nullsLast().op("text_ops"), table.limit_price_cents.asc().nullsLast().op("uuid_ops")),
		idx_orders_trader_status: index("idx_orders_trader_status").using("btree", table.trader_id.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")),
		orders_stock_id_fkey: foreignKey({
			columns: [table.stock_id],
			foreignColumns: [stocks.id],
			name: "orders_stock_id_fkey"
		}).onDelete("cascade"),
		orders_trader_id_fkey: foreignKey({
			columns: [table.trader_id],
			foreignColumns: [traders.id],
			name: "orders_trader_id_fkey"
		}).onDelete("cascade"),
		orders_type_check: check("orders_type_check", sql`type = ANY (ARRAY['BUY'::text, 'SELL'::text])`),
		orders_status_check: check("orders_status_check", sql`status = ANY (ARRAY['OPEN'::text, 'FILLED'::text, 'CANCELLED'::text])`),
	}
});

export const traders = pgTable("traders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	is_bot: boolean().default(false).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	balance_cents: bigint({ mode: "number" }).default(0).notNull(),
	strategy: text(),
}, (table) => {
	return {
		traders_balance_cents_check: check("traders_balance_cents_check", sql`balance_cents >= 0`),
	}
});

export const stocks = pgTable("stocks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	symbol: text().notNull(),
	name: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	current_price_cents: bigint({ mode: "number" }).default(0).notNull(),
	total_shares: integer().default(0).notNull(),
}, (table) => {
	return {
		stocks_symbol_key: unique("stocks_symbol_key").on(table.symbol),
	}
});

export const trades = pgTable("trades", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	stock_id: uuid().notNull(),
	buyer_id: uuid().notNull(),
	seller_id: uuid().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execution_price_cents: bigint({ mode: "number" }).notNull(),
	quantity: integer().notNull(),
	executed_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => {
	return {
		trades_stock_id_fkey: foreignKey({
			columns: [table.stock_id],
			foreignColumns: [stocks.id],
			name: "trades_stock_id_fkey"
		}).onDelete("cascade"),
		trades_buyer_id_fkey: foreignKey({
			columns: [table.buyer_id],
			foreignColumns: [traders.id],
			name: "trades_buyer_id_fkey"
		}),
		trades_seller_id_fkey: foreignKey({
			columns: [table.seller_id],
			foreignColumns: [traders.id],
			name: "trades_seller_id_fkey"
		}),
	}
});

export const portfolios = pgTable("portfolios", {
	trader_id: uuid().notNull(),
	stock_id: uuid().notNull(),
	shares_owned: integer().default(0).notNull(),
}, (table) => {
	return {
		portfolios_trader_id_fkey: foreignKey({
			columns: [table.trader_id],
			foreignColumns: [traders.id],
			name: "portfolios_trader_id_fkey"
		}).onDelete("cascade"),
		portfolios_stock_id_fkey: foreignKey({
			columns: [table.stock_id],
			foreignColumns: [stocks.id],
			name: "portfolios_stock_id_fkey"
		}).onDelete("cascade"),
		portfolios_pkey: primaryKey({ columns: [table.trader_id, table.stock_id], name: "portfolios_pkey"}),
		portfolios_shares_owned_check: check("portfolios_shares_owned_check", sql`shares_owned >= 0`),
	}
});
