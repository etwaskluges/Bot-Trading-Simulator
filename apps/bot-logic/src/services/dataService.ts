import { postgres_db, schema, eq, and, inArray } from "@vibe-coding-boilerplate/db-drizzle";
import { sql } from "drizzle-orm";
import type { BotData, OrderData, PortfolioData, StockData } from "../types";

export interface MarketData {
  bots: BotData[];
  stocks: StockData[];
  allOpenOrders: OrderData[];
  allPortfolios: PortfolioData[];
  strategies: StrategyData[];
  lastMinuteAverages: LastMinuteAverage[];
}

export interface OrganizedData {
  ordersByBot: Map<string, OrderData[]>;
  portfolioByBotAndStock: Map<string, number>;
  botAvailableBalance: Map<string, number>;
  strategyRulesById: Map<string, unknown>;
  lastMinuteAverageByStock: Map<string, number>;
}

export interface StrategyData {
  id: string;
  rules: unknown;
}

export interface LastMinuteAverage {
  stock_id: string;
  average_price_cents: number | null;
}

/**
 * Fetches all necessary data from the database in parallel
 */
export async function fetchMarketData(): Promise<MarketData> {
  const [bots, stocks] = await Promise.all([
    postgres_db.select().from(schema.traders).where(eq(schema.traders.is_bot, true)),
    postgres_db.select().from(schema.stocks),
  ]);

  if (!bots.length || !stocks.length) {
    return {
      bots: [],
      stocks: [],
      allOpenOrders: [],
      allPortfolios: [],
      strategies: [],
      lastMinuteAverages: [],
    };
  }

  const botIds = bots.map((b) => b.id);
  const stockIds = stocks.map((s) => s.id);
  const strategyIds = bots
    .map((b) => b.strategy_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  // Fetch Open Orders for ALL bots in one go
  const allOpenOrders = await postgres_db
    .select()
    .from(schema.orders)
    .where(and(inArray(schema.orders.trader_id, botIds), eq(schema.orders.status, "OPEN")));

  // Fetch Portfolios for ALL bots in one go (to check share ownership)
  const allPortfolios = await postgres_db
    .select()
    .from(schema.portfolios)
    .where(inArray(schema.portfolios.trader_id, botIds));

  const strategies = strategyIds.length
    ? await postgres_db
        .select({
          id: schema.strategies.id,
          rules: schema.strategies.rules,
        })
        .from(schema.strategies)
        .where(inArray(schema.strategies.id, strategyIds))
    : [];

  const lastMinuteAverages = stockIds.length
    ? await postgres_db
        .select({
          stock_id: schema.trades.stock_id,
          average_price_cents: sql<number>`round(avg(${schema.trades.execution_price_cents}))`.as(
            "average_price_cents"
          ),
        })
        .from(schema.trades)
        .where(
          and(
            inArray(schema.trades.stock_id, stockIds),
            sql`${schema.trades.executed_at} >= now() - interval '1 minute'`
          )
        )
        .groupBy(schema.trades.stock_id)
    : [];

  return { bots, stocks, allOpenOrders, allPortfolios, strategies, lastMinuteAverages };
}

/**
 * Organizes fetched data into efficient lookup structures
 */
export function organizeMarketData(marketData: MarketData): OrganizedData {
  const { bots, allOpenOrders, allPortfolios, strategies, lastMinuteAverages } = marketData;

  // Organize Orders by Bot for O(1) Access
  const ordersByBot = new Map<string, OrderData[]>();
  for (const order of allOpenOrders) {
    const list = ordersByBot.get(order.trader_id) || [];
    list.push(order);
    ordersByBot.set(order.trader_id, list);
  }

  // Organize Portfolio by Bot-Stock combination
  const portfolioByBotAndStock = new Map<string, number>();
  for (const p of allPortfolios) {
    portfolioByBotAndStock.set(`${p.trader_id}-${p.stock_id}`, p.shares_owned);
  }

  // Track ephemeral balance to prevent overdrafts within the same tick
  const botAvailableBalance = new Map<string, number>();
  for (const bot of bots) {
    botAvailableBalance.set(bot.id, Number(bot.balance_cents));
  }

  const strategyRulesById = new Map<string, unknown>();
  for (const strategy of strategies) {
    strategyRulesById.set(strategy.id, strategy.rules);
  }

  const lastMinuteAverageByStock = new Map<string, number>();
  for (const avg of lastMinuteAverages) {
    if (avg.average_price_cents === null || avg.average_price_cents === undefined) continue;
    lastMinuteAverageByStock.set(avg.stock_id, Number(avg.average_price_cents));
  }

  return {
    ordersByBot,
    portfolioByBotAndStock,
    botAvailableBalance,
    strategyRulesById,
    lastMinuteAverageByStock,
  };
}

/**
 * Executes bulk order operations
 */
export async function executeOrderOperations(
  ordersToCancelIds: string[],
  ordersToInsert: any[]
): Promise<void> {
  if (ordersToCancelIds.length > 0) {
    console.log(`   ✂️ Cancelling ${ordersToCancelIds.length} stale orders...`);
    await postgres_db
      .update(schema.orders)
      .set({ status: "CANCELLED" })
      .where(inArray(schema.orders.id, ordersToCancelIds));
  }

  if (ordersToInsert.length > 0) {
    console.log(`   🚀 Placing ${ordersToInsert.length} new orders...`);
    await postgres_db.insert(schema.orders).values(ordersToInsert);
  }
}
