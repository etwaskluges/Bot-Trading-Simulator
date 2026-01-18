// components/RuleEditor.tsx
import { Input } from '~/lib/components/ui/input'
import { Badge } from '~/lib/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/lib/components/ui/select'
import { cn } from '~/lib/utils/cn'
import { GroupEditor } from './GroupEditor'
import {
  appendNode,
  createRuleCondition,
  createRuleGroup,
  removeNode,
  updateGroup,
  updateRule,
  validateRules,
} from '../-utils/strategy-helpers'
import type { LimitPriceType, RuleGroup } from '../-utils/strategy-types'
type StrategyAction = 'BUY' | 'SELL' | 'CANCEL'

type StrategyRule = {
  id: string
  actionType: StrategyAction
  priority: number
  conditions: RuleGroup
  limitPriceType?: LimitPriceType
  limitPriceValue?: number
}

interface RuleEditorProps {
  rules: StrategyRule[]
  onUpdateRules: (rules: StrategyRule[]) => void
}

export function RuleEditor({ rules, onUpdateRules }: RuleEditorProps) {
  const updateRule = (ruleId: string, updates: Partial<StrategyRule>) => {
    onUpdateRules(rules.map(rule =>
      rule.id === ruleId ? { ...rule, ...updates } : rule
    ))
  }

  const updateRuleConditions = (ruleId: string, conditions: RuleGroup) => {
    updateRule(ruleId, { conditions })
  }

  // Ensure rules are always in the correct order: BUY, SELL, CANCEL
  const orderedRules = [...rules].sort((a, b) => {
    const order: Record<StrategyAction, number> = { 'BUY': 0, 'SELL': 1, 'CANCEL': 2 }
    return order[a.actionType] - order[b.actionType]
  })

  return (
    <div className="space-y-6">
      {orderedRules.map((rule, index) => (
        <RuleCard
          key={rule.id}
          rule={rule}
          index={index}
          onUpdate={updateRule}
          onUpdateConditions={updateRuleConditions}
        />
      ))}
    </div>
  )
}

interface RuleCardProps {
  rule: StrategyRule
  index: number
  onUpdate: (ruleId: string, updates: Partial<StrategyRule>) => void
  onUpdateConditions: (ruleId: string, conditions: RuleGroup) => void
}

function RuleCard({
  rule,
  index,
  onUpdate,
  onUpdateConditions
}: RuleCardProps) {
  const issues = validateRules(rule.conditions)
  const actionLabels = ['BUY', 'SELL', 'CANCEL']

  return (
    <div className="border border-border/30 rounded-2xl bg-card/30 overflow-hidden">
      <div className="bg-muted/20 px-6 py-4 border-b border-border/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Badge
              variant="outline"
              className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
            >
              {actionLabels[index]}
            </Badge>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Priority:
              </span>
              <Input
                type="number"
                min={1}
                value={rule.priority}
                onChange={(e) => onUpdate(rule.id, { priority: Number(e.target.value) })}
                className="h-8 w-16 bg-transparent border-transparent hover:bg-muted/30 rounded-lg px-2 text-[10px] font-bold text-center"
              />
            </div>
            {rule.actionType !== 'CANCEL' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Limit:
                </span>
                <Select
                  value={rule.limitPriceType ?? 'market'}
                  onValueChange={(value) =>
                    onUpdate(rule.id, { limitPriceType: value as LimitPriceType })
                  }
                >
                  <SelectTrigger className="h-8 min-w-[140px] bg-transparent border-transparent hover:bg-muted/30 rounded-lg px-2 text-[10px] font-bold uppercase tracking-wider">
                    <SelectValue placeholder="Limit type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/50 bg-card/95 backdrop-blur-md">
                    {LIMIT_PRICE_OPTIONS.map((option) => (
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
                {rule.limitPriceType !== 'market' && (
                  <Input
                    type="number"
                    value={rule.limitPriceValue ?? 0}
                    onChange={(e) => onUpdate(rule.id, { limitPriceValue: Number(e.target.value) })}
                    className="h-8 w-[110px] bg-transparent border-transparent hover:bg-muted/30 rounded-lg px-2 text-[10px] font-bold text-center"
                  />
                )}
              </div>
            )}
          </div>

          <Badge
            variant={issues.length === 0 ? 'secondary' : 'destructive'}
            className={cn(
              'px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest',
              issues.length === 0
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : 'bg-red-500/10 text-red-500 border-red-500/20',
            )}
          >
            {issues.length === 0 ? 'Valid' : `${issues.length} Issues`}
          </Badge>
        </div>
      </div>

      <div className="p-6">
        <GroupEditor
          group={rule.conditions}
          depth={0}
          isRoot
          actionType={rule.actionType}
          onAddRule={(groupId) =>
            onUpdateConditions(rule.id,
              appendNode(rule.conditions, groupId, createRuleCondition())
            )
          }
          onAddGroup={(groupId) =>
            onUpdateConditions(rule.id,
              appendNode(rule.conditions, groupId, createRuleGroup())
            )
          }
          onRemove={(nodeId) =>
            onUpdateConditions(rule.id, removeNode(rule.conditions, nodeId).group)
          }
          onUpdateRule={(ruleId, patch) =>
            onUpdateConditions(rule.id, updateRule(rule.conditions, ruleId, patch))
          }
          onUpdateGroup={(groupId, combinator) =>
            onUpdateConditions(rule.id, updateGroup(rule.conditions, groupId, combinator))
          }
        />
      </div>
    </div>
  )
}

const LIMIT_PRICE_OPTIONS: Array<{ value: LimitPriceType; label: string }> = [
  { value: 'market', label: 'Market' },
  { value: 'offsetPct', label: 'Offset %' },
  { value: 'offsetAbsolute', label: 'Offset Cents' },
  { value: 'absoluteCents', label: 'Absolute Cents' },
]