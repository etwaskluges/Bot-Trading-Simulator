import type { BotStrategy, PriceContext } from "../types";
import { PRICE_BUFFER_PERCENT } from "../config";

/**
 * Determines the trading action based on bot strategy and price context
 */
export function determineAction(
  strategy: BotStrategy,
  priceContext: PriceContext
): "BUY" | "SELL" | null {
  const { isPriceUp, isPriceDown } = priceContext;

  if (strategy === "momentum") {
    if (isPriceUp) return "BUY";
    if (isPriceDown) return "SELL";
  } else if (strategy === "swing") {
    if (isPriceUp) return "SELL";
    if (isPriceDown) return "BUY";
  } else {
    // Random
    return Math.random() > 0.5 ? "BUY" : "SELL";
  }

  return null;
}

/**
 * Calculates the limit price for an order based on strategy and action
 */
export function calculateLimitPrice(
  strategy: BotStrategy,
  action: "BUY" | "SELL",
  currentPrice: number
): number {
  const priceBuffer = Math.floor(currentPrice * PRICE_BUFFER_PERCENT);

  if (strategy === "random") {
    // Random Bots: Mixed Passive/Aggressive
    // 50% chance to cross the spread (Aggressive) to trigger trades
    const isAggressive = Math.random() > 0.5;

    if (action === "BUY") {
      // Aggressive: Pay MORE (Current + Buffer)
      // Passive: Pay LESS (Current - Buffer)
      return isAggressive ? currentPrice + priceBuffer : currentPrice - priceBuffer;
    }
    // Aggressive: Sell LOWER (Current - Buffer)
    // Passive: Sell HIGHER (Current + Buffer)
    return isAggressive ? currentPrice - priceBuffer : currentPrice + priceBuffer;
  }

  // Standard Strategy (Momentum/Swing) - Usually Passive/Maker
  if (action === "BUY") {
    return currentPrice - priceBuffer; // Buy slightly lower
  }
  return currentPrice + priceBuffer; // Sell slightly higher
}

/**
 * Generates a random quantity for an order (1 to 5)
 */
export function generateQuantity(): number {
  return Math.floor(Math.random() * 5) + 1;
}

/**
 * Normalizes strategy string to a valid BotStrategy type
 */
export function normalizeStrategy(strategy?: string | null): BotStrategy {
  const normalized = (strategy || "random").toLowerCase();
  if (normalized === "momentum" || normalized === "swing") {
    return normalized;
  }
  return "random";
}
