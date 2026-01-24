import type { NewOrder } from "./types";
import { MAX_ORDERS_PER_BATCH } from "./config";
import type { PriceTracker } from "./services/priceTracker";
import {
  fetchMarketData,
  organizeMarketData,
  executeOrderOperations,
} from "./services/dataService";
import { createOrderIfValid } from "./services/orderService";
import { StrategyEvaluator, parseRuleSet } from "./services/strategyService";
import { sessionManager } from "./session/sessionManager";

export interface BotTickContext {
  sessionId: string;
  priceTracker: PriceTracker;
  strategyEvaluator?: StrategyEvaluator;
  ownerId?: string;
}

/**
 * Main bot tick logic - processes all bot actions for one cycle
 */
export async function tick(context: BotTickContext): Promise<void> {
  const { strategyEvaluator, priceTracker, sessionId, ownerId } = context;

  const marketData = await fetchMarketData();
  const sessionTag = sessionId.slice(0, 6);
  const hasOwnerId = typeof ownerId === "string" && ownerId.trim().length > 0;
  if (hasOwnerId) {
    if (!isUuid(ownerId)) {
      console.warn(`[${sessionTag}] ⚠️ Invalid ownerId provided, skipping tick`);
      return;
    }
    // Owner-specific session: only run this owner's bots
    const allowedBots = marketData.bots.filter((bot) => bot.user_id === ownerId);
    const allowedBotIds = new Set(allowedBots.map((bot) => bot.id));
    marketData.bots = allowedBots;
    marketData.allOpenOrders = marketData.allOpenOrders.filter((order) =>
      allowedBotIds.has(order.trader_id)
    );
    marketData.allPortfolios = marketData.allPortfolios.filter((portfolio) =>
      allowedBotIds.has(portfolio.trader_id)
    );
    marketData.strategies = marketData.strategies.filter((strategy) =>
      allowedBots.some((bot) => bot.strategy_id === strategy.id)
    );
  } else {
    // Default session: only run bots for owners who have active sessions
    const activeOwnerIds = new Set(
      sessionManager.listSessions()
        .filter(session => session.ownerId && session.status === 'running')
        .map(session => session.ownerId)
    );

    // Only run bots if their owner has an active session
    marketData.bots = marketData.bots.filter((bot) => activeOwnerIds.has(bot.user_id));
    const allowedBotIds = new Set(marketData.bots.map((bot) => bot.id));
    marketData.allOpenOrders = marketData.allOpenOrders.filter((order) =>
      allowedBotIds.has(order.trader_id)
    );
    marketData.allPortfolios = marketData.allPortfolios.filter((portfolio) =>
      allowedBotIds.has(portfolio.trader_id)
    );
    marketData.strategies = marketData.strategies.filter((strategy) =>
      marketData.bots.some((bot) => bot.strategy_id === strategy.id)
    );
  }

  if (!marketData.bots.length || !marketData.stocks.length) {
    console.log("🔸 Waiting for bots/stocks to be seeded...");
    return;
  }

  const {
    ordersByBot,
    portfolioByBotAndStock,
    botAvailableBalance,
    strategyRulesById,
    lastMinuteAverageByStock,
  } =
    organizeMarketData(marketData);

  const ordersToInsert: NewOrder[] = [];
  const ordersToCancelIds: string[] = [];
  const evaluatorByStrategyId = new Map<string, StrategyEvaluator>();

  for (const stock of marketData.stocks) {
    const currentPrice = Number(stock.current_price_cents);
    const priceContext = priceTracker.getPriceContext(stock.id, currentPrice);

    if (!priceContext) {
      continue;
    }

    const lastMinuteAverage = lastMinuteAverageByStock.get(stock.id) ?? currentPrice;
    priceContext.lastMinuteAverage = lastMinuteAverage;

    const trendSymbol = priceContext.isPriceUp
      ? "↗️"
      : priceContext.isPriceDown
        ? "↘️"
        : "➡️";
    console.log(
      `[${sessionTag}] 📊 ${stock.symbol}: ${currentPrice} (Prev: ${priceContext.previousPrice}) ${trendSymbol}`
    );

    for (const bot of marketData.bots) {
      const botOrders = ordersByBot.get(bot.id) || [];
      const stockOrders = botOrders.filter((o) => o.stock_id === stock.id);
      const sharesOwned = portfolioByBotAndStock.get(`${bot.id}-${stock.id}`) || 0;
      const evaluatorOverride = strategyEvaluator ?? null;
      let evaluatorForBot = evaluatorOverride;

      if (!evaluatorForBot) {
        const strategyId = bot.strategy_id;
        if (strategyId && strategyRulesById.has(strategyId)) {
          evaluatorForBot = evaluatorByStrategyId.get(strategyId) || null;
          if (!evaluatorForBot) {
            const rawRules = strategyRulesById.get(strategyId);
            const rules = parseRuleSet(rawRules, { fallbackToDefault: false });
            evaluatorForBot = new StrategyEvaluator(rules);
            evaluatorByStrategyId.set(strategyId, evaluatorForBot);
          }
        }
      }

      await createOrderIfValid(
        {
          bot,
          stockId: stock.id,
          stockOrders,
          sharesOwned,
          priceContext,
          botAvailableBalance,
          strategyEvaluator: evaluatorForBot,
          ordersToCancelIds,
        },
        ordersToInsert
      );
    }
  }

  if (ordersToInsert.length > MAX_ORDERS_PER_BATCH) {
    console.warn(
      `⚠️ Too many orders (${ordersToInsert.length}), limiting to ${MAX_ORDERS_PER_BATCH}`
    );
    ordersToInsert.length = MAX_ORDERS_PER_BATCH;
  }

  const uniqueCancelIds = Array.from(new Set(ordersToCancelIds));
  await executeOrderOperations(uniqueCancelIds, ordersToInsert);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
