import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  FileJson,
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
import { Textarea } from '~/lib/components/ui/textarea'
import { cn } from '~/lib/utils/cn'
import { getSupabaseServerClient } from '~/lib/utils/supabase/server'
import type { Json } from '~/types/supabase'

import { RuleEditor } from './-components/RuleEditor'
import { DEFAULT_STRATEGY_RULES } from './-constants'
import {
  createId,
  fromRulesEngineConditions,
  toRulesEngineConditions,
  validateRules,
} from './-utils/strategy-rules-conversion'
import type { 
  LimitPriceType, 
  RuleEngineRule, 
  StatusType, 
  StrategyAction, 
  StrategyPayload,
  StrategyRow,
  StrategyRule,
  StrategyDefinition, 
} from './-utils/types.ts'

// @ts-expect-error - TanStack Start createServerFn has deep type instantiation
const loadUserStrategies = createServerFn({ method: 'GET' })
.validator(() => undefined)
.handler(async (): Promise<{ strategies: StrategyRow[]; userId: string }> => {
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

// @ts-expect-error - TanStack Start createServerFn has deep type instantiation
const upsertStrategyFn = createServerFn({ method: 'POST' })
  .validator((data: StrategyPayload) => data)
  .handler(async ({ data }): Promise<{ strategy: StrategyRow }> => {
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

    const insertPayload = prepareStrategyPayload(data, user.id)

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
  .handler(async ({ data }): Promise<{ success: boolean }> => {
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

// ============================================================================
// Utils
// ============================================================================

// Converts the Strategy to right format for Inserting or Updating to DB
const prepareStrategyPayload = (data: StrategyPayload, userId: string): {
  id?: string
  name: string
  rules: Json
  user_id: string
} => {
  const payload = {
    name: data.name.trim(),
    rules: data.rules as Json,
    user_id: userId,
  }

  if (data.id) {
    return { ...payload, id: data.id }
  }

  return payload
}

// Converts UI strategy rules to the rules engine format expected by the backend
const convertRulesToEngineFormat = (rules: StrategyRule[]): Json => {
  return rules.map((rule) => ({
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
  })) as Json
}

// ============================================================================
// Sub-components
// ============================================================================

type StatusMessageProps = {
  status: StatusType
  message: string
}

const StatusMessage = ({ status, message }: StatusMessageProps) => {
  return (
    <div
      className={cn(
        'rounded-2xl px-5 py-4 text-xs font-semibold uppercase tracking-widest',
        status === 'error'
          ? 'bg-red-500/10 text-red-500 border border-red-500/20'
          : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
      )}
    >
      {message}
    </div>
  )
}

type ValidationErrorsProps = {
  issues: string[]
}

const ValidationErrors = ({ issues }: ValidationErrorsProps) => {
  return (
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
  )
}

type CreateStrategyFormProps = {
  strategyName: string
  onStrategyNameChange: (name: string) => void
  onCreateStrategy: () => void
}

const CreateStrategyForm = ({
  strategyName,
  onStrategyNameChange,
  onCreateStrategy,
}: CreateStrategyFormProps) => {
  return (
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
          <label
            htmlFor="create-strategy-name"
            className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1"
          >
            Strategy Name
          </label>
          <Input
            id="create-strategy-name"
            value={strategyName}
            placeholder="e.g. Scalping BTC - aggressive"
            className="h-12 bg-transparent border-border/50 focus:ring-primary/20 rounded-xl px-4 text-sm font-bold"
            onChange={(event) => onStrategyNameChange(event.target.value)}
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
          onClick={onCreateStrategy}
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
  )
}

type StrategyListItemProps = {
  strategy: StrategyDefinition
  onSelect: (strategy: StrategyDefinition) => void
  onDelete: (strategyId: string) => void
}

const StrategyListItem = ({ strategy, onSelect, onDelete }: StrategyListItemProps) => {
  return (
    <button
      type="button"
      className="group border-border/30 bg-background/30 hover:bg-muted/30 flex items-center justify-between rounded-2xl border px-5 py-4 transition-all duration-300 cursor-pointer w-full text-left"
      onClick={() => onSelect(strategy)}
    >
      <div className="space-y-1">
        <div className="font-bold text-foreground group-hover:text-primary transition-colors">
          {strategy.name}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(strategy.id)
          }}
          className="h-8 w-8 rounded-full bg-red-500/5 hover:bg-red-500/10 text-red-500 opacity-70 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="h-8 w-8 rounded-full bg-primary/5 flex items-center justify-center text-primary opacity-70 group-hover:opacity-100 transition-all">
          <ArrowLeft className="h-4 w-4 rotate-180" />
        </div>
      </div>
    </button>
  )
}

type StrategyListProps = {
  strategies: StrategyDefinition[]
  onSelectStrategy: (strategy: StrategyDefinition) => void
  onDeleteStrategy: (strategyId: string) => void
}

const StrategyList = ({ strategies, onSelectStrategy, onDeleteStrategy }: StrategyListProps) => {
  return (
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
          {strategies.map((strategy) => (
            <StrategyListItem
              key={strategy.id}
              strategy={strategy}
              onSelect={onSelectStrategy}
              onDelete={onDeleteStrategy}
            />
          ))}
          {strategies.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">
              No strategies yet. Create the first one.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

type EditorHeaderProps = {
  editorMode: 'create' | 'edit'
  strategyName: string
  isValid: boolean
  isSaving: boolean
  onBack: () => void
  onSave: () => void
}

const EditorHeader = ({
  editorMode,
  strategyName,
  isValid,
  isSaving,
  onBack,
  onSave,
}: EditorHeaderProps) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-2">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={onBack}
          className="rounded-full border-border/50 hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-0.5">
            {editorMode === 'create' ? 'Configuring New Strategy' : 'Editing Strategy'}
          </div>
          <div className="text-2xl font-black tracking-tight uppercase">
            {strategyName || 'Untitled Strategy'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          onClick={onBack}
          className="rounded-xl text-muted-foreground hover:text-foreground font-bold uppercase tracking-widest text-[10px] h-11 px-6"
        >
          Discard Changes
        </Button>
        <Button
          disabled={!isValid || !strategyName.trim()}
          onClick={onSave}
          className="rounded-xl font-bold uppercase tracking-widest text-[10px] h-11 px-8 transition-all hover:scale-[1.02] active:scale-95 shadow-lg hover:shadow-primary/25"
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Strategy'}
        </Button>
      </div>
    </div>
  )
}

type RulesBuilderSectionProps = {
  strategyName: string
  onStrategyNameChange: (name: string) => void
  strategyRules: StrategyRule[]
  onUpdateRules: (rules: StrategyRule[]) => void
  isValid: boolean
  issues: string[]
}

const RulesBuilderSection = ({
  strategyName,
  onStrategyNameChange,
  strategyRules,
  onUpdateRules,
  isValid,
  issues,
}: RulesBuilderSectionProps) => {
  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <label
            htmlFor="edit-strategy-name"
            className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1"
          >
            Strategy Name
          </label>
          <Input
            id="edit-strategy-name"
            value={strategyName}
            placeholder="Strategy name"
            className="h-11 bg-transparent border-border/50 focus:ring-primary/20 rounded-xl px-4 text-sm font-bold"
            onChange={(event) => onStrategyNameChange(event.target.value)}
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
        {!isValid && <ValidationErrors issues={issues} />}

        <div className="min-h-[600px]">
          <ScrollArea className="h-[700px] w-full pr-4">
            <RuleEditor rules={strategyRules} onUpdateRules={onUpdateRules} />
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}

type JsonPreviewSectionProps = {
  jsonPreview: string
}

const JsonPreviewSection = ({ jsonPreview }: JsonPreviewSectionProps) => {
  return (
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
          value={jsonPreview}
          readOnly
          className="min-h-[644px] bg-muted/20 border-border/30 rounded-3xl font-mono text-[11px] leading-relaxed p-8 focus:ring-0 resize-none shadow-inner"
        />
      </div>
    </div>
  )
}

type StrategySelectionViewProps = {
  strategyName: string
  onStrategyNameChange: (name: string) => void
  onCreateStrategy: () => void
  strategies: StrategyDefinition[]
  onSelectStrategy: (strategy: StrategyDefinition) => void
  onDeleteStrategy: (strategyId: string) => void
}

const StrategySelectionView = ({
  strategyName,
  onStrategyNameChange,
  onCreateStrategy,
  strategies,
  onSelectStrategy,
  onDeleteStrategy,
}: StrategySelectionViewProps) => {
  return (
    <div className="space-y-12">
      <div className="grid gap-6 md:grid-cols-[1fr_1fr] lg:grid-cols-[1fr_1fr] items-start">
        <CreateStrategyForm
          strategyName={strategyName}
          onStrategyNameChange={onStrategyNameChange}
          onCreateStrategy={onCreateStrategy}
        />
        <StrategyList
          strategies={strategies}
          onSelectStrategy={onSelectStrategy}
          onDeleteStrategy={onDeleteStrategy}
        />
      </div>
    </div>
  )
}

type StrategyEditorViewProps = {
  editorMode: 'create' | 'edit'
  strategyName: string
  onStrategyNameChange: (name: string) => void
  strategyRules: StrategyRule[]
  onUpdateRules: (rules: StrategyRule[]) => void
  isValid: boolean
  issues: string[]
  status: StatusType
  statusMessage: string | null
  jsonPreview: string
  onBack: () => void
  onSave: () => void
}

const StrategyEditorView = ({
  editorMode,
  strategyName,
  onStrategyNameChange,
  strategyRules,
  onUpdateRules,
  isValid,
  issues,
  status,
  statusMessage,
  jsonPreview,
  onBack,
  onSave,
}: StrategyEditorViewProps) => {
  return (
    <div className="space-y-12">
      <EditorHeader
        editorMode={editorMode}
        strategyName={strategyName}
        isValid={isValid}
        isSaving={status === 'loading'}
        onBack={onBack}
        onSave={onSave}
      />

      {statusMessage && <StatusMessage status={status} message={statusMessage} />}

      <div className="h-px w-full bg-border/50" />

      <div className="grid gap-6 lg:grid-cols-[1fr]">
        <RulesBuilderSection
          strategyName={strategyName}
          onStrategyNameChange={onStrategyNameChange}
          strategyRules={strategyRules}
          onUpdateRules={onUpdateRules}
          isValid={isValid}
          issues={issues}
        />

        <div className="hidden lg:block w-px bg-border/50" />

        <JsonPreviewSection jsonPreview={jsonPreview} />
      </div>
    </div>
  )
}

// ============================================================================
// Hooks
// ============================================================================

const useStrategyConverter = (strategiesFromDB: StrategyRow[]) => {
  return React.useMemo<StrategyDefinition[]>(
    () =>
      strategiesFromDB.map((strategy) => {
        const ruleArray = Array.isArray(strategy.rules) ? strategy.rules : []

        // Start with a copy of the default rules
        const rules: StrategyRule[] = DEFAULT_STRATEGY_RULES.map((rule) => ({
          ...rule,
          id: createId(),
        }))

        // Create a map of existing rules by action type
        const existingRulesMap = new Map<StrategyAction, RuleEngineRule>()
        for (const rule of ruleArray) {
          const ruleEngineRule = rule as RuleEngineRule
          const action = ruleEngineRule?.event?.type as StrategyAction

          if (action && ['BUY', 'SELL', 'CANCEL'].includes(action)) {
            existingRulesMap.set(action, ruleEngineRule)
          }
        }

        // Update rules with existing data where available
        const updatedRules = rules.map((rule) => {
          const existingRule = existingRulesMap.get(rule.actionType)
          if (existingRule) {
            return {
              id: createId(),
              actionType: rule.actionType,
              priority:
                typeof existingRule?.priority === 'number'
                  ? existingRule.priority
                  : rule.priority,
              conditions: existingRule?.conditions
                ? fromRulesEngineConditions(existingRule.conditions)
                : rule.conditions,
              limitPriceType:
                typeof existingRule?.event?.params?.limitPriceType === 'string'
                  ? (existingRule.event.params.limitPriceType as LimitPriceType)
                  : rule.limitPriceType,
              limitPriceValue:
                typeof existingRule?.event?.params?.limitPriceValue === 'number'
                  ? existingRule.event.params.limitPriceValue
                  : rule.limitPriceValue,
            }
          }
          return rule
        })

        return {
          id: strategy.id,
          name: strategy.name,
          rules: updatedRules,
        }
      }),
    [strategiesFromDB],
  )
}

const useJsonPreview = (strategyRules: StrategyRule[]) => {
  return React.useMemo(
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
}

const useValidation = (strategyRules: StrategyRule[]) => {
  const issues = React.useMemo(() => {
    const allIssues: string[] = []
    for (const rule of strategyRules) {
      allIssues.push(...validateRules(rule.conditions))
    }
    return allIssues
  }, [strategyRules])

  return { issues, isValid: issues.length === 0 }
}

// ============================================================================
// State Management
// ============================================================================

type EditorState = {
  mode: 'select' | 'create' | 'edit'
  strategyName: string
  strategyRules: StrategyRule[]
  selectedStrategyId: string | null
}

type EditorAction =
  | { type: 'SELECT_STRATEGY'; strategy: StrategyDefinition }
  | { type: 'CREATE_STRATEGY' }
  | { type: 'RETURN_TO_SELECTION' }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_RULES'; rules: StrategyRule[] }
  | { type: 'SAVE_SUCCESS'; strategyId: string }
  | { type: 'DELETE_SELECTED' }

const initialState: EditorState = {
  mode: 'select',
  strategyName: '',
  strategyRules: DEFAULT_STRATEGY_RULES,
  selectedStrategyId: null,
}

const editorReducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    case 'SELECT_STRATEGY':
      return {
        ...state,
        mode: 'edit',
        selectedStrategyId: action.strategy.id,
        strategyName: action.strategy.name,
        strategyRules: action.strategy.rules,
      }

    case 'CREATE_STRATEGY':
      if (!state.strategyName.trim()) return state
      return {
        ...state,
        mode: 'create',
        selectedStrategyId: null,
        strategyRules: DEFAULT_STRATEGY_RULES,
      }

    case 'RETURN_TO_SELECTION':
      return { ...state, mode: 'select' }

    case 'SET_NAME':
      return { ...state, strategyName: action.name }

    case 'SET_RULES':
      return { ...state, strategyRules: action.rules }

    case 'SAVE_SUCCESS':
      return {
        ...state,
        selectedStrategyId: action.strategyId,
        mode: 'edit',
      }

    case 'DELETE_SELECTED':
      return {
        ...state,
        mode: 'select',
        selectedStrategyId: null,
        strategyName: '',
        strategyRules: [],
      }

    default:
      return state
  }
}

const STRATEGIES_QUERY_KEY = ['strategies'] as const

// ============================================================================
// Main Component
// ============================================================================

const RouteComponent = () => {
  const queryClient = useQueryClient()
  const [state, dispatch] = React.useReducer(editorReducer, initialState)

  // Query for loading strategies
  const {
    data: strategiesData,
    isLoading: isLoadingStrategies,
    error: strategiesError,
  } = useQuery({
    queryKey: STRATEGIES_QUERY_KEY,
    queryFn: async () => {
      // @ts-expect-error - TanStack Start createServerFn has deep type instantiation
      const response = (await loadUserStrategies()) as { strategies: StrategyRow[] }
      return response.strategies
    },
  })

  const strategies = strategiesData ?? []

  // Mutation for saving/updating strategies
  const saveStrategyMutation = useMutation({
    mutationFn: async (payload: StrategyPayload) => {
      // @ts-expect-error - TanStack Start createServerFn has deep type instantiation
      const result = (await upsertStrategyFn({ data: payload })) as { strategy: StrategyRow }
      return result.strategy
    },
    onSuccess: (savedStrategy) => {
      queryClient.setQueryData<StrategyRow[]>(STRATEGIES_QUERY_KEY, (old) => {
        if (!old) return [savedStrategy]
        const existingIndex = old.findIndex((s) => s.id === savedStrategy.id)
        if (existingIndex === -1) {
          return [...old, savedStrategy].sort((a, b) => a.name.localeCompare(b.name))
        }
        return old
          .map((s) => (s.id === savedStrategy.id ? savedStrategy : s))
          .sort((a, b) => a.name.localeCompare(b.name))
      })
      dispatch({ type: 'SAVE_SUCCESS', strategyId: savedStrategy.id })
    },
  })

  // Mutation for deleting strategies
  const deleteStrategyMutation = useMutation({
    mutationFn: async (strategyId: string) => {
      await deleteStrategyFn({ data: { id: strategyId } })
      return strategyId
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData<StrategyRow[]>(STRATEGIES_QUERY_KEY, (old) =>
        old?.filter((s) => s.id !== deletedId) ?? [],
      )
      if (state.selectedStrategyId === deletedId) {
        dispatch({ type: 'DELETE_SELECTED' })
      }
    },
  })

  const convertStrategyToView = useStrategyConverter(strategies)
  const { issues, isValid } = useValidation(state.strategyRules)
  const jsonPreview = useJsonPreview(state.strategyRules)

  // Derive status from mutations
  const isSaving = saveStrategyMutation.isPending

  const { status, statusMessage } = React.useMemo((): { status: StatusType; statusMessage: string | null } => {
    const getErrorMessage = (error: unknown, fallback: string) =>
      error instanceof Error ? error.message : fallback

    if (saveStrategyMutation.isPending) return { status: 'loading', statusMessage: null }
    if (deleteStrategyMutation.isPending) return { status: 'loading', statusMessage: null }
    if (saveStrategyMutation.isSuccess) return { status: 'success', statusMessage: 'Strategy saved.' }
    if (deleteStrategyMutation.isSuccess) return { status: 'success', statusMessage: 'Strategy deleted successfully.' }
    if (saveStrategyMutation.isError) return { status: 'error', statusMessage: getErrorMessage(saveStrategyMutation.error, 'Failed to save strategy.') }
    if (deleteStrategyMutation.isError) return { status: 'error', statusMessage: getErrorMessage(deleteStrategyMutation.error, 'Failed to delete strategy.') }
    if (strategiesError) return { status: 'error', statusMessage: getErrorMessage(strategiesError, 'Failed to load strategies.') }

    return { status: 'idle', statusMessage: null }
  }, [
    saveStrategyMutation.isPending,
    saveStrategyMutation.isSuccess,
    saveStrategyMutation.isError,
    saveStrategyMutation.error,
    deleteStrategyMutation.isPending,
    deleteStrategyMutation.isSuccess,
    deleteStrategyMutation.isError,
    deleteStrategyMutation.error,
    strategiesError,
  ])

  const handleSelectStrategy = (strategy: StrategyDefinition) => {
    saveStrategyMutation.reset()
    deleteStrategyMutation.reset()
    dispatch({ type: 'SELECT_STRATEGY', strategy })
  }

  const handleCreateStrategy = () => {
    saveStrategyMutation.reset()
    deleteStrategyMutation.reset()
    dispatch({ type: 'CREATE_STRATEGY' })
  }

  const handleReturnToSelection = () => {
    saveStrategyMutation.reset()
    deleteStrategyMutation.reset()
    dispatch({ type: 'RETURN_TO_SELECTION' })
  }

  const handleSaveStrategy = () => {
    if (isSaving) return

    if (!state.strategyName.trim()) {
      return
    }

    if (!isValid) {
      return
    }

    const payload: StrategyPayload = {
      id: state.mode === 'edit' ? state.selectedStrategyId ?? undefined : undefined,
      name: state.strategyName.trim(),
      rules: convertRulesToEngineFormat(state.strategyRules),
    }

    saveStrategyMutation.mutate(payload)
  }

  const handleDeleteStrategy = (strategyId: string) => {
    if (!confirm('Are you sure you want to delete this strategy? This action cannot be undone.')) {
      return
    }
    deleteStrategyMutation.mutate(strategyId)
  }

  if (isLoadingStrategies) {
    return (
      <div className="min-h-screen bg-background p-3 md:p-8 flex items-center justify-center">
        <div className="text-muted-foreground">Loading strategies...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-3 md:p-8 overflow-x-hidden">
      <div className="max-w-[1600px] w-full mx-auto space-y-12">
        {state.mode === 'select' && (
          <StrategySelectionView
            strategyName={state.strategyName}
            onStrategyNameChange={(name) => dispatch({ type: 'SET_NAME', name })}
            onCreateStrategy={handleCreateStrategy}
            strategies={convertStrategyToView}
            onSelectStrategy={handleSelectStrategy}
            onDeleteStrategy={handleDeleteStrategy}
          />
        )}
        {state.mode !== 'select' && (
          <StrategyEditorView
            editorMode={state.mode}
            strategyName={state.strategyName}
            onStrategyNameChange={(name) => dispatch({ type: 'SET_NAME', name })}
            strategyRules={state.strategyRules}
            onUpdateRules={(rules) => dispatch({ type: 'SET_RULES', rules })}
            isValid={isValid}
            issues={issues}
            status={status}
            statusMessage={statusMessage}
            jsonPreview={jsonPreview}
            onBack={handleReturnToSelection}
            onSave={handleSaveStrategy}
          />
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/_app/strategy-editor/')({
  component: RouteComponent,
})
