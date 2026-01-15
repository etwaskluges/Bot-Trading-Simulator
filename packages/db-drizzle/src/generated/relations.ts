import { relations } from "drizzle-orm/relations";
import { stocks, orders, traders, trades, portfolios } from "./schema";

export const ordersRelations = relations(orders, ({one}) => ({
	stock: one(stocks, {
		fields: [orders.stock_id],
		references: [stocks.id]
	}),
	trader: one(traders, {
		fields: [orders.trader_id],
		references: [traders.id]
	}),
}));

export const stocksRelations = relations(stocks, ({many}) => ({
	orders: many(orders),
	trades: many(trades),
	portfolios: many(portfolios),
}));

export const tradersRelations = relations(traders, ({many}) => ({
	orders: many(orders),
	trades_buyer_id: many(trades, {
		relationName: "trades_buyer_id_traders_id"
	}),
	trades_seller_id: many(trades, {
		relationName: "trades_seller_id_traders_id"
	}),
	portfolios: many(portfolios),
}));

export const tradesRelations = relations(trades, ({one}) => ({
	stock: one(stocks, {
		fields: [trades.stock_id],
		references: [stocks.id]
	}),
	trader_buyer_id: one(traders, {
		fields: [trades.buyer_id],
		references: [traders.id],
		relationName: "trades_buyer_id_traders_id"
	}),
	trader_seller_id: one(traders, {
		fields: [trades.seller_id],
		references: [traders.id],
		relationName: "trades_seller_id_traders_id"
	}),
}));

export const portfoliosRelations = relations(portfolios, ({one}) => ({
	trader: one(traders, {
		fields: [portfolios.trader_id],
		references: [traders.id]
	}),
	stock: one(stocks, {
		fields: [portfolios.stock_id],
		references: [stocks.id]
	}),
}));