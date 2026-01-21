import type { PriceContext } from "../types";
import { Engine, RuleProperties } from "json-rules-engine";

export interface StrategyFacts extends PriceContext {
  hasPosition: boolean;
  openOrders: number;
  volatility: number;
  availableBalance: number;
  sharesOwned: number;
  botId: string;
  stockId: string;
  priceChangePercent: number;
  timestamp: number;
  // Order-specific facts for CANCEL strategies
  orderPrice?: number;
  orderAge?: number;
  orderDeviation?: number;
  volume?: number;
  // Random chance fact (0-100) for randomChance operator
  randomChance?: number;
  // Core indicator facts (base defaults)
  ma?: number;
  rsi?: number;
  bollingerUpper?: number;
  bollingerLower?: number;
  atr?: number;
  supertrend?: number;
}

export interface StrategyDecision {
  type: "BUY" | "SELL" | "CANCEL";
  params: Record<string, any>;
}

export class StrategyEvaluator {
  private readonly engine = new Engine();

  constructor(public readonly rules: RuleProperties[]) {
    // Register custom operators
    this.engine.addOperator('between', (factValue: number, jsonValue: { min: number; max: number }) => {
      return factValue >= jsonValue.min && factValue <= jsonValue.max;
    });
    
    this.engine.addOperator('notBetween', (factValue: number, jsonValue: { min: number; max: number }) => {
      return factValue < jsonValue.min || factValue > jsonValue.max;
    });

    for (const rule of rules || []) {
      this.engine.addRule(rule);
    }
  }

  async evaluate(facts: StrategyFacts): Promise<StrategyDecision | null> {
    const { events } = await this.engine.run(facts);

    if (!events.length) return null;

    const firstEvent = events[0];
    const decisionType = firstEvent.type as StrategyDecision["type"];
    return {
      type: decisionType,
      params: firstEvent.params || {},
    };
  }
}

const ALLOWED_FACTS = new Set([
  "currentPrice",
  "previousPrice",
  "lastMinuteAverage",
  "isPriceUp",
  "isPriceDown",
  "hasPosition",
  "openOrders",
  "volatility",
  "availableBalance",
  "sharesOwned",
  "botId",
  "stockId",
  "priceChangePercent",
  "timestamp",
  "orderPrice",
  "orderAge",
  "orderDeviation",
  "volume",
  "randomChance",
  "ma",
  "rsi",
  "bollingerUpper",
  "bollingerLower",
  "atr",
  "supertrend"
]);
const ALLOWED_OPERATORS = new Set([
  "lessThan", 
  "greaterThan", 
  "equal",
  "between",
  "notBetween",
  "randomChance"
]);
const ALLOWED_EVENTS = new Set(["BUY", "SELL", "CANCEL"]);

/**
 * Converts an incoming rule definition (JSON string or already parsed object)
 * into a canonical list of RuleProperties. Falls back to the default rules if
 * the payload is missing/invalid.
 */
export function parseRuleSet(
  input?: string | RuleProperties[] | unknown,
  options: { fallbackToDefault?: boolean } = {}
): RuleProperties[] {
  const { fallbackToDefault = false } = options;
  if (!input) return fallbackToDefault ? [] : [];

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (!parsed) return fallbackToDefault ? [] : [];
      const normalized = normalizeRuleSet(Array.isArray(parsed) ? parsed : [parsed]);
      return normalized.length > 0 ? normalized : fallbackToDefault ? [] : [];
    } catch (error) {
      throw new Error("Invalid JSON rule definition");
    }
  }

  if (Array.isArray(input)) {
    const normalized = normalizeRuleSet(input);
    return normalized.length > 0 ? normalized : fallbackToDefault ? [] : [];
  }

  const normalized = normalizeRuleSet([input]);
  return normalized.length > 0 ? normalized : fallbackToDefault ? [] : [];
}

function normalizeRuleSet(rawRules: unknown[]): RuleProperties[] {
  const normalized: RuleProperties[] = [];
  for (const rawRule of rawRules) {
    const rule = normalizeRule(rawRule);
    if (rule) normalized.push(rule);
  }
  return normalized;
}

function normalizeRule(rawRule: unknown): RuleProperties | null {
  if (!rawRule || typeof rawRule !== "object") return null;
  const rule = rawRule as Record<string, any>;
  const conditions = normalizeConditions(rule.conditions);
  const event = normalizeEvent(rule.event);

  if (!conditions || !event) return null;

  const priority =
    typeof rule.priority === "number" && Number.isFinite(rule.priority) ? rule.priority : 1;

  return {
    priority,
    conditions,
    event,
  };
}

function normalizeConditions(rawConditions: unknown): RuleProperties["conditions"] | null {
  if (!rawConditions || typeof rawConditions !== "object") return null;
  const conditions = rawConditions as Record<string, any>;
  const hasAll = Array.isArray(conditions.all);
  const hasAny = Array.isArray(conditions.any);
  const source = hasAll ? conditions.all : hasAny ? conditions.any : null;

  if (!source) return null;

  const normalized = source
    .map((condition: unknown) => normalizeCondition(condition))
    .filter(Boolean) as RuleProperties["conditions"]["all"];

  if (normalized.length === 0) return null;

  return hasAll ? { all: normalized } : { any: normalized };
}

function normalizeCondition(rawCondition: unknown): RuleProperties["conditions"]["all"][number] | null {
  if (!rawCondition || typeof rawCondition !== "object") return null;
  const condition = rawCondition as Record<string, any>;
  const fact = typeof condition.fact === "string" ? condition.fact : null;
  const operator = typeof condition.operator === "string" ? condition.operator : null;

  if (!fact || !isAllowedFactName(fact)) return null;
  if (!operator || !ALLOWED_OPERATORS.has(operator)) return null;

  // Handle range operators
  if (operator === "between" || operator === "notBetween") {
    const valueMin = typeof condition.valueMin === "number" ? condition.valueMin : undefined;
    const valueMax = typeof condition.valueMax === "number" ? condition.valueMax : undefined;
    if (valueMin === undefined || valueMax === undefined) return null;
    
    return {
      fact,
      operator,
      value: { min: valueMin, max: valueMax },
    } as any;
  }

  // Handle random chance operator
  if (operator === "randomChance") {
    const probability = typeof condition.randomProbability === "number" 
      ? condition.randomProbability 
      : undefined;
    if (probability === undefined || probability < 0 || probability > 100) return null;
    
    // Use randomChance fact with lessThan operator
    return {
      fact: "randomChance",
      operator: "lessThan",
      value: probability,
    };
  }

  // Standard operators
  const value = normalizeValue(condition.value);
  if (value === undefined) return null;

  return {
    fact,
    operator,
    value,
  };
}

function normalizeValue(rawValue: unknown): unknown | undefined {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === "string") {
    if (isAllowedFactName(rawValue)) {
      return { fact: rawValue };
    }
    const asNumber = Number(rawValue);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }
    return undefined;
  }

  if (rawValue && typeof rawValue === "object") {
    const maybeFact = (rawValue as { fact?: unknown }).fact;
    if (typeof maybeFact === "string" && isAllowedFactName(maybeFact)) {
      return { fact: maybeFact };
    }
  }

  return undefined;
}

function isAllowedFactName(fact: string): boolean {
  if (ALLOWED_FACTS.has(fact)) return true;
  return (
    /^ma:\d+$/.test(fact) ||
    /^rsi:\d+$/.test(fact) ||
    /^bollingerUpper:\d+:\d+(?:\.\d+)?$/.test(fact) ||
    /^bollingerLower:\d+:\d+(?:\.\d+)?$/.test(fact) ||
    /^atr:\d+$/.test(fact) ||
    /^supertrend:\d+:\d+(?:\.\d+)?$/.test(fact)
  );
}

function normalizeEvent(rawEvent: unknown): RuleProperties["event"] | null {
  if (!rawEvent || typeof rawEvent !== "object") return null;
  const event = rawEvent as Record<string, any>;
  const type = typeof event.type === "string" ? event.type : null;
  if (!type || !ALLOWED_EVENTS.has(type)) return null;

  const params = event.params && typeof event.params === "object" ? event.params : undefined;
  return {
    type,
    params,
  };
}