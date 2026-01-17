import type { Json } from '~/types/supabase'

export type RuleCondition = {
  fact: string
  operator: string
  value: Json
}

export type RuleEvent = {
  type: string
  params: Record<string, Json>
}

export type RuleDefinition = {
  priority: number
  conditions: {
    all: RuleCondition[]
  }
  event: RuleEvent
}

const DEFAULT_RULES: RuleDefinition[] = [
  {
    priority: 5,
    conditions: {
      all: [
        { fact: 'hasPosition', operator: 'equal', value: false },
        { fact: 'volatility', operator: 'lessThan', value: 0.035 },
      ],
    },
    event: {
      type: 'BUY',
      params: {
        sizePct: 1,
      },
    },
  },
  {
    priority: 10,
    conditions: {
      all: [{ fact: 'hasPosition', operator: 'equal', value: true }],
    },
    event: {
      type: 'SELL',
      params: {
        sizePct: 1,
      },
    },
  },
  {
    priority: 20,
    conditions: {
      all: [
        { fact: 'openOrders', operator: 'greaterThan', value: 0 },
        { fact: 'volatility', operator: 'greaterThan', value: 0.05 },
      ],
    },
    event: {
      type: 'CANCEL',
      params: {
        reason: 'High volatility',
      },
    },
  },
]

export type BotPreset = {
  id: 'momentum' | 'swing' | 'random'
  label: string
  strategyName: string
  rules: RuleDefinition[]
}

export const BOT_PRESETS: BotPreset[] = [
  {
    id: 'momentum',
    label: 'Momentum Bot',
    strategyName: 'Momentum',
    rules: DEFAULT_RULES,
  },
  {
    id: 'swing',
    label: 'Swing Bot',
    strategyName: 'Swing',
    rules: DEFAULT_RULES,
  },
  {
    id: 'random',
    label: 'Random Bot',
    strategyName: 'Random',
    rules: DEFAULT_RULES,
  },
]
