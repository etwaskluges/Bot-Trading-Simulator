import type { BotData, OrderData, PriceContext, NewOrder } from "../types";
import type { RuleProperties } from "json-rules-engine";
import { PRICE_BUFFER_PERCENT, PRICE_DEVIATION_THRESHOLD, TICK_RATE_MS } from "../config";
import { StrategyEvaluator, StrategyFacts } from "./strategyService";
import { buildIndicatorFacts, parseIndicatorKey } from "./indicatorUtils";

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
    // Provide default values for order-specific facts to prevent undefined fact errors
    orderPrice: 0,
    orderAge: 0,
    orderDeviation: 0,
    volume: 0,
  };

  if (!strategyEvaluator) return;

  const indicatorFacts = buildIndicatorFacts(
    priceContext.priceHistory ?? [currentPrice],
    collectIndicatorFacts(strategyEvaluator.rules)
  );
  const factsWithIndicators = { ...facts, ...indicatorFacts } as StrategyFacts;

  // For CANCEL actions, evaluate per-order if orders exist
  if (stockOrders.length > 0) {
    // Evaluate each order individually for potential cancellation
    for (const order of stockOrders) {
      if (ordersToCancelIds.includes(order.id)) continue;

      const orderPrice = Number(order.limit_price_cents);
      const orderDeviation = Math.abs(orderPrice - currentPrice) / currentPrice * 100;
      // Calculate order age in ticks (each tick is TICK_RATE_MS milliseconds)
      const orderCreatedAt = new Date(order.created_at).getTime();
      const currentTime = Date.now();
      const ageInMs = currentTime - orderCreatedAt;
      const orderAge = Math.floor(ageInMs / TICK_RATE_MS); // Convert to ticks

      const cancelFacts: StrategyFacts = {
        ...factsWithIndicators,
        orderPrice,
        orderAge,
        orderDeviation,
      };

      const cancelDecision = await strategyEvaluator.evaluate(cancelFacts);
      if (cancelDecision && cancelDecision.type === "CANCEL") {
        ordersToCancelIds.push(order.id);
        console.log(`[OrderCancelled] bot=${bot.id} order=${order.id} age=${orderAge} reason=age-based`);
        if (order.type === "BUY") {
          const currentBal = botAvailableBalance.get(bot.id) || 0;
          const refund = orderPrice * order.quantity;
          botAvailableBalance.set(bot.id, currentBal + refund);
        }
      }
    }
    return;
  }

  // For BUY/SELL actions, evaluate normally
  const decision = await strategyEvaluator.evaluate(factsWithIndicators);
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

function collectIndicatorFacts(rules: RuleProperties[]): Set<string> {
  const indicators = new Set<string>();

  for (const rule of rules ?? []) {
    collectFactsFromConditions(rule.conditions, indicators);
  }

  return indicators;
}

function collectFactsFromConditions(conditions: RuleProperties["conditions"] | undefined, target: Set<string>) {
  if (!conditions || typeof conditions !== "object") return;

  const conditionObj = conditions as { all?: unknown; any?: unknown; not?: unknown };
  const groups = [conditionObj.all, conditionObj.any];

  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const entry of group) {
      collectFactsFromNode(entry, target);
    }
  }

  if (conditionObj.not) {
    collectFactsFromNode(conditionObj.not, target);
  }
}

function collectFactsFromNode(node: unknown, target: Set<string>) {
  if (!node || typeof node !== "object") return;
  const item = node as { fact?: unknown; value?: unknown; all?: unknown; any?: unknown; not?: unknown };
  if (typeof item.fact === "string" && isIndicatorFactName(item.fact)) {
    target.add(item.fact);
  }

  if (item.value && typeof item.value === "object") {
    const valueFact = (item.value as { fact?: unknown }).fact;
    if (typeof valueFact === "string" && isIndicatorFactName(valueFact)) {
      target.add(valueFact);
    }
  }

  if (item.all || item.any || item.not) {
    collectFactsFromConditions(item as RuleProperties["conditions"], target);
  }
}

function isIndicatorFactName(fact: string): boolean {
  if (parseIndicatorKey(fact)) return true;
  return ["ma", "rsi", "bollingerUpper", "bollingerLower", "atr", "supertrend"].includes(fact);
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
