// utils/strategy-types.ts

export type RuleCombinator = 'all' | 'any' | 'not'
export type RuleOperator = 'lessThan' | 'greaterThan' | 'equal'
export type RuleFact = 'currentPrice' | 'previousPrice' | 'lastMinuteAverage' | 'volume'
export type MetricValueSource = 'currentPrice' | 'previousPrice' | 'lastMinuteAverage'
export type LimitPriceType = 'market' | 'offsetPct' | 'absoluteCents'

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
  value: MetricValueSource | number | ''
}
