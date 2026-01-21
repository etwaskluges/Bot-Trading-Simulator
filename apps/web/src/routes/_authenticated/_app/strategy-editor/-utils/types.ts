// utils/strategy-types.ts

import type { Database } from '~/types/supabase'

export type RuleCombinator = 'all' | 'any' | 'not'
export type RuleOperator = 'lessThan' | 'greaterThan' | 'equal' | 'between' | 'notBetween' | 'randomChance'
export type IndicatorBaseFact =
  | 'movingAverage'
  | 'rsi'
  | 'bollingerUpper'
  | 'bollingerLower'
  | 'atr'
  | 'supertrend'
export type EncodedIndicatorFact =
  | `ma:${number}`
  | `rsi:${number}`
  | `bollingerUpper:${number}:${number}`
  | `bollingerLower:${number}:${number}`
  | `atr:${number}`
  | `supertrend:${number}:${number}`
export type RuleFact =
  | 'currentPrice'
  | 'previousPrice'
  | 'lastMinuteAverage'
  | 'volume'
  | 'orderPrice'
  | 'orderAge'
  | 'orderDeviation'
  | IndicatorBaseFact
export type MetricValueSource = 'currentPrice' | 'previousPrice' | 'lastMinuteAverage'
export type LimitPriceType = 'market' | 'offsetPct' | 'absoluteCents' | 'offsetAbsolute'

export type StrategyAction = 'BUY' | 'SELL' | 'CANCEL'

export type StrategyRule = {
  id: string
  actionType: StrategyAction
  priority: number
  conditions: RuleGroup
  limitPriceType?: LimitPriceType
  limitPriceValue?: number
}

export type RuleNode = RuleGroup | RuleCondition

export type RuleGroup = {
  id: string
  type: 'group'
  combinator: RuleCombinator
  children: RuleNode[]
}

export type RuleCondition = {
  id: string
  type: 'rule'
  fact: RuleFact | ''
  operator: RuleOperator | ''
  value: MetricValueSource | number | '' | EncodedIndicatorFact
  indicatorPeriod?: number
  indicatorMultiplier?: number
  // For range operators (between/notBetween)
  valueMin?: number
  valueMax?: number
  // For randomChance operator
  randomProbability?: number
}

export type StatusType = 'idle' | 'loading' | 'success' | 'error'

type StrategyTable = Database['public']['Tables']['strategies']

export type StrategyRow = StrategyTable['Row']
export type StrategyPayload = Pick<StrategyTable['Insert'], 'name' | 'rules'> & {
  id?: string
}

export type StrategyDefinition = {
  id: string
  name: string
  rules: StrategyRule[]
}

export type RuleEngineRule = {
  priority?: number
  conditions?: unknown
  event?: {
    type?: unknown
    params?: Record<string, unknown>
  }
}