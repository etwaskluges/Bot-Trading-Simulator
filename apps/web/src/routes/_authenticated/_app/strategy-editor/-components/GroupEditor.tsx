// components/GroupEditor.tsx
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '~/lib/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/lib/components/ui/select'
import { cn } from '~/lib/utils/cn'
import type { RuleCombinator, RuleCondition, RuleGroup, RuleNode } from '../-utils/types'
import { RuleCard } from '~/routes/_authenticated/_app/strategy-editor/-components/RuleCard'

interface GroupEditorProps {
  group: RuleGroup
  depth: number
  isRoot?: boolean
  actionType?: 'BUY' | 'SELL' | 'CANCEL'
  onAddRule: (groupId: string) => void
  onAddGroup: (groupId: string) => void
  onRemove: (nodeId: string) => void
  onUpdateRule: (ruleId: string, patch: Partial<RuleCondition>) => void
  onUpdateGroup: (groupId: string, combinator: RuleCombinator) => void
}

export function GroupEditor({
  group,
  depth,
  isRoot = false,
  actionType,
  onAddRule,
  onAddGroup,
  onRemove,
  onUpdateRule,
  onUpdateGroup,
}: GroupEditorProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 transition-all duration-300',
        !isRoot && 'border-l border-border/40 pl-8 ml-3 my-4',
      )}
    >
      <div className="rounded-2xl transition-all duration-300">
        <div className="flex flex-wrap items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-6">
            <div
              className={cn(
                'px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border',
                isRoot
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground border-border/50',
              )}
            >
              {isRoot ? 'Main Strategy' : 'Rule Group'}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-50">
                Match
              </span>
              <Select
                value={group.combinator}
                onValueChange={(value) => onUpdateGroup(group.id, value as RuleCombinator)}
              >
                <SelectTrigger className="h-9 w-[110px] bg-muted/20 border-transparent hover:bg-muted/30 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">
                  <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/50 bg-card/95 backdrop-blur-md">
                  <SelectItem value="all" className="text-[10px] font-black uppercase tracking-widest">
                    All (AND)
                  </SelectItem>
                  <SelectItem value="any" className="text-[10px] font-black uppercase tracking-widest">
                    Any (OR)
                  </SelectItem>
                  <SelectItem value="not" className="text-[10px] font-black uppercase tracking-widest">
                    Not (NOT)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {!isRoot && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-all font-bold uppercase tracking-widest text-[9px] opacity-40 hover:opacity-100"
              onClick={() => onRemove(group.id)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Remove Group
            </Button>
          )}
        </div>

        <div className="h-px bg-border/20 my-2" />

        <div className="flex flex-col gap-4 py-4">
          {group.children.map((child) => (
            <RuleNodeRenderer
              key={child.id}
              node={child}
              depth={depth + 1}
              actionType={actionType}
              onAddRule={onAddRule}
              onAddGroup={onAddGroup}
              onRemove={onRemove}
              onUpdateRule={onUpdateRule}
              onUpdateGroup={onUpdateGroup}
            />
          ))}

          {group.children.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-border/30 bg-muted/5">
              <Plus className="h-6 w-6 text-muted-foreground/20 mb-3" />
              <div className="text-muted-foreground text-[10px] font-black uppercase tracking-widest opacity-30">
                Empty Logic Group
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border/10">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddRule(group.id)}
              className="rounded-xl text-primary hover:bg-primary/5 font-black uppercase tracking-widest text-[10px] h-9 px-4 transition-all"
            >
              <Plus className="h-3.5 w-3.5 mr-2" />
              Add Rule
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddGroup(group.id)}
              className="rounded-xl text-muted-foreground hover:bg-muted/10 font-black uppercase tracking-widest text-[10px] h-9 px-4 transition-all"
            >
              <Plus className="h-3.5 w-3.5 mr-2" />
              Add Group
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RuleNodeRenderer(props: {
  node: RuleNode
  depth: number
  actionType?: 'BUY' | 'SELL' | 'CANCEL'
  onAddRule: (groupId: string) => void
  onAddGroup: (groupId: string) => void
  onRemove: (nodeId: string) => void
  onUpdateRule: (ruleId: string, patch: Partial<RuleCondition>) => void
  onUpdateGroup: (groupId: string, combinator: RuleCombinator) => void
}) {
  if (props.node.type === 'rule') {
    return (
      <RuleCard
        rule={props.node}
        onRemove={() => props.onRemove(props.node.id)}
        onUpdate={props.onUpdateRule}
        actionType={props.actionType}
      />
    )
  }

  return (
    <div className="relative group/group-card">
      <GroupEditor
        group={props.node}
        depth={props.depth}
        actionType={props.actionType}
        onAddRule={props.onAddRule}
        onAddGroup={props.onAddGroup}
        onRemove={props.onRemove}
        onUpdateRule={props.onUpdateRule}
        onUpdateGroup={props.onUpdateGroup}
      />
    </div>
  )
}
