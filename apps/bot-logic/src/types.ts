export type BotStrategy = "momentum" | "swing" | "random";

export interface BotData {
  id: string;
  balance_cents: string | number;
  strategy?: string | null;
  is_bot: boolean;
}

export interface StockData {
  id: string;
  symbol: string;
  current_price_cents: string | number;
}

export interface OrderData {
  id: string;
  stock_id: string;
  trader_id: string;
  type: "BUY" | "SELL";
  limit_price_cents: string | number;
  quantity: number;
  status: string;
}

export interface PortfolioData {
  trader_id: string;
  stock_id: string;
  shares_owned: number;
}

export interface NewOrder {
  stock_id: string;
  trader_id: string;
  type: "BUY" | "SELL";
  limit_price_cents: number;
  quantity: number;
  status: "OPEN";
}

export interface PriceContext {
  currentPrice: number;
  previousPrice?: number;
  isPriceUp: boolean;
  isPriceDown: boolean;
}
