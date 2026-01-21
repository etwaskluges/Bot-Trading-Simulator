export type IndicatorKey =
  | `ma:${number}`
  | `rsi:${number}`
  | `bollingerUpper:${number}:${number}`
  | `bollingerLower:${number}:${number}`
  | `atr:${number}`
  | `supertrend:${number}:${number}`;

const DEFAULTS = {
  ma: 10,
  rsi: 14,
  bollingerPeriod: 20,
  bollingerMultiplier: 2,
  atr: 14,
  supertrendPeriod: 10,
  supertrendMultiplier: 3,
};

type ParsedIndicator =
  | { type: "ma"; period: number }
  | { type: "rsi"; period: number }
  | { type: "bollingerUpper"; period: number; multiplier: number }
  | { type: "bollingerLower"; period: number; multiplier: number }
  | { type: "atr"; period: number }
  | { type: "supertrend"; period: number; multiplier: number };

export function parseIndicatorKey(key: string): ParsedIndicator | null {
  const maMatch = /^ma:(\d+)$/.exec(key);
  if (maMatch) return { type: "ma", period: Number(maMatch[1]) };

  const rsiMatch = /^rsi:(\d+)$/.exec(key);
  if (rsiMatch) return { type: "rsi", period: Number(rsiMatch[1]) };

  const bollingerUpperMatch = /^bollingerUpper:(\d+):(\d+(?:\.\d+)?)$/.exec(key);
  if (bollingerUpperMatch) {
    return {
      type: "bollingerUpper",
      period: Number(bollingerUpperMatch[1]),
      multiplier: Number(bollingerUpperMatch[2]),
    };
  }

  const bollingerLowerMatch = /^bollingerLower:(\d+):(\d+(?:\.\d+)?)$/.exec(key);
  if (bollingerLowerMatch) {
    return {
      type: "bollingerLower",
      period: Number(bollingerLowerMatch[1]),
      multiplier: Number(bollingerLowerMatch[2]),
    };
  }

  const atrMatch = /^atr:(\d+)$/.exec(key);
  if (atrMatch) return { type: "atr", period: Number(atrMatch[1]) };

  const supertrendMatch = /^supertrend:(\d+):(\d+(?:\.\d+)?)$/.exec(key);
  if (supertrendMatch) {
    return {
      type: "supertrend",
      period: Number(supertrendMatch[1]),
      multiplier: Number(supertrendMatch[2]),
    };
  }

  return null;
}

export function buildIndicatorFacts(
  priceHistory: number[],
  indicatorKeys: Iterable<string>
): Record<string, number> {
  const facts: Record<string, number> = {};
  const history = priceHistory;
  const indicatorKeySet = new Set(indicatorKeys);
  const currentPrice = history.length ? history[history.length - 1] : 0;

  for (const key of indicatorKeySet) {
    const parsed = parseIndicatorKey(key);
    if (!parsed) continue;

    let value: number | null = null;
    switch (parsed.type) {
      case "ma": {
        value = sma(history, parsed.period);
        break;
      }
      case "rsi": {
        value = rsi(history, parsed.period);
        break;
      }
      case "bollingerUpper": {
        value = bollingerUpper(history, parsed.period, parsed.multiplier);
        break;
      }
      case "bollingerLower": {
        value = bollingerLower(history, parsed.period, parsed.multiplier);
        break;
      }
      case "atr": {
        value = atr(history, parsed.period);
        break;
      }
      case "supertrend": {
        value = supertrend(history, parsed.period, parsed.multiplier);
        break;
      }
    }

    if (!Number.isFinite(value)) {
      value = getIndicatorFallback(parsed, currentPrice);
    }

    if (Number.isFinite(value)) {
      facts[key] = value as number;
    }
  }

  // Add default indicators if base keys are used without params
  const baseToKey: Record<string, string> = {
    ma: `ma:${DEFAULTS.ma}`,
    rsi: `rsi:${DEFAULTS.rsi}`,
    bollingerUpper: `bollingerUpper:${DEFAULTS.bollingerPeriod}:${DEFAULTS.bollingerMultiplier}`,
    bollingerLower: `bollingerLower:${DEFAULTS.bollingerPeriod}:${DEFAULTS.bollingerMultiplier}`,
    atr: `atr:${DEFAULTS.atr}`,
    supertrend: `supertrend:${DEFAULTS.supertrendPeriod}:${DEFAULTS.supertrendMultiplier}`,
  };

  for (const [base, key] of Object.entries(baseToKey)) {
    if (!indicatorKeySet.has(base)) continue;
      if (!facts[base] && !facts[key]) {
      const parsed = parseIndicatorKey(key);
      if (!parsed) continue;
      const computed = buildIndicatorFacts(history, [key]);
      const computedValue = computed[key];
        if (Number.isFinite(computedValue)) facts[base] = computedValue;
    }
  }

  return facts;
}

function getIndicatorFallback(parsed: ParsedIndicator, currentPrice: number): number {
  switch (parsed.type) {
    case "rsi":
      return 50;
    case "atr":
      return 0;
    case "ma":
    case "bollingerUpper":
    case "bollingerLower":
    case "supertrend":
    default:
      return currentPrice;
  }
}

function sma(prices: number[], period: number): number | null {
  if (period <= 0 || prices.length < period) return null;
  const slice = prices.slice(-period);
  const sum = slice.reduce((acc, value) => acc + value, 0);
  return sum / period;
}

function stdDev(prices: number[], period: number): number | null {
  const avg = sma(prices, period);
  if (avg === null) return null;
  const slice = prices.slice(-period);
  const variance =
    slice.reduce((acc, value) => acc + Math.pow(value - avg, 2), 0) / period;
  return Math.sqrt(variance);
}

function rsi(prices: number[], period: number): number | null {
  if (period <= 0 || prices.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i += 1) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(prices: number[], period: number): number | null {
  if (period <= 0 || prices.length < period + 1) return null;
  let sum = 0;
  for (let i = prices.length - period; i < prices.length; i += 1) {
    sum += Math.abs(prices[i] - prices[i - 1]);
  }
  return sum / period;
}

function bollingerUpper(prices: number[], period: number, multiplier: number): number | null {
  const avg = sma(prices, period);
  const deviation = stdDev(prices, period);
  if (avg === null || deviation === null) return null;
  return avg + multiplier * deviation;
}

function bollingerLower(prices: number[], period: number, multiplier: number): number | null {
  const avg = sma(prices, period);
  const deviation = stdDev(prices, period);
  if (avg === null || deviation === null) return null;
  return avg - multiplier * deviation;
}

function supertrend(prices: number[], period: number, multiplier: number): number | null {
  const currentPrice = prices[prices.length - 1];
  const atrValue = atr(prices, period);
  if (!Number.isFinite(currentPrice) || atrValue === null) return null;
  return currentPrice - multiplier * atrValue;
}
