// constants.ts
import { RuleFact, RuleOperator } from './-utils/strategy-types'

export const FACT_OPTIONS: Array<{ value: RuleFact; label: string }> = [
  { value: 'currentPrice', label: 'Current Price' },
  { value: 'previousPrice', label: 'Previous Price' },
  { value: 'lastMinuteAverage', label: 'Last Minute Average' },
]

export const OPERATOR_OPTIONS: Array<{ value: RuleOperator; label: string }> = [
  { value: 'lessThan', label: 'Smaller Than' },
  { value: 'greaterThan', label: 'Bigger Than' },
  { value: 'equal', label: 'Equal To' },
]
