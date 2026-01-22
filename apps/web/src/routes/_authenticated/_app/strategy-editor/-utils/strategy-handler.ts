import { DEFAULT_STRATEGY_RULES } from '../-constants'
import { toRulesEngineConditions } from './strategy-rules-conversion'
import type { Json } from '~/types/supabase'
import type { LimitPriceType, StatusType, StrategyAction, StrategyDefinition, StrategyPayload, StrategyRow, StrategyRule } from './types.ts'

// Dependencies type for handler functions
export interface StrategyHandlerDeps {
  // State setters
  setEditorMode: (mode: 'select' | 'create' | 'edit') => void
  setSelectedStrategyId: (id: string | null) => void
  setStrategyName: (name: string) => void
  setStrategyRules: (rules: StrategyRule[]) => void
  setStrategies: React.Dispatch<React.SetStateAction<StrategyRow[]>>
  setStatus: (status: StatusType) => void
  setStatusMessage: (message: string | null) => void

  // State values
  strategyName: string
  strategyRules: StrategyRule[]
  editorMode: 'select' | 'create' | 'edit'
  selectedStrategyId: string | null
  status: StatusType
  isValid: boolean

  // External functions
  upsertStrategyFn: (args: { data: StrategyPayload }) => Promise<{ strategy: StrategyRow }>
  deleteStrategyFn: (args: { data: { id: string } }) => Promise<{ success: boolean }>
}

export function createStrategyHandlers(deps: StrategyHandlerDeps) {
  function handleSelectStrategy(strategy: StrategyDefinition) {
    deps.setEditorMode('edit')
    deps.setSelectedStrategyId(strategy.id)
    deps.setStrategyName(strategy.name)
    deps.setStrategyRules(strategy.rules)
    deps.setStatus('idle')
    deps.setStatusMessage(null)
  }

  function handleCreateStrategy() {
    if (!deps.strategyName.trim()) {
      return
    }
    deps.setEditorMode('create')
    deps.setSelectedStrategyId(null)
    deps.setStrategyRules(DEFAULT_STRATEGY_RULES)
    deps.setStatus('idle')
    deps.setStatusMessage(null)
  }

  function handleReturnToSelection() {
    deps.setEditorMode('select')
  }

  async function handleSaveStrategy() {
    if (deps.status === 'loading') {
      return
    }

    deps.setStatus('loading')
    deps.setStatusMessage(null)

    try {
      if (!deps.strategyName.trim()) {
        throw new Error('Strategy name is required.')
      }

      if (!deps.isValid) {
        throw new Error('Fix rule validation issues before saving.')
      }

      const rulesPayload = deps.strategyRules.map((rule) => ({
        priority: rule.priority,
        conditions: toRulesEngineConditions(rule.conditions) as Json,
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

      const strategyUpsertInput: StrategyPayload = {
        id: deps.editorMode === 'edit' ? deps.selectedStrategyId ?? undefined : undefined,
        name: deps.strategyName.trim(),
        rules: rulesPayload,
      }

      const result = (await deps.upsertStrategyFn({ data: strategyUpsertInput })) as {
        strategy: StrategyRow
      }

      const updatedStrategy = result.strategy
      deps.setStrategies((current) => {
        const existingIndex = current.findIndex((item) => item.id === updatedStrategy.id)
        if (existingIndex === -1) {
          return [...current, updatedStrategy].sort((a, b) => a.name.localeCompare(b.name))
        }
        const next = [...current]
        next[existingIndex] = updatedStrategy
        return next.sort((a, b) => a.name.localeCompare(b.name))
      })
      deps.setSelectedStrategyId(updatedStrategy.id)
      deps.setEditorMode('edit')
      deps.setStatus('success')
      deps.setStatusMessage('Strategy saved.')
    } catch (error) {
      deps.setStatus('error')
      deps.setStatusMessage(
        error instanceof Error ? error.message : 'Failed to save strategy.',
      )
    }
  }

  async function handleDeleteStrategy(strategyId: string) {
    if (!confirm('Are you sure you want to delete this strategy? This action cannot be undone.')) {
      return
    }

    try {
      await deps.deleteStrategyFn({ data: { id: strategyId } })

      // Remove the strategy from local state
      deps.setStrategies((current) => current.filter((strategy) => strategy.id !== strategyId))

      // If the deleted strategy was currently being edited, go back to select mode
      if (deps.selectedStrategyId === strategyId) {
        deps.setEditorMode('select')
        deps.setSelectedStrategyId(null)
        deps.setStrategyName('')
        deps.setStrategyRules([])
      }

      deps.setStatus('success')
      deps.setStatusMessage('Strategy deleted successfully.')
    } catch (error) {
      deps.setStatus('error')
      deps.setStatusMessage(
        error instanceof Error ? error.message : 'Failed to delete strategy.',
      )
    }
  }

  return {
    handleSelectStrategy,
    handleCreateStrategy,
    handleReturnToSelection,
    handleSaveStrategy,
    handleDeleteStrategy,
  }
}