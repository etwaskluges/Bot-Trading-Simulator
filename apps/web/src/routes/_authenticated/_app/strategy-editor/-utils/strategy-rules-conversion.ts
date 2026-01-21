// utils/strategy-helpers.ts
import type {
  EncodedIndicatorFact,
  IndicatorBaseFact,
  MetricValueSource,
  RuleCombinator,
  RuleCondition,
  RuleFact,
  RuleGroup,
  RuleNode,
  RuleOperator,
} from './types'

const VALUE_SOURCES: MetricValueSource[] = [
  'currentPrice',
  'previousPrice',
  'lastMinuteAverage'
]

export const INDICATOR_BASE_FACTS: IndicatorBaseFact[] = [
  'movingAverage',
  'rsi',
  'bollingerUpper',
  'bollingerLower',
  'atr',
  'supertrend',
]

const INDICATOR_DEFAULTS: Record<IndicatorBaseFact, { period: number; multiplier?: number }> = {
  movingAverage: { period: 10 },
  rsi: { period: 14 },
  bollingerUpper: { period: 20, multiplier: 2 },
  bollingerLower: { period: 20, multiplier: 2 },
  atr: { period: 14 },
  supertrend: { period: 10, multiplier: 3 },
}

export function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2, 9)}`
}

export function createRuleCondition(overrides?: Partial<RuleCondition>): RuleCondition {
  return {
    id: createId(),
    type: 'rule',
    fact: '',
    operator: '',
    value: '',
    indicatorPeriod: undefined,
    indicatorMultiplier: undefined,
    ...overrides,
  }
}

export function createRuleGroup(
  children: RuleNode[] = [createRuleCondition()],
  combinator: RuleCombinator = 'all',
): RuleGroup {
  return {
    id: createId(),
    type: 'group',
    combinator,
    children: children.length ? children : [createRuleCondition()],
  }
}

export function updateRule(
  group: RuleGroup,
  ruleId: string,
  patch: Partial<RuleCondition>,
): RuleGroup {
  return {
    ...group,
    children: group.children.map((child) => {
      if (child.type === 'rule' && child.id === ruleId) {
        return { ...child, ...patch }
      }
      if (child.type === 'group') {
        return updateRule(child, ruleId, patch)
      }
      return child
    }),
  }
}

export function updateGroup(
  group: RuleGroup,
  groupId: string,
  combinator: RuleCombinator,
): RuleGroup {
  if (group.id === groupId) {
    return { ...group, combinator }
  }
  return {
    ...group,
    children: group.children.map((child) => {
      if (child.type === 'group') {
        return updateGroup(child, groupId, combinator)
      }
      return child
    }),
  }
}

function findGroupById(group: RuleGroup, groupId: string): RuleGroup | null {
  if (group.id === groupId) {
    return group
  }
  for (const child of group.children) {
    if (child.type === 'group') {
      const found = findGroupById(child, groupId)
      if (found) {
        return found
      }
    }
  }
  return null
}

export function removeNode(group: RuleGroup, nodeId: string): { group: RuleGroup; removed?: RuleNode } {
  let removed: RuleNode | undefined
  const children = group.children.reduce<RuleNode[]>((acc, child) => {
    if (child.id === nodeId) {
      removed = child
      return acc
    }
    if (child.type === 'group') {
      const result = removeNode(child, nodeId)
      if (result.removed) {
        removed = result.removed
      }
      acc.push(result.group)
      return acc
    }
    acc.push(child)
    return acc
  }, [])

  return { group: { ...group, children }, removed }
}

function insertNode(group: RuleGroup, parentId: string, index: number, node: RuleNode): RuleGroup {
  if (group.id === parentId) {
    const nextChildren = [...group.children]
    nextChildren.splice(index, 0, node)
    return { ...group, children: nextChildren }
  }
  return {
    ...group,
    children: group.children.map((child) => {
      if (child.type === 'group') {
        return insertNode(child, parentId, index, node)
      }
      return child
    }),
  }
}

export function appendNode(group: RuleGroup, parentId: string, node: RuleNode): RuleGroup {
  const targetGroup = findGroupById(group, parentId)
  if (!targetGroup) {
    return group
  }
  return insertNode(group, parentId, targetGroup.children.length, node)
}

export function validateRules(group: RuleGroup): string[] {
  const issues: string[] = []

  if (group.children.length === 0) {
    issues.push('A group cannot be empty.')
  }

  for (const child of group.children) {
    if (child.type === 'rule') {
      if (!child.fact || !child.operator) {
        issues.push('Every rule must have a fact and operator.')
        continue
      }

      if (isIndicatorBaseFact(child.fact)) {
        const defaults = INDICATOR_DEFAULTS[child.fact]
        const period = child.indicatorPeriod ?? defaults.period
        if (!Number.isFinite(period) || period <= 0) {
          issues.push('Indicator period must be greater than 0.')
        }
        if (requiresMultiplier(child.fact)) {
          const multiplier = child.indicatorMultiplier ?? defaults.multiplier
          if (!Number.isFinite(multiplier) || (multiplier as number) <= 0) {
            issues.push('Indicator multiplier must be greater than 0.')
          }
        }
      }
      
      // Validate based on operator type
      if (child.operator === 'between' || child.operator === 'notBetween') {
        if (child.valueMin === undefined || child.valueMax === undefined) {
          issues.push(`Range operator "${child.operator}" requires both min and max values.`)
        }
      } else if (child.operator === 'randomChance') {
        if (child.randomProbability === undefined || child.randomProbability < 0 || child.randomProbability > 100) {
          issues.push('Random chance operator requires a probability between 0 and 100.')
        }
      } else {
        // Standard operators need a value
        if (child.value === '') {
          issues.push('Every rule must have a value.')
        }
      }
    } else {
      issues.push(...validateRules(child))
    }
  }

  return issues
}

export function toRulesEngineConditions(group: RuleGroup): Record<string, unknown> {
  const conditions = group.children.map((child) => {
    if (child.type === 'rule') {
      const condition: Record<string, unknown> = {
        fact: normalizeFact(child.fact, child.indicatorPeriod, child.indicatorMultiplier),
        operator: child.operator,
      }
      
      // Handle different operator types
      if (child.operator === 'between' || child.operator === 'notBetween') {
        condition.valueMin = child.valueMin
        condition.valueMax = child.valueMax
      } else if (child.operator === 'randomChance') {
        condition.randomProbability = child.randomProbability
      } else {
        condition.value = child.value
      }
      
      return condition
    }
    return toRulesEngineConditions(child)
  })

  if (group.combinator === 'not') {
    return {
      not: conditions.length > 1 ? { all: conditions } : (conditions[0] || {}),
    }
  }

  return { [group.combinator]: conditions }
}

type RulesEngineConditionPayload = {
  fact?: unknown
  operator?: unknown
  value?: unknown
  valueMin?: unknown
  valueMax?: unknown
  randomProbability?: unknown
  all?: unknown
  any?: unknown
  not?: unknown
}

function isRuleCondition(node: RulesEngineConditionPayload): boolean {
  return typeof node.fact === 'string' && typeof node.operator === 'string' &&
         ('value' in node || 'valueMin' in node || 'valueMax' in node || 'randomProbability' in node)
}

function toRuleCondition(node: RulesEngineConditionPayload): RuleCondition {
  const parsedFact = typeof node.fact === 'string' ? parseIndicatorFact(node.fact) : null
  const fact = parsedFact ? (parsedFact.base as RuleFact) : typeof node.fact === 'string' ? (node.fact as RuleFact) : ''
  const operator =
    typeof node.operator === 'string' ? (node.operator as RuleOperator) : ''
  
  const condition: Partial<RuleCondition> = {
    fact,
    operator,
    indicatorPeriod: parsedFact?.period,
    indicatorMultiplier: parsedFact?.multiplier,
  }
  
  // Handle different operator types
  if (operator === 'between' || operator === 'notBetween') {
    condition.valueMin = typeof node.valueMin === 'number' ? node.valueMin : undefined
    condition.valueMax = typeof node.valueMax === 'number' ? node.valueMax : undefined
    condition.value = ''
  } else if (operator === 'randomChance') {
    condition.randomProbability = typeof node.randomProbability === 'number' ? node.randomProbability : undefined
    condition.value = ''
  } else {
    let value: MetricValueSource | number | EncodedIndicatorFact | '' = ''
    if (typeof node.value === 'number' || typeof node.value === 'string') {
      value = node.value as MetricValueSource | number | EncodedIndicatorFact
    } else if (node.value && typeof node.value === 'object') {
      const valueFact = (node.value as { fact?: unknown }).fact
      if (typeof valueFact === 'string') {
        value = valueFact as EncodedIndicatorFact
      }
    }
    condition.value = VALUE_SOURCES.includes(value as MetricValueSource) ? value : value
  }

  return createRuleCondition(condition)
}

function normalizeFact(
  fact: RuleFact | '',
  period?: number,
  multiplier?: number,
): RuleFact | EncodedIndicatorFact | '' {
  if (!fact || !isIndicatorBaseFact(fact)) {
    return fact
  }
  return buildIndicatorFact(fact, period, multiplier)
}

export function isIndicatorBaseFact(fact: RuleFact | ''): fact is IndicatorBaseFact {
  return !!fact && INDICATOR_BASE_FACTS.includes(fact as IndicatorBaseFact)
}

export function buildIndicatorFact(
  fact: IndicatorBaseFact,
  period?: number,
  multiplier?: number,
): EncodedIndicatorFact {
  const defaults = INDICATOR_DEFAULTS[fact]
  const resolvedPeriod = Number.isFinite(period) && (period as number) > 0 ? (period as number) : defaults.period
  const resolvedMultiplier =
    Number.isFinite(multiplier) && (multiplier as number) > 0 ? (multiplier as number) : defaults.multiplier

  switch (fact) {
    case 'movingAverage':
      return `ma:${resolvedPeriod}` as EncodedIndicatorFact
    case 'rsi':
      return `rsi:${resolvedPeriod}` as EncodedIndicatorFact
    case 'bollingerUpper':
      return `bollingerUpper:${resolvedPeriod}:${resolvedMultiplier ?? defaults.multiplier}` as EncodedIndicatorFact
    case 'bollingerLower':
      return `bollingerLower:${resolvedPeriod}:${resolvedMultiplier ?? defaults.multiplier}` as EncodedIndicatorFact
    case 'atr':
      return `atr:${resolvedPeriod}` as EncodedIndicatorFact
    case 'supertrend':
      return `supertrend:${resolvedPeriod}:${resolvedMultiplier ?? defaults.multiplier}` as EncodedIndicatorFact
  }
}

export function parseIndicatorFact(
  fact: string,
): { base: IndicatorBaseFact; period: number; multiplier?: number } | null {
  const maMatch = /^ma:(\d+)$/.exec(fact)
  if (maMatch) return { base: 'movingAverage', period: Number(maMatch[1]) }

  const rsiMatch = /^rsi:(\d+)$/.exec(fact)
  if (rsiMatch) return { base: 'rsi', period: Number(rsiMatch[1]) }

  const upperMatch = /^bollingerUpper:(\d+):(\d+(?:\.\d+)?)$/.exec(fact)
  if (upperMatch) {
    return { base: 'bollingerUpper', period: Number(upperMatch[1]), multiplier: Number(upperMatch[2]) }
  }

  const lowerMatch = /^bollingerLower:(\d+):(\d+(?:\.\d+)?)$/.exec(fact)
  if (lowerMatch) {
    return { base: 'bollingerLower', period: Number(lowerMatch[1]), multiplier: Number(lowerMatch[2]) }
  }

  const atrMatch = /^atr:(\d+)$/.exec(fact)
  if (atrMatch) return { base: 'atr', period: Number(atrMatch[1]) }

  const superMatch = /^supertrend:(\d+):(\d+(?:\.\d+)?)$/.exec(fact)
  if (superMatch) {
    return { base: 'supertrend', period: Number(superMatch[1]), multiplier: Number(superMatch[2]) }
  }

  return null
}

function requiresMultiplier(fact: IndicatorBaseFact): boolean {
  return fact === 'bollingerUpper' || fact === 'bollingerLower' || fact === 'supertrend'
}

function toRuleGroup(
  combinator: RuleCombinator,
  children: RulesEngineConditionPayload[] = [],
): RuleGroup {
  const parsedChildren = children.map((child) => toRuleNode(child))
  return createRuleGroup(parsedChildren, combinator)
}

function toRuleNode(node: RulesEngineConditionPayload): RuleNode {
  if (isRuleCondition(node)) {
    return toRuleCondition(node)
  }

  if (Array.isArray(node.all)) {
    return toRuleGroup('all', node.all as RulesEngineConditionPayload[])
  }

  if (Array.isArray(node.any)) {
    return toRuleGroup('any', node.any as RulesEngineConditionPayload[])
  }

  if (node.not && typeof node.not === 'object') {
    const payload = node.not as RulesEngineConditionPayload
    if (Array.isArray(payload.all)) {
      return toRuleGroup('not', payload.all as RulesEngineConditionPayload[])
    }
    if (Array.isArray(payload.any)) {
      return toRuleGroup('not', payload.any as RulesEngineConditionPayload[])
    }
    return createRuleGroup([toRuleNode(payload)], 'not')
  }

  return createRuleCondition()
}

export function fromRulesEngineConditions(conditions: unknown): RuleGroup {
  if (!conditions || typeof conditions !== 'object') {
    return createRuleGroup()
  }

  const node = conditions as RulesEngineConditionPayload
  if (Array.isArray(node.all)) {
    return toRuleGroup('all', node.all as RulesEngineConditionPayload[])
  }

  if (Array.isArray(node.any)) {
    return toRuleGroup('any', node.any as RulesEngineConditionPayload[])
  }

  if (node.not && typeof node.not === 'object') {
    return toRuleNode({ not: node.not }) as RuleGroup
  }

  return createRuleGroup()
}
