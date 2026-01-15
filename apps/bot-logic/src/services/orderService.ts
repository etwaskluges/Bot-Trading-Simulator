import type { BotData, OrderData, PriceContext, NewOrder } from "../types";
import { PRICE_DEVIATION_THRESHOLD } from "../config";
import {
  normalizeStrategy,
  determineAction,
  calculateLimitPrice,
  generateQuantity,
} from "./strategyService";

interface OrderDecisionContext {
  bot: BotData;
  stockOrders: OrderData[];
  sharesOwned: number;
  priceContext: PriceContext;
  botAvailableBalance: Map<string, number>;
}

/**
 * Determines which existing orders should be cancelled
 */
export function determineOrdersToCancell(
  stockOrders: OrderData[],
  strategy: string,
  priceContext: PriceContext,
  ordersToCancelIds: string[],
  botAvailableBalance: Map<string, number>,
  botId: string
): void {
  const { currentPrice, isPriceUp, isPriceDown } = priceContext;

  for (const order of stockOrders) {
    const limitPrice = Number(order.limit_price_cents);
    const diffPercent = Math.abs(limitPrice - currentPrice) / currentPrice;

    let shouldCancel = false;

    // 1. Too far from price (5%) - strictly apply to random bots
    if (strategy === "random" && diffPercent > PRICE_DEVIATION_THRESHOLD) {
      shouldCancel = true;
    }

    // 2. Momentum Invalidated
    if (strategy === "momentum") {
      if (order.type === "BUY" && isPriceDown) shouldCancel = true;
      if (order.type === "SELL" && isPriceUp) shouldCancel = true;
    }

    // 3. Random Bot Churn (Fix for "Stuck" bots)
    // Random bots should be impatient. If their order hasn't filled, cancel and retry.
    if (strategy === "random") {
      shouldCancel = true;
    }

    if (shouldCancel) {
      ordersToCancelIds.push(order.id);
      // If we are cancelling a BUY, we effectively get that money back for this tick's budget
      if (order.type === "BUY") {
        const currentBal = botAvailableBalance.get(botId) || 0;
        const refund = Number(order.limit_price_cents) * order.quantity;
        botAvailableBalance.set(botId, currentBal + refund);
      }
    }
  }
}

/**
 * Creates a new order if conditions are met
 */
export function createOrderIfValid(
  context: OrderDecisionContext,
  stockId: string,
  ordersToInsert: NewOrder[]
): void {
  const { bot, sharesOwned, priceContext, botAvailableBalance } = context;
  const { currentPrice } = priceContext;

  const strategy = normalizeStrategy(bot.strategy);
  const action = determineAction(strategy, priceContext);

  if (!action) return;

  const quantity = generateQuantity();
  const limitPrice = calculateLimitPrice(strategy, action, currentPrice);

  // Validate Constraints
  if (action === "BUY") {
    const cost = limitPrice * quantity;
    const availableBalance = botAvailableBalance.get(bot.id) || 0;
    if (availableBalance < cost) return; // Too poor

    // Deduct from tracked balance so we don't overspend on the next stock
    botAvailableBalance.set(bot.id, availableBalance - cost);
  } else {
    if (sharesOwned < quantity) return; // Not enough shares
  }

  ordersToInsert.push({
    stock_id: stockId,
    trader_id: bot.id,
    type: action,
    limit_price_cents: Math.max(1, limitPrice),
    quantity: quantity,
    status: "OPEN",
  });
}
