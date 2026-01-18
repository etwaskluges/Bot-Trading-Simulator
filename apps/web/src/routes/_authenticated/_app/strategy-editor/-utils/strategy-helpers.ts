// utils/strategy-helpers.ts
import type {
  MetricValueSource,
  RuleCombinator,
  RuleCondition,
  RuleFact,
  RuleGroup,
  RuleNode,
  RuleOperator,
} from './strategy-types'

const VALUE_SOURCES: MetricValueSource[] = [
  'currentPrice',
  'previousPrice',
  'lastMinuteAverage'
]

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
        fact: child.fact,
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

type RawConditionNode = {
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

function isRuleCondition(node: RawConditionNode): boolean {
  return typeof node.fact === 'string' && typeof node.operator === 'string' && 'value' in node
}

function toRuleCondition(node: RawConditionNode): RuleCondition {
  const fact = typeof node.fact === 'string' ? (node.fact as RuleFact) : ''
  const operator =
    typeof node.operator === 'string' ? (node.operator as RuleOperator) : ''
  
  const condition: Partial<RuleCondition> = {
    fact,
    operator,
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
    const value =
      typeof node.value === 'number' || typeof node.value === 'string'
        ? (node.value as MetricValueSource | number)
        : ''
    condition.value = VALUE_SOURCES.includes(value as MetricValueSource) ? value : value
  }

  return createRuleCondition(condition)
}

function toRuleGroup(
  combinator: RuleCombinator,
  children: RawConditionNode[] = [],
): RuleGroup {
  const parsedChildren = children.map((child) => toRuleNode(child))
  return createRuleGroup(parsedChildren, combinator)
}

function toRuleNode(node: RawConditionNode): RuleNode {
  if (isRuleCondition(node)) {
    return toRuleCondition(node)
  }

  if (Array.isArray(node.all)) {
    return toRuleGroup('all', node.all as RawConditionNode[])
  }

  if (Array.isArray(node.any)) {
    return toRuleGroup('any', node.any as RawConditionNode[])
  }

  if (node.not && typeof node.not === 'object') {
    const payload = node.not as RawConditionNode
    if (Array.isArray(payload.all)) {
      return toRuleGroup('not', payload.all as RawConditionNode[])
    }
    if (Array.isArray(payload.any)) {
      return toRuleGroup('not', payload.any as RawConditionNode[])
    }
    return createRuleGroup([toRuleNode(payload)], 'not')
  }

  return createRuleCondition()
}

export function fromRulesEngineConditions(conditions: unknown): RuleGroup {
  if (!conditions || typeof conditions !== 'object') {
    return createRuleGroup()
  }

  const node = conditions as RawConditionNode
  if (Array.isArray(node.all)) {
    return toRuleGroup('all', node.all as RawConditionNode[])
  }

  if (Array.isArray(node.any)) {
    return toRuleGroup('any', node.any as RawConditionNode[])
  }

  if (node.not && typeof node.not === 'object') {
    return toRuleNode({ not: node.not }) as RuleGroup
  }

  return createRuleGroup()
}
