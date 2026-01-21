// components/RuleCard.tsx
import { Trash2 } from 'lucide-react'
import { Button } from '~/lib/components/ui/button'
import { Input } from '~/lib/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/lib/components/ui/select'
import { CANCEL_FACT_OPTIONS, FACT_OPTIONS, OPERATOR_OPTIONS } from '../-constants'
import {
  buildIndicatorFact,
  isIndicatorBaseFact,
  parseIndicatorFact,
} from '../-utils/strategy-rules-conversion'
import type {
  IndicatorBaseFact,
  MetricValueSource,
  RuleCondition,
  RuleFact,
  RuleOperator,
} from '../-utils/types.ts'

interface RuleCardProps {
  rule: RuleCondition
  onRemove: () => void
  onUpdate: (ruleId: string, patch: Partial<RuleCondition>) => void
  actionType?: 'BUY' | 'SELL' | 'CANCEL'
}

export function RuleCard({ rule, onUpdate, onRemove, actionType }: RuleCardProps) {
  const parsedValueIndicator = typeof rule.value === 'string' ? parseIndicatorFact(rule.value) : null
  const valueSource: MetricSelection =
    typeof rule.value === 'number' || rule.value === ''
      ? 'value'
      : parsedValueIndicator
        ? parsedValueIndicator.base
        : rule.value as MetricValueSource
  
  const indicatorDefaults = getIndicatorDefaults(rule.fact)
  
  const isRangeOperator = rule.operator === 'between' || rule.operator === 'notBetween'
  const isRandomOperator = rule.operator === 'randomChance'
  const isOrderMetric = ['orderPrice', 'orderAge', 'orderDeviation'].includes(rule.fact)
  const isIndicatorMetric = isIndicatorBaseFact(rule.fact)
  
  // Use CANCEL facts for CANCEL actions, regular facts otherwise
  const factOptions = actionType === 'CANCEL' ? CANCEL_FACT_OPTIONS : FACT_OPTIONS
  
  // For order metrics and randomChance, don't show value source selector
  const showValueSource = !isOrderMetric && !isRandomOperator

  return (
    <div className="group/rule flex flex-wrap items-center gap-6 py-2 transition-all duration-300">
      <div className="flex flex-wrap items-center gap-4 flex-1">
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40 ml-1">
            Metric
          </label>
          <Select
            value={rule.fact}
            onValueChange={(value) => {
                const nextFact = value as RuleFact
                const updates: Partial<RuleCondition> = { fact: nextFact }
              // Clear value-related fields when changing fact
                if (['orderPrice', 'orderAge', 'orderDeviation'].includes(nextFact)) {
                updates.value = ''
              }
                if (isIndicatorBaseFact(nextFact)) {
                  const defaults = getIndicatorDefaults(nextFact)
                  if (defaults) {
                    updates.indicatorPeriod = defaults.period
                    updates.indicatorMultiplier = defaults.multiplier
                  }
                } else {
                  updates.indicatorPeriod = undefined
                  updates.indicatorMultiplier = undefined
                }
              onUpdate(rule.id, updates)
            }}
          >
            <SelectTrigger className="h-10 min-w-[180px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all">
              <SelectValue placeholder="Metric" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/50 bg-card/95 backdrop-blur-md">
              {factOptions.map((fact) => (
                <SelectItem
                  key={fact.value}
                  value={fact.value}
                  className="text-[10px] font-black uppercase tracking-widest"
                >
                  {fact.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40 ml-1">
            Logic
          </label>
          <Select
            value={rule.operator}
            onValueChange={(value) => {
              const updates: Partial<RuleCondition> = { operator: value as RuleOperator }
              // Clear range/random fields when changing operator
              if (value !== 'between' && value !== 'notBetween') {
                updates.valueMin = undefined
                updates.valueMax = undefined
              }
              if (value !== 'randomChance') {
                updates.randomProbability = undefined
              }
              onUpdate(rule.id, updates)
            }}
          >
            <SelectTrigger className="h-10 min-w-[140px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all">
              <SelectValue placeholder="Op" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/50 bg-card/95 backdrop-blur-md">
              {OPERATOR_OPTIONS.map((operator) => (
                <SelectItem
                  key={operator.value}
                  value={operator.value}
                  className="text-[10px] font-black uppercase tracking-widest"
                >
                  {operator.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isIndicatorMetric && (
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40 ml-1">
              Period
            </label>
            <Input
              type="number"
              min={1}
              value={rule.indicatorPeriod ?? indicatorDefaults?.period ?? ''}
              onChange={(event) => {
                const nextPeriod = event.target.value === '' ? undefined : Number(event.target.value)
                onUpdate(rule.id, { indicatorPeriod: nextPeriod })
              }}
              className="h-10 w-[110px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl font-mono text-xs font-bold transition-all"
            />
          </div>
        )}

        {isIndicatorMetric && indicatorDefaults?.multiplier !== undefined && (
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40 ml-1">
              Multiplier
            </label>
            <Input
              type="number"
              min={0.1}
              step={0.1}
              value={rule.indicatorMultiplier ?? indicatorDefaults.multiplier ?? ''}
              onChange={(event) => {
                const nextMultiplier = event.target.value === '' ? undefined : Number(event.target.value)
                onUpdate(rule.id, { indicatorMultiplier: nextMultiplier })
              }}
              className="h-10 w-[110px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl font-mono text-xs font-bold transition-all"
            />
          </div>
        )}

        {isRandomOperator ? (
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40 ml-1">
              Probability %
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="50"
              value={rule.randomProbability ?? ''}
              onChange={(event) => {
                const prob = event.target.value === '' ? undefined : Number(event.target.value)
                onUpdate(rule.id, { randomProbability: prob })
              }}
              className="h-10 w-[110px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl font-mono text-xs font-bold transition-all"
            />
          </div>
        ) : isRangeOperator ? (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40 ml-1">
                Min
              </label>
              <Input
                type="number"
                placeholder="Min"
                value={rule.valueMin ?? ''}
                onChange={(event) => {
                  const min = event.target.value === '' ? undefined : Number(event.target.value)
                  onUpdate(rule.id, { valueMin: min })
                }}
                className="h-10 w-[110px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl font-mono text-xs font-bold transition-all"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40 ml-1">
                Max
              </label>
              <Input
                type="number"
                placeholder="Max"
                value={rule.valueMax ?? ''}
                onChange={(event) => {
                  const max = event.target.value === '' ? undefined : Number(event.target.value)
                  onUpdate(rule.id, { valueMax: max })
                }}
                className="h-10 w-[110px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl font-mono text-xs font-bold transition-all"
              />
            </div>
          </>
        ) : showValueSource ? (
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40 ml-1">
              Value Source
            </label>
            <div className="flex items-center gap-2">
              <Select
                value={valueSource}
                onValueChange={(value) => {
                  const nextSource = value as MetricSelection
                  if (nextSource === 'value') {
                    onUpdate(rule.id, { value: '' })
                  } else if (isIndicatorBaseFact(nextSource as RuleFact)) {
                    const defaults = getIndicatorDefaults(nextSource as RuleFact)
                    if (defaults) {
                      const encoded = buildIndicatorFact(
                        nextSource as IndicatorBaseFact,
                        defaults.period,
                        defaults.multiplier,
                      )
                      onUpdate(rule.id, { value: encoded })
                    }
                  } else {
                    // nextSource is a MetricValueSource (currentPrice, previousPrice, lastMinuteAverage)
                    onUpdate(rule.id, { value: nextSource as MetricValueSource })
                  }
                }}
              >
                <SelectTrigger className="h-10 min-w-[160px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/50 bg-card/95 backdrop-blur-md">
                  {METRIC_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-[10px] font-black uppercase tracking-widest"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isIndicatorValueSource(valueSource) && (
                <IndicatorValueInputs
                  valueSource={valueSource}
                  valueIndicator={parsedValueIndicator}
                  onChange={(period, multiplier) => {
                    const encoded = buildIndicatorFact(valueSource as IndicatorBaseFact, period, multiplier)
                    onUpdate(rule.id, { value: encoded })
                  }}
                />
              )}
              {valueSource === 'value' && (
                <Input
                  type="number"
                  placeholder="0.00"
                  value={typeof rule.value === 'number' ? String(rule.value) : ''}
                  onChange={(event) => {
                    const nextValue = event.target.value === '' ? '' : Number(event.target.value)
                    onUpdate(rule.id, { value: nextValue })
                  }}
                  className="h-10 w-[110px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl font-mono text-xs font-bold transition-all"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40 ml-1">
              Value
            </label>
            <Input
              type="number"
              placeholder="0.00"
              value={typeof rule.value === 'number' ? String(rule.value) : ''}
              onChange={(event) => {
                const nextValue = event.target.value === '' ? '' : Number(event.target.value)
                onUpdate(rule.id, { value: nextValue })
              }}
              className="h-10 w-[110px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl font-mono text-xs font-bold transition-all"
            />
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-9 w-9 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-all opacity-0 group-hover/rule:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

const METRIC_OPTIONS: Array<{ value: MetricSelection; label: string }> = [
  { value: 'currentPrice', label: 'Current Price' },
  { value: 'previousPrice', label: 'Previous Price' },
  { value: 'lastMinuteAverage', label: 'Last Minute Average' },
  { value: 'movingAverage', label: 'Moving Average' },
  { value: 'rsi', label: 'RSI' },
  { value: 'bollingerUpper', label: 'Bollinger Upper' },
  { value: 'bollingerLower', label: 'Bollinger Lower' },
  { value: 'atr', label: 'ATR' },
  { value: 'supertrend', label: 'Supertrend' },
  { value: 'value', label: 'Value' },
]

type MetricSelection = MetricValueSource | RuleFact | 'value'

function isIndicatorValueSource(value: MetricSelection): value is RuleFact {
  return isIndicatorBaseFact(value as RuleFact)
}

function getIndicatorDefaults(fact: RuleFact | ''): { period: number; multiplier?: number } | null {
  if (!isIndicatorBaseFact(fact)) return null
  switch (fact) {
    case 'movingAverage':
      return { period: 10 }
    case 'rsi':
      return { period: 14 }
    case 'bollingerUpper':
    case 'bollingerLower':
      return { period: 20, multiplier: 2 }
    case 'atr':
      return { period: 14 }
    case 'supertrend':
      return { period: 10, multiplier: 3 }
  }
}

function IndicatorValueInputs({
  valueSource,
  valueIndicator,
  onChange,
}: {
  valueSource: RuleFact
  valueIndicator: { period: number; multiplier?: number } | null
  onChange: (period?: number, multiplier?: number) => void
}) {
  const defaults = getIndicatorDefaults(valueSource)
  const period = valueIndicator?.period ?? defaults?.period ?? ''
  const multiplier = valueIndicator?.multiplier ?? defaults?.multiplier

  return (
    <>
      <Input
        type="number"
        min={1}
        placeholder="Period"
        value={period}
        onChange={(event) => {
          const nextPeriod = event.target.value === '' ? undefined : Number(event.target.value)
          onChange(nextPeriod, valueIndicator?.multiplier ?? defaults?.multiplier)
        }}
        className="h-10 w-[90px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl font-mono text-xs font-bold transition-all"
      />
      {defaults?.multiplier !== undefined && (
        <Input
          type="number"
          min={0.1}
          step={0.1}
          placeholder="Mult"
          value={multiplier ?? ''}
          onChange={(event) => {
            const nextMultiplier = event.target.value === '' ? undefined : Number(event.target.value)
            onChange(valueIndicator?.period ?? defaults?.period, nextMultiplier)
          }}
          className="h-10 w-[90px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl font-mono text-xs font-bold transition-all"
        />
      )}
    </>
  )
}
