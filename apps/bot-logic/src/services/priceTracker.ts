import type { PriceContext } from "../types";

/**
 * Tracks historical prices to calculate momentum
 */
export class PriceTracker {
  private lastPrices = new Map<string, number>();

  /**
   * Gets price context for a given stock
   */
  getPriceContext(stockId: string, currentPrice: number): PriceContext | null {
    const previousPrice = this.lastPrices.get(stockId);

    // Update history for next tick
    this.lastPrices.set(stockId, currentPrice);

    if (previousPrice === undefined) {
      // First tick seen for this stock, cannot determine trend yet.
      return null;
    }

    return {
      currentPrice,
      previousPrice,
      isPriceUp: currentPrice > previousPrice,
      isPriceDown: currentPrice < previousPrice,
    };
  }

  /**
   * Clears all price history (useful for testing/reset)
   */
  clear(): void {
    this.lastPrices.clear();
  }
}
