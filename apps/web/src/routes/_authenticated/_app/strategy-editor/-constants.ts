// constants.ts
import { RuleFact, RuleOperator, StrategyRule } from './-utils/types'
import { createId, createRuleCondition, createRuleGroup } from './-utils/strategy-rules-conversion'

export const FACT_OPTIONS: Array<{ value: RuleFact; label: string }> = [
  { value: 'currentPrice', label: 'Current Price' },
  { value: 'previousPrice', label: 'Previous Price' },
  { value: 'lastMinuteAverage', label: 'Last Minute Average' },
  { value: 'volume', label: 'Volume' },
  { value: 'movingAverage', label: 'Moving Average' },
  { value: 'rsi', label: 'RSI' },
  { value: 'bollingerUpper', label: 'Bollinger Upper' },
  { value: 'bollingerLower', label: 'Bollinger Lower' },
  { value: 'atr', label: 'ATR' },
  { value: 'supertrend', label: 'Supertrend' },
]

export const CANCEL_FACT_OPTIONS: Array<{ value: RuleFact; label: string }> = [
  { value: 'orderPrice', label: 'Order Price' },
  { value: 'orderAge', label: 'Order Age (ticks)' },
  { value: 'orderDeviation', label: 'Order Deviation %' },
  ...FACT_OPTIONS,
]

export const OPERATOR_OPTIONS: Array<{ value: RuleOperator; label: string }> = [
  { value: 'lessThan', label: 'Smaller Than' },
  { value: 'greaterThan', label: 'Bigger Than' },
  { value: 'equal', label: 'Equal To' },
  { value: 'between', label: 'Between' },
  { value: 'notBetween', label: 'Not Between' },
  { value: 'randomChance', label: 'Random Chance %' },
]

export const DEFAULT_STRATEGY_RULES: StrategyRule[] = [
  {
    id: createId(),
    actionType: 'BUY' as const,
    priority: 1,
    conditions: createRuleGroup([
      createRuleCondition({
        fact: 'currentPrice',
        operator: 'greaterThan',
        value: 'previousPrice',
      }),
    ]),
    limitPriceType: 'market',
    limitPriceValue: 0,
  },
  {
    id: createId(),
    actionType: 'SELL' as const,
    priority: 2,
    conditions: createRuleGroup([
      createRuleCondition({
        fact: 'currentPrice',
        operator: 'lessThan',
        value: 'previousPrice',
      }),
    ]),
    limitPriceType: 'market',
    limitPriceValue: 0,
  },
  {
    id: createId(),
    actionType: 'CANCEL' as const,
    priority: 3,
    conditions: createRuleGroup([
      createRuleCondition({
        fact: 'orderAge',
        operator: 'greaterThan',
        value: 10,
      }),
    ]),
  },
]