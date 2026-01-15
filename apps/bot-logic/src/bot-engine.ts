import type { NewOrder } from "./types";
import { MAX_ORDERS_PER_BATCH } from "./config";
import { PriceTracker } from "./services/priceTracker";
import {
  fetchMarketData,
  organizeMarketData,
  executeOrderOperations,
} from "./services/dataService";
import { determineOrdersToCancell, createOrderIfValid } from "./services/orderService";
import { normalizeStrategy } from "./services/strategyService";

const priceTracker = new PriceTracker();

/**
 * Main bot tick logic - processes all bot actions for one cycle
 */
export async function tick(): Promise<void> {
  // 1. Fetch all necessary data
  const marketData = await fetchMarketData();

  if (!marketData.bots.length || !marketData.stocks.length) {
    console.log("🔸 Waiting for bots/stocks to be seeded...");
    return;
  }

  // 2. Organize data into efficient lookup structures
  const { ordersByBot, portfolioByBotAndStock, botAvailableBalance } =
    organizeMarketData(marketData);

  const ordersToInsert: NewOrder[] = [];
  const ordersToCancelIds: string[] = [];

  // 3. Process Logic per Stock
  for (const stock of marketData.stocks) {
    const currentPrice = Number(stock.current_price_cents);
    const priceContext = priceTracker.getPriceContext(stock.id, currentPrice);

    if (!priceContext) {
      // First tick seen for this stock, cannot determine trend yet.
      continue;
    }

    const trendSymbol = priceContext.isPriceUp
      ? "↗️"
      : priceContext.isPriceDown
        ? "↘️"
        : "➡️";
    console.log(
      `📊 ${stock.symbol}: ${currentPrice} (Prev: ${priceContext.previousPrice}) ${trendSymbol}`
    );

    // Process each bot's actions for this stock
    for (const bot of marketData.bots) {
      const botOrders = ordersByBot.get(bot.id) || [];
      const stockOrders = botOrders.filter((o) => o.stock_id === stock.id);
      const strategy = normalizeStrategy(bot.strategy);
      const sharesOwned = portfolioByBotAndStock.get(`${bot.id}-${stock.id}`) || 0;

      // --- CANCEL LOGIC ---
      // If we have orders that are stale or against strategy, cancel them
      if (stockOrders.length > 0) {
        determineOrdersToCancell(
          stockOrders,
          strategy,
          priceContext,
          ordersToCancelIds,
          botAvailableBalance,
          bot.id
        );

        // If we still have an uncanceled order for this stock, skip placing a new one
        const keepingOrder = stockOrders.find((o) => !ordersToCancelIds.includes(o.id));
        if (keepingOrder) continue;
      }

      // --- CREATE LOGIC ---
      createOrderIfValid(
        {
          bot,
          stockOrders,
          sharesOwned,
          priceContext,
          botAvailableBalance,
        },
        stock.id,
        ordersToInsert
      );
    }
  }

  // 4. Safety check: limit orders per batch
  if (ordersToInsert.length > MAX_ORDERS_PER_BATCH) {
    console.warn(`⚠️ Too many orders (${ordersToInsert.length}), limiting to ${MAX_ORDERS_PER_BATCH}`);
    ordersToInsert.length = MAX_ORDERS_PER_BATCH;
  }

  // 5. Execute all operations
  await executeOrderOperations(ordersToCancelIds, ordersToInsert);
}
