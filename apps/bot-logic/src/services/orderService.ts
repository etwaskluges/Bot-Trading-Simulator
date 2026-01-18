import type { BotData, OrderData, PriceContext, NewOrder } from "../types";
import { PRICE_BUFFER_PERCENT, PRICE_DEVIATION_THRESHOLD } from "../config";
import { StrategyEvaluator, StrategyFacts } from "./strategyService";

interface OrderDecisionContext {
  bot: BotData;
  stockId: string;
  stockOrders: OrderData[];
  sharesOwned: number;
  priceContext: PriceContext;
  botAvailableBalance: Map<string, number>;
  strategyEvaluator: StrategyEvaluator | null;
  ordersToCancelIds: string[];
}

/**
 * Determines which existing orders should be cancelled
 */
export function determineOrdersToCancell(
  stockOrders: OrderData[],
  strategy: string | null | undefined,
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

    if (strategy === "random" && diffPercent > PRICE_DEVIATION_THRESHOLD) {
      shouldCancel = true;
    }

    if (strategy === "momentum") {
      if (order.type === "BUY" && isPriceDown) shouldCancel = true;
      if (order.type === "SELL" && isPriceUp) shouldCancel = true;
    }

    if (strategy === "random") {
      shouldCancel = true;
    }

    if (shouldCancel) {
      ordersToCancelIds.push(order.id);
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
export async function createOrderIfValid(
  context: OrderDecisionContext,
  ordersToInsert: NewOrder[]
): Promise<void> {
  const {
    bot,
    sharesOwned,
    priceContext,
    botAvailableBalance,
    strategyEvaluator,
    stockOrders,
    stockId,
    ordersToCancelIds,
  } = context;
  const { currentPrice } = priceContext;

  const availableBalance = botAvailableBalance.get(bot.id) || 0;
  const volatility =
    priceContext.previousPrice && priceContext.previousPrice > 0
      ? Math.abs(currentPrice - priceContext.previousPrice) / priceContext.previousPrice
      : 0;

  const priceChangePercent =
    priceContext.previousPrice && priceContext.previousPrice > 0
      ? (currentPrice - priceContext.previousPrice) / priceContext.previousPrice
      : 0;

  // Add randomChance fact (0-100) for random operators
  const randomChance = Math.random() * 100;

  const facts: StrategyFacts = {
    currentPrice,
    previousPrice: priceContext.previousPrice,
    lastMinuteAverage: priceContext.lastMinuteAverage ?? currentPrice,
    isPriceUp: priceContext.isPriceUp,
    isPriceDown: priceContext.isPriceDown,
    hasPosition: sharesOwned > 0,
    openOrders: stockOrders.length,
    volatility,
    availableBalance,
    sharesOwned,
    botId: bot.id,
    stockId,
    priceChangePercent,
    timestamp: Date.now(),
    randomChance,
  };

  if (!strategyEvaluator) return;

  // For CANCEL actions, evaluate per-order if orders exist
  if (stockOrders.length > 0) {
    // Check if this might be a CANCEL strategy by evaluating with a dummy order
    const dummyOrderPrice = currentPrice;
    const cancelCheckFacts: StrategyFacts = {
      ...facts,
      orderPrice: dummyOrderPrice,
      orderAge: 0,
      orderDeviation: 0,
    };
    const cancelCheck = await strategyEvaluator.evaluate(cancelCheckFacts);
    
    // If CANCEL is triggered, evaluate each order individually
    if (cancelCheck && cancelCheck.type === "CANCEL") {
      for (const order of stockOrders) {
        if (ordersToCancelIds.includes(order.id)) continue;
        
        const orderPrice = Number(order.limit_price_cents);
        const orderDeviation = Math.abs(orderPrice - currentPrice) / currentPrice * 100;
        // For now, assume orderAge is 0 (created in current tick)
        // TODO: Track order creation time for accurate orderAge
        const orderAge = 0;
        
        const cancelFacts: StrategyFacts = {
          ...facts,
          orderPrice,
          orderAge,
          orderDeviation,
        };
        
        const cancelDecision = await strategyEvaluator.evaluate(cancelFacts);
        if (cancelDecision && cancelDecision.type === "CANCEL") {
          ordersToCancelIds.push(order.id);
          if (order.type === "BUY") {
            const currentBal = botAvailableBalance.get(bot.id) || 0;
            const refund = orderPrice * order.quantity;
            botAvailableBalance.set(bot.id, currentBal + refund);
          }
        }
      }
      return;
    }
  }

  // For BUY/SELL actions, evaluate normally
  const decision = await strategyEvaluator.evaluate(facts);
  if (!decision) return;

  console.log(
    `[BotDecision] bot=${bot.id} stock=${stockId} type=${decision.type} sizePct=${decision.params?.sizePct ?? 'n/a'} ` +
      `current=${currentPrice} prev=${priceContext.previousPrice ?? 'n/a'} lastMinAvg=${priceContext.lastMinuteAverage ?? 'n/a'}`
  );

  if (decision.type === "CANCEL") {
    // Fallback: if CANCEL is triggered without order-specific facts, cancel all orders
    for (const order of stockOrders) {
      if (ordersToCancelIds.includes(order.id)) continue;
      ordersToCancelIds.push(order.id);
      if (order.type === "BUY") {
        const currentBal = botAvailableBalance.get(bot.id) || 0;
        const refund = Number(order.limit_price_cents) * order.quantity;
        botAvailableBalance.set(bot.id, currentBal + refund);
      }
    }
    return;
  }

  const quantity = generateQuantityFromDecision(
    decision,
    currentPrice,
    availableBalance,
    sharesOwned
  );
  const limitPrice = calculateLimitPrice({
    strategy: bot.strategy ?? "random",
    action: decision.type,
    currentPrice,
    params: decision.params,
  });

  if (decision.type === "BUY") {
    const cost = limitPrice * quantity;
    if (availableBalance < cost) return;
    botAvailableBalance.set(bot.id, availableBalance - cost);
  } else {
    if (sharesOwned < quantity) return;
  }

  ordersToInsert.push({
    stock_id: stockId,
    trader_id: bot.id,
    type: decision.type,
    limit_price_cents: Math.max(1, limitPrice),
    quantity: quantity,
    status: "OPEN",
  });
}

function generateQuantityFromDecision(
  decision: { type: "BUY" | "SELL"; params: Record<string, any> },
  currentPrice: number,
  availableBalance: number,
  sharesOwned: number
): number {
  const sizePct = Number(decision.params?.sizePct);
  if (!Number.isFinite(sizePct) || sizePct <= 0) {
    return generateQuantity();
  }

  if (decision.type === "BUY") {
    const maxShares = Math.floor(availableBalance / Math.max(1, currentPrice));
    const scaled = Math.floor((maxShares * sizePct) / 100);
    return Math.max(1, scaled);
  }

  const scaled = Math.floor((sharesOwned * sizePct) / 100);
  return Math.max(1, scaled);
}

export function calculateLimitPrice({
  strategy,
  action,
  currentPrice,
  params,
}: {
  strategy: string | null | undefined;
  action: "BUY" | "SELL";
  currentPrice: number;
  params?: Record<string, any>;
}): number {
  const paramType = typeof params?.limitPriceType === "string" ? params.limitPriceType : "market";
  const paramValue =
    typeof params?.limitPriceValue === "number" ? params.limitPriceValue : Number(params?.limitPriceValue);

  if (paramType === "absoluteCents" && Number.isFinite(paramValue)) {
    return Math.max(1, Math.floor(paramValue));
  }

  if (paramType === "offsetAbsolute" && Number.isFinite(paramValue)) {
    return Math.max(1, Math.floor(currentPrice + paramValue));
  }

  if (paramType === "offsetPct" && Number.isFinite(paramValue)) {
    const multiplier = 1 + paramValue / 100;
    return Math.max(1, Math.floor(currentPrice * multiplier));
  }

  if (paramType === "market") {
    return currentPrice;
  }

  const priceBuffer = Math.floor(currentPrice * PRICE_BUFFER_PERCENT);

  if (strategy === "random") {
    const isAggressive = Math.random() > 0.5;

    if (action === "BUY") {
      return isAggressive ? currentPrice + priceBuffer : currentPrice - priceBuffer;
    }

    return isAggressive ? currentPrice - priceBuffer : currentPrice + priceBuffer;
  }

  return currentPrice;
}

export function generateQuantity(): number {
  return Math.floor(Math.random() * 5) + 1;
}
