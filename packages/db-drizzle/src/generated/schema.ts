import { pgTable, foreignKey, uuid, text, jsonb, check, boolean, bigint, unique, integer, index, timestamp, primaryKey, pgView } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { usersInAuth } from "../schema/auth"

export { usersInAuth }

const users = usersInAuth




export const strategies = pgTable("strategies", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	user_id: uuid().notNull(),
	name: text().notNull(),
	rules: jsonb().notNull(),
}, (table) => {
	return {
		strategies_user_id_fkey: foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "strategies_user_id_fkey"
		}).onDelete("cascade"),
	}
});

export const traders = pgTable("traders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	is_bot: boolean().default(false).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	balance_cents: bigint({ mode: "number" }).default(0).notNull(),
	strategy: text(),
	strategy_id: uuid().notNull(),
	user_id: uuid().notNull(),
}, (table) => {
	return {
		traders_strategy_id_fkey: foreignKey({
			columns: [table.strategy_id],
			foreignColumns: [strategies.id],
			name: "traders_strategy_id_fkey"
		}).onDelete("cascade"),
		traders_user_id_fkey: foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "traders_user_id_fkey"
		}).onDelete("cascade"),
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
		idx_orders_stock_status: index("idx_orders_stock_status").using("btree", table.stock_id.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("int8_ops"), table.type.asc().nullsLast().op("uuid_ops"), table.limit_price_cents.asc().nullsLast().op("uuid_ops")),
		idx_orders_trader_status: index("idx_orders_trader_status").using("btree", table.trader_id.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("text_ops")),
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

export const privileges = pgTable("privileges", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	exchange_role: text().default('user').notNull(),
	user_id: uuid().notNull(),
}, (table) => {
	return {
		privileges_user_id_fkey: foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "privileges_user_id_fkey"
		}).onDelete("cascade"),
		privileges_user_id_key: unique("privileges_user_id_key").on(table.user_id),
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
export const last_minute_average_prices = pgView("last_minute_average_prices", {	stock_id: uuid(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	average_price_cents: bigint({ mode: "number" }),
}).as(sql`SELECT trades.stock_id, round(avg(trades.execution_price_cents))::bigint AS average_price_cents FROM trades WHERE trades.executed_at >= (now() - '00:01:00'::interval) GROUP BY trades.stock_id`);

export const usercount = pgView("usercount", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	user_count: bigint({ mode: "number" }),
}).as(sql`SELECT count(*) AS user_count FROM auth.users`);