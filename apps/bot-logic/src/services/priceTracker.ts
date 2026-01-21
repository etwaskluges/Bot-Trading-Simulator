import type { PriceContext } from "../types";

/**
 * Tracks historical prices to calculate momentum
 */
const MAX_HISTORY = 200;

export class PriceTracker {
  private lastPrices = new Map<string, number>();
  private priceHistory = new Map<string, number[]>();

  /**
   * Gets price context for a given stock
   */
  getPriceContext(stockId: string, currentPrice: number): PriceContext | null {
    const previousPrice = this.lastPrices.get(stockId);
    const history = this.priceHistory.get(stockId) ?? [];
    const nextHistory = [...history, currentPrice];

    if (nextHistory.length > MAX_HISTORY) {
      nextHistory.splice(0, nextHistory.length - MAX_HISTORY);
    }

    // Update history for next tick
    this.lastPrices.set(stockId, currentPrice);
    this.priceHistory.set(stockId, nextHistory);

    if (previousPrice === undefined) {
      // First tick seen for this stock, cannot determine trend yet.
      return null;
    }

    return {
      currentPrice,
      previousPrice,
      isPriceUp: currentPrice > previousPrice,
      isPriceDown: currentPrice < previousPrice,
      priceHistory: nextHistory,
    };
  }

  /**
   * Clears all price history (useful for testing/reset)
   */
  clear(): void {
    this.lastPrices.clear();
    this.priceHistory.clear();
  }
}
