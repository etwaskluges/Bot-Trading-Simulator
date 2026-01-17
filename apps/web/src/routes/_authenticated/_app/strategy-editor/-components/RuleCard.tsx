// components/RuleCard.tsx
import * as React from 'react'
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
import { FACT_OPTIONS, OPERATOR_OPTIONS } from '../-constants'
import type {
  MetricValueSource,
  RuleCondition,
  RuleFact,
  RuleOperator,
} from '../-utils/strategy-types'

interface RuleCardProps {
  rule: RuleCondition
  onRemove: () => void
  onUpdate: (ruleId: string, patch: Partial<RuleCondition>) => void
}

export function RuleCard({ rule, onRemove, onUpdate }: RuleCardProps) {
  const valueSource: MetricSelection =
    typeof rule.value === 'number' || rule.value === '' ? 'value' : rule.value

  return (
    <div className="group/rule flex flex-wrap items-center gap-6 py-2 transition-all duration-300">
      <div className="flex flex-wrap items-center gap-4 flex-1">
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40 ml-1">
            Metric
          </label>
          <Select
            value={rule.fact}
            onValueChange={(value) => onUpdate(rule.id, { fact: value as RuleFact })}
          >
            <SelectTrigger className="h-10 min-w-[180px] bg-muted/10 border-transparent hover:bg-muted/20 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all">
              <SelectValue placeholder="Metric" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/50 bg-card/95 backdrop-blur-md">
              {FACT_OPTIONS.map((fact) => (
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
            onValueChange={(value) => onUpdate(rule.id, { operator: value as RuleOperator })}
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
                } else {
                  onUpdate(rule.id, { value: nextSource })
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
  { value: 'value', label: 'Value' },
]

type MetricSelection = MetricValueSource | 'value'
