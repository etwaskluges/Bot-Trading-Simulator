// constants.ts
import { RuleFact, RuleOperator } from './-utils/strategy-types'

export const FACT_OPTIONS: Array<{ value: RuleFact; label: string }> = [
  { value: 'currentPrice', label: 'Current Price' },
  { value: 'previousPrice', label: 'Previous Price' },
  { value: 'lastMinuteAverage', label: 'Last Minute Average' },
  { value: 'volume', label: 'Volume' },
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
