import { postgres_db, schema, eq, and, inArray } from "@vibe-coding-boilerplate/db-drizzle";
import type { BotData, OrderData, PortfolioData, StockData } from "../types";

export interface MarketData {
  bots: BotData[];
  stocks: StockData[];
  allOpenOrders: OrderData[];
  allPortfolios: PortfolioData[];
}

export interface OrganizedData {
  ordersByBot: Map<string, OrderData[]>;
  portfolioByBotAndStock: Map<string, number>;
  botAvailableBalance: Map<string, number>;
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
    return { bots: [], stocks: [], allOpenOrders: [], allPortfolios: [] };
  }

  const botIds = bots.map((b) => b.id);

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

  return { bots, stocks, allOpenOrders, allPortfolios };
}

/**
 * Organizes fetched data into efficient lookup structures
 */
export function organizeMarketData(marketData: MarketData): OrganizedData {
  const { bots, allOpenOrders, allPortfolios } = marketData;

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

  return { ordersByBot, portfolioByBotAndStock, botAvailableBalance };
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
