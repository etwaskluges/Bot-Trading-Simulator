import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import {
  ArrowLeft,
  Clock,
  FileJson,
  Lightbulb,
  PenLine,
  Plus,
  Save,
  Trash2,
  Wrench,
} from 'lucide-react'
import * as React from 'react'

import { Badge } from '~/lib/components/ui/badge'
import { Button } from '~/lib/components/ui/button'
import { Input } from '~/lib/components/ui/input'
import { ScrollArea } from '~/lib/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/lib/components/ui/select'
import { Textarea } from '~/lib/components/ui/textarea'
import { cn } from '~/lib/utils/cn'
import { getSupabaseServerClient } from '~/lib/utils/supabase/server'
import type { Json } from '~/types/supabase'

import { GroupEditor } from './-components/GroupEditor'
import { RuleEditor } from './-components/RuleEditor'
import {
  appendNode,
  createId,
  createRuleCondition,
  createRuleGroup,
  fromRulesEngineConditions,
  removeNode,
  toRulesEngineConditions,
  updateGroup,
  updateRule,
  validateRules,
} from './-utils/strategy-helpers'
import type { LimitPriceType, RuleGroup } from './-utils/strategy-types'

type StrategyAction = 'BUY' | 'SELL' | 'CANCEL'

type StrategyRow = {
  id: string
  user_id: string
  name: string
  rules: {}
}

type StrategyPayload = {
  id?: string
  name: string
  rules: {}
}

type StrategyRule = {
  id: string
  actionType: StrategyAction
  priority: number
  conditions: RuleGroup
  limitPriceType?: LimitPriceType
  limitPriceValue?: number
}

type StrategyDefinition = {
  id: string
  name: string
  updatedAt: string
  rules: StrategyRule[]
}

type RuleEngineRule = {
  priority?: number
  conditions?: unknown
  event?: {
    type?: unknown
    params?: Record<string, unknown>
  }
}

const ACTION_OPTIONS: Array<{ value: StrategyAction; label: string }> = [
  { value: 'BUY', label: 'Buy' },
  { value: 'SELL', label: 'Sell' },
  { value: 'CANCEL', label: 'Cancel Orders' },
]

const loadStrategiesFn = createServerFn({ method: 'GET' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('Unable to determine authenticated user.')
  }

  const { data, error } = await supabase
    .from('strategies')
    .select('*')
    .eq('user_id', user.id)
    .order('name')

  if (error) {
    throw new Error(error.message)
  }

  return { strategies: (data ?? []) as StrategyRow[], userId: user.id }
})

const upsertStrategyFn = createServerFn({ method: 'POST' })
  .validator((data: StrategyPayload) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('Unable to determine authenticated user.')
    }

    if (!data.name?.trim()) {
      throw new Error('Strategy name is required.')
    }

    if (!data.rules) {
      throw new Error('Rules payload is required.')
    }

    const insertPayload: {
      id?: string
      name: string
      rules: Json
      user_id: string
    } = {
      name: data.name.trim(),
      rules: data.rules as Json,
      user_id: user.id,
    }

    if (data.id) {
      insertPayload.id = data.id
    }

    const { data: savedStrategy, error: strategyError } = await supabase
      .from('strategies')
      .upsert(insertPayload, { onConflict: 'id' })
      .select()
      .single()

    if (strategyError) {
      throw new Error(strategyError.message)
    }

    return { strategy: savedStrategy as StrategyRow }
  })

const deleteStrategyFn = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('Unable to determine authenticated user.')
    }

    if (!data.id) {
      throw new Error('Strategy ID is required.')
    }

    const { error } = await supabase
      .from('strategies')
      .delete()
      .eq('id', data.id)
      .eq('user_id', user.id)

    if (error) {
      throw new Error(error.message)
    }

    return { success: true }
  })

type StatusType = 'idle' | 'loading' | 'success' | 'error'

function RouteComponent() {
  const [step, setStep] = React.useState<'select' | 'edit'>('select')
  const [mode, setMode] = React.useState<'create' | 'edit'>('create')
  const [strategyName, setStrategyName] = React.useState('')
  const [strategyRules, setStrategyRules] = React.useState<StrategyRule[]>(() => [
    {
      id: createId(),
      actionType: 'BUY',
      priority: 1,
      conditions: createRuleGroup(),
      limitPriceType: 'market',
      limitPriceValue: 0,
    },
    {
      id: createId(),
      actionType: 'SELL',
      priority: 2,
      conditions: createRuleGroup(),
      limitPriceType: 'market',
      limitPriceValue: 0,
    },
    {
      id: createId(),
      actionType: 'CANCEL',
      priority: 3,
      conditions: createRuleGroup(),
    },
  ])
  const [strategies, setStrategies] = React.useState<StrategyRow[]>([])
  const [selectedStrategyId, setSelectedStrategyId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<StatusType>('idle')
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    const load = async () => {
      try {
        const strategyResult = (await loadStrategiesFn()) as {
          strategies: StrategyRow[]
        }
        setStrategies(strategyResult.strategies)
      } catch (error) {
        setStatus('error')
        setStatusMessage(
          error instanceof Error ? error.message : 'Failed to load strategies.',
        )
      }
    }

    load()
  }, [])

  const strategiesView = React.useMemo<StrategyDefinition[]>(
    () =>
      strategies.map((strategy) => {
        const ruleArray = Array.isArray(strategy.rules) ? strategy.rules : []

        // Always create exactly 3 rules in order: BUY, SELL, CANCEL
        const defaultRules: StrategyRule[] = [
          {
            id: createId(),
            actionType: 'BUY',
            priority: 5,
            conditions: createRuleGroup(),
            limitPriceType: 'market',
            limitPriceValue: 0,
          },
          {
            id: createId(),
            actionType: 'SELL',
            priority: 10,
            conditions: createRuleGroup(),
            limitPriceType: 'market',
            limitPriceValue: 0,
          },
          {
            id: createId(),
            actionType: 'CANCEL',
            priority: 20,
            conditions: createRuleGroup(),
          },
        ]

        // Map existing rules to the correct positions based on their action type
        ruleArray.forEach((rule) => {
          const ruleEngineRule = rule as RuleEngineRule
          const action =
            typeof ruleEngineRule?.event?.type === 'string'
              ? (ruleEngineRule.event.type as StrategyAction)
              : null

          if (action) {
            const ruleIndex = action === 'BUY' ? 0 : action === 'SELL' ? 1 : action === 'CANCEL' ? 2 : -1
            if (ruleIndex >= 0) {
              defaultRules[ruleIndex] = {
                id: createId(),
                actionType: action,
                priority: typeof ruleEngineRule?.priority === 'number' ? ruleEngineRule.priority : defaultRules[ruleIndex].priority,
                conditions: ruleEngineRule?.conditions
                  ? fromRulesEngineConditions(ruleEngineRule.conditions)
                  : createRuleGroup(),
                limitPriceType:
                  typeof ruleEngineRule?.event?.params?.limitPriceType === 'string'
                    ? (ruleEngineRule.event.params.limitPriceType as LimitPriceType)
                    : defaultRules[ruleIndex].limitPriceType,
                limitPriceValue:
                  typeof ruleEngineRule?.event?.params?.limitPriceValue === 'number'
                    ? ruleEngineRule.event.params.limitPriceValue
                    : defaultRules[ruleIndex].limitPriceValue,
              }
            }
          }
        })

        return {
          id: strategy.id,
          name: strategy.name,
          updatedAt: 'Recently',
          rules: defaultRules,
        }
      }),
    [strategies],
  )

  const issues = React.useMemo(() => {
    const allIssues: string[] = []
    strategyRules.forEach((rule) => {
      allIssues.push(...validateRules(rule.conditions))
    })
    return allIssues
  }, [strategyRules])
  const isValid = issues.length === 0

  const rulesPreview = React.useMemo(
    () =>
      JSON.stringify(
        strategyRules.map((rule) => ({
          priority: rule.priority,
          conditions: toRulesEngineConditions(rule.conditions),
          event: {
            type: rule.actionType,
            params:
              rule.actionType === 'CANCEL'
                ? { reason: 'User strategy' }
                : {
                    sizePct: 1,
                    limitPriceType: rule.limitPriceType ?? 'market',
                    limitPriceValue: rule.limitPriceValue ?? 0,
                  },
          },
        })),
        null,
        2,
      ),
    [strategyRules],
  )

  function handleSelectStrategy(strategy: StrategyDefinition) {
    setMode('edit')
    setSelectedStrategyId(strategy.id)
    setStrategyName(strategy.name)
    setStrategyRules(strategy.rules)
    setStatus('idle')
    setStatusMessage(null)
    setStep('edit')
  }

  function handleCreateStrategy() {
    if (!strategyName.trim()) {
      return
    }
    setMode('create')
    setSelectedStrategyId(null)
    setStrategyRules([
      {
        id: createId(),
        actionType: 'BUY',
        priority: 1,
        conditions: createRuleGroup(),
        limitPriceType: 'market',
        limitPriceValue: 0,
      },
      {
        id: createId(),
        actionType: 'SELL',
        priority: 2,
        conditions: createRuleGroup(),
        limitPriceType: 'market',
        limitPriceValue: 0,
      },
      {
        id: createId(),
        actionType: 'CANCEL',
        priority: 3,
        conditions: createRuleGroup(),
      },
    ])
    setStatus('idle')
    setStatusMessage(null)
    setStep('edit')
  }

  function handleBack() {
    setStep('select')
  }

  async function handleSaveStrategy() {
    if (status === 'loading') {
      return
    }

    setStatus('loading')
    setStatusMessage(null)

    try {
      if (!strategyName.trim()) {
        throw new Error('Strategy name is required.')
      }

      if (!isValid) {
        throw new Error('Fix rule validation issues before saving.')
      }

      const rulesPayload = strategyRules.map((rule) => ({
        priority: rule.priority,
        conditions: toRulesEngineConditions(rule.conditions),
        event: {
          type: rule.actionType,
          params:
            rule.actionType === 'CANCEL'
              ? { reason: 'User strategy' }
              : {
                  sizePct: 1,
                  limitPriceType: rule.limitPriceType ?? 'market',
                  limitPriceValue: rule.limitPriceValue ?? 0,
                },
        },
      }))

      const payload: StrategyPayload = {
        id: mode === 'edit' ? selectedStrategyId ?? undefined : undefined,
        name: strategyName.trim(),
        rules: rulesPayload,
      }

      const result = (await upsertStrategyFn({ data: payload })) as {
        strategy: StrategyRow
      }

      const updatedStrategy = result.strategy
      setStrategies((current) => {
        const existingIndex = current.findIndex((item) => item.id === updatedStrategy.id)
        if (existingIndex === -1) {
          return [...current, updatedStrategy].sort((a, b) => a.name.localeCompare(b.name))
        }
        const next = [...current]
        next[existingIndex] = updatedStrategy
        return next.sort((a, b) => a.name.localeCompare(b.name))
      })
      setSelectedStrategyId(updatedStrategy.id)
      setMode('edit')
      setStatus('success')
      setStatusMessage('Strategy saved.')
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to save strategy.',
      )
    }
  }

  async function handleDeleteStrategy(strategyId: string) {
    if (!confirm('Are you sure you want to delete this strategy? This action cannot be undone.')) {
      return
    }

    try {
      await deleteStrategyFn({ data: { id: strategyId } })

      // Remove the strategy from local state
      setStrategies((current) => current.filter((strategy) => strategy.id !== strategyId))

      // If the deleted strategy was currently being edited, go back to select step
      if (selectedStrategyId === strategyId) {
        setStep('select')
        setSelectedStrategyId(null)
        setStrategyName('')
        setStrategyRules([])
      }

      setStatus('success')
      setStatusMessage('Strategy deleted successfully.')
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to delete strategy.',
      )
    }
  }

  return (
    <div className="min-h-screen bg-background p-3 md:p-8 overflow-x-hidden">
      <div className="max-w-[1600px] w-full mx-auto space-y-12">
        {step === 'select' ? (
          <div className="space-y-12">
            <div className="grid gap-6 md:grid-cols-[1fr_1fr] lg:grid-cols-[1fr_1fr] items-start">
              <div className="space-y-8 lg:border-r lg:border-border/50 lg:pr-12">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/5 rounded-full">
                      <PenLine className="h-5 w-5 text-primary" />
                    </div>
                    <h2 className="text-lg font-bold tracking-tight">Create New Strategy</h2>
                  </div>
                  <p className="text-muted-foreground text-sm font-medium">
                    Start from scratch with your own rule set.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
                      Strategy Name
                    </label>
                    <Input
                      value={strategyName}
                      placeholder="e.g. Scalping BTC - aggressive"
                      className="h-12 bg-transparent border-border/50 focus:ring-primary/20 rounded-xl px-4 text-sm font-bold"
                      onChange={(event) => setStrategyName(event.target.value)}
                    />
                  </div>

                  <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10">
                    <div className="text-primary text-[10px] font-black uppercase tracking-widest mb-2">
                      Getting Started
                    </div>
                    <div className="text-muted-foreground text-sm leading-relaxed font-medium">
                      Define conditions like price movements, moving averages, and volume
                      thresholds. You can nest groups for complex AND/OR logic.
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleCreateStrategy}
                    disabled={!strategyName.trim()}
                    className={`relative px-8 py-3 rounded-xl font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-2.5 transition-all duration-300 shadow-lg min-w-[200px] justify-center ${
                      !strategyName.trim()
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] active:scale-95'
                    }`}
                  >
                    <Plus size={16} className="fill-current" />
                    Create new Strategy
                  </Button>
                </div>
              </div>

              <div className="space-y-8">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/5 rounded-full">
                      <Wrench className="h-5 w-5 text-primary" />
                    </div>
                    <h2 className="text-lg font-bold tracking-tight">Edit Existing Strategy</h2>
                  </div>
                  <p className="text-muted-foreground text-sm font-medium">
                    Pick a strategy to review or update.
                  </p>
                </div>

                <ScrollArea className="h-[400px] pr-4">
                  <div className="flex flex-col gap-3">
                    {strategiesView.map((strategy) => (
                      <div
                        key={strategy.id}
                        className="group border-border/30 bg-background/30 hover:bg-muted/30 flex items-center justify-between rounded-2xl border px-5 py-4 transition-all duration-300 cursor-pointer"
                        onClick={() => handleSelectStrategy(strategy)}
                      >
                        <div className="space-y-1">
                          <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                            {strategy.name}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-muted-foreground opacity-50" />
                            <span className="text-muted-foreground text-[9px] font-bold uppercase tracking-wider opacity-60">
                              Updated {strategy.updatedAt}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteStrategy(strategy.id)
                            }}
                            className="h-8 w-8 rounded-full bg-red-500/5 hover:bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <div className="h-8 w-8 rounded-full bg-primary/5 flex items-center justify-center text-primary opacity-0 group-hover:opacity-100 transition-all">
                            <ArrowLeft className="h-4 w-4 rotate-180" />
                          </div>
                        </div>
                      </div>
                    ))}
                    {strategiesView.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">
                        No strategies yet. Create the first one.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-2">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleBack}
                  className="rounded-full border-border/50 hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-all"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-0.5">
                    {mode === 'create' ? 'Configuring New Strategy' : 'Editing Strategy'}
                  </div>
                  <div className="text-2xl font-black tracking-tight uppercase">
                    {strategyName || 'Untitled Strategy'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  className="rounded-xl text-muted-foreground hover:text-foreground font-bold uppercase tracking-widest text-[10px] h-11 px-6"
                >
                  Discard Changes
                </Button>
                <Button
                  disabled={!isValid || !strategyName.trim()}
                  onClick={handleSaveStrategy}
                  className="rounded-xl font-bold uppercase tracking-widest text-[10px] h-11 px-8 transition-all hover:scale-[1.02] active:scale-95 shadow-lg hover:shadow-primary/25"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {status === 'loading' ? 'Saving...' : 'Save Strategy'}
                </Button>
              </div>
            </div>

            {statusMessage && (
              <div
                className={cn(
                  'rounded-2xl px-5 py-4 text-xs font-semibold uppercase tracking-widest',
                  status === 'error'
                    ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                    : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
                )}
              >
                {statusMessage}
              </div>
            )}

            <div className="h-px w-full bg-border/50" />

            <div className="grid gap-6 lg:grid-cols-[1fr]">
              <div className="space-y-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
                      Strategy Name
                    </label>
                    <Input
                      value={strategyName}
                      placeholder="Strategy name"
                      className="h-11 bg-transparent border-border/50 focus:ring-primary/20 rounded-xl px-4 text-sm font-bold"
                      onChange={(event) => setStrategyName(event.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/5 rounded-full">
                      <Wrench className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold tracking-tight">Rules Builder</h2>
                      <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">
                        Drag and drop to nest conditions.
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={isValid ? 'secondary' : 'destructive'}
                    className={cn(
                      'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest',
                      isValid
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-red-500/10 text-red-500 border-red-500/20',
                    )}
                  >
                    {isValid ? 'Ready' : `${issues.length} Issues`}
                  </Badge>
                </div>

                <div className="space-y-6">
                  {!isValid && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
                      <div className="text-red-500 text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        Validation Required
                      </div>
                      <div className="space-y-2">
                        {issues.slice(0, 3).map((issue) => (
                          <div
                            key={issue}
                            className="text-xs text-muted-foreground font-medium flex items-center gap-3"
                          >
                            <div className="h-1 w-1 rounded-full bg-red-500/40" />
                            {issue}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="min-h-[600px]">
                    <ScrollArea className="h-[700px] w-full pr-4">
                      <RuleEditor
                        rules={strategyRules}
                        onUpdateRules={setStrategyRules}
                      />
                    </ScrollArea>
                  </div>
                </div>
              </div>

              <div className="hidden lg:block w-px bg-border/50" />

              <div className="space-y-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/5 rounded-full">
                    <FileJson className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">JSON Preview</h2>
                    <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">
                      Engine-ready output.
                    </p>
                  </div>
                </div>

                <div className="relative group">
                  <div className="absolute top-6 right-6 z-10">
                    <div className="bg-muted/50 backdrop-blur-sm border border-border/50 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full opacity-50 group-hover:opacity-100 transition-opacity">
                      Read Only
                    </div>
                  </div>
                  <Textarea
                    value={rulesPreview}
                    readOnly
                    className="min-h-[644px] bg-muted/20 border-border/30 rounded-3xl font-mono text-[11px] leading-relaxed p-8 focus:ring-0 resize-none shadow-inner"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/_app/strategy-editor/')({
  component: RouteComponent,
})
