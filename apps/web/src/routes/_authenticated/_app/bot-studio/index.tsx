import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronDown, HandIcon, ChevronUp, Loader2, Play, Plus, Square, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { BOT_LOGIC_SERVER_URL } from '~/lib/config/botLogic'
import { getSupabaseServerClient } from '~/lib/utils/supabase/server'
import { listBotSessionsFn } from '~/lib/server/botSessions'
import { Button } from '~/lib/components/ui/button'
import type { BotSessionSummary } from '~/types/bot-sessions'

type StrategyOption = { id: string, name: string }
type QuickStrategyConfig = { id: string, strategyId: string, count: number }
type BotConfig = { id: string, name: string, strategyId: string, balanceCents: number }
type CreateBotPayload = { name: string, strategyId: string, balanceCents: number }

async function callBotLogic<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BOT_LOGIC_SERVER_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Bot logic request failed')
  }

  return response.json()
}

const fetchUserStrategies = createServerFn({ method: 'GET' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('Unable to determine authenticated user.')
  }

  const { data: strategies, error: strategiesError } = await supabase
    .from('strategies')
    .select('id,name')
    .eq('user_id', user.id)
    .order('name')

  if (strategiesError) {
    throw new Error(strategiesError.message)
  }

  return strategies ?? []
})

const startUserBots = createServerFn({ method: 'POST' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('Unable to determine authenticated user.')
  }

  return callBotLogic('/sessions/owner', {
    method: 'POST',
    body: JSON.stringify({
      ownerId: user.id,
      name: 'User bot session',
    }),
  })
})

const stopUserBots = createServerFn({ method: 'POST' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('Unable to determine authenticated user.')
  }

  return callBotLogic(`/sessions/owner/${user.id}`, {
    method: 'DELETE',
  })
})

const getUserBotCount = createServerFn({ method: 'GET' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('Unable to determine authenticated user.')
  }

  const { data: bots, error } = await supabase
    .from('traders')
    .select('id', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('is_bot', true)

  if (error) {
    throw new Error(error.message)
  }

  return bots?.length ?? 0
})

const createBots = createServerFn({ method: 'POST' })
  .validator((data: { bots: CreateBotPayload[], sharesMin: number, sharesMax: number }) => data)
  .handler(async ({ data }) => {
    const { bots, sharesMin, sharesMax } = data
    if (!bots.length) {
      throw new Error('Add at least one bot before creating.')
    }

    const supabase = getSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('Unable to determine authenticated user.')
    }

    const strategyIds = Array.from(new Set(bots.map((bot) => bot.strategyId).filter(Boolean)))
    if (!strategyIds.length) {
      throw new Error('Select a strategy for each bot.')
    }

    const { data: strategies, error: strategiesError } = await supabase
      .from('strategies')
      .select('id,name')
      .eq('user_id', user.id)
      .in('id', strategyIds)

    if (strategiesError) {
      throw new Error(strategiesError.message)
    }

    const strategiesById = new Map((strategies ?? []).map((strategy) => [strategy.id, strategy]))
    const missingStrategies = strategyIds.filter((id) => !strategiesById.has(id))
    if (missingStrategies.length) {
      throw new Error('Some strategies are missing or no longer available.')
    }

    const { data: existingBots, error: existingBotsError } = await supabase
      .from('traders')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_bot', true)

    if (existingBotsError) {
      throw new Error(existingBotsError.message)
    }

    const oldBotIds = (existingBots ?? []).map((bot) => bot.id)

    const tradersToInsert = bots.map((bot) => ({
      id: globalThis.crypto.randomUUID(),
      name: bot.name,
      is_bot: true,
      strategy: strategiesById.get(bot.strategyId)?.name ?? null,
      strategy_id: bot.strategyId,
      user_id: user.id,
      balance_cents: bot.balanceCents,
    }))

    let createdTraders: Array<{ id: string; name: string; is_bot: boolean; strategy: string | null; strategy_id: string; user_id: string; balance_cents: number }> = []
    if (tradersToInsert.length > 0) {
      const { data, error: insertError } = await supabase
        .from('traders')
        .insert(tradersToInsert)
        .select()
      if (insertError) {
        throw new Error(insertError.message)
      }
      createdTraders = (data ?? []) as typeof createdTraders
    }

    // Create portfolios for new bots
    if (createdTraders.length > 0) {
      const { data: stocks, error: stocksError } = await supabase
        .from('stocks')
        .select('id')

      if (stocksError) {
        throw new Error(stocksError.message)
      }

      const stocksList = stocks ?? []
      if (stocksList.length > 0) {
        const portfolioData = []
        for (const trader of createdTraders) {
          for (const stock of stocksList) {
            const sharesOwned = Math.floor(Math.random() * (sharesMax - sharesMin + 1)) + sharesMin
            portfolioData.push({
              trader_id: trader.id,
              stock_id: stock.id,
              shares_owned: sharesOwned,
            })
          }
        }

        if (portfolioData.length > 0) {
          const { error: portfolioError } = await supabase
            .from('portfolios')
            .insert(portfolioData)
          if (portfolioError) {
            throw new Error(portfolioError.message)
          }
        }
      }
    }

    if (oldBotIds.length) {
      const { error: ordersError } = await supabase
        .from('orders')
        .delete()
        .in('trader_id', oldBotIds)
      if (ordersError) {
        throw new Error(ordersError.message)
      }

      const { error: tradesError } = await supabase
        .from('trades')
        .delete()
        .or(
          `buyer_id.in.(${oldBotIds.join(',')}),seller_id.in.(${oldBotIds.join(',')})`,
        )
      if (tradesError) {
        throw new Error(tradesError.message)
      }

      const { error: portfoliosError } = await supabase
        .from('portfolios')
        .delete()
        .in('trader_id', oldBotIds)
      if (portfoliosError) {
        throw new Error(portfoliosError.message)
      }

      const { error: tradersError } = await supabase
        .from('traders')
        .delete()
        .in('id', oldBotIds)
      if (tradersError) {
        throw new Error(tradersError.message)
      }
    }

    return { success: true, count: tradersToInsert.length }
  })

interface BotCardProps {
  bot: BotConfig
  strategies: StrategyOption[]
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof BotConfig, value: string | number) => void
}

function BotCard({ bot, strategies, onRemove, onUpdate }: BotCardProps) {
  const selectedStrategy = strategies.find((strategy) => strategy.id === bot.strategyId)

  return (
    <div className="p-4 bg-muted/30 hover:bg-muted/50 transition-all relative group flex flex-col gap-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(bot.id)}
        className="absolute top-0 right-2 hover:bg-red-500/10 text-red-500"
        title="Remove Bot"
      >
        <X />
      </Button>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label htmlFor={`bot-name-${bot.id}`} className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-1 block">Name</label>
          <input
            id={`bot-name-${bot.id}`}
            value={bot.name}
            onChange={(e) => onUpdate(bot.id, 'name', e.target.value)}
            className="w-full bg-background border border-border/50 rounded-lg px-3 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-primary/10 outline-none transition-all"
          />
        </div>
        <div>
          <label htmlFor={`bot-strategy-${bot.id}`} className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-1 block">Strategy</label>
          <select
            id={`bot-strategy-${bot.id}`}
            value={bot.strategyId}
            onChange={(e) => onUpdate(bot.id, 'strategyId', e.target.value)}
            className="w-full bg-background border border-border/50 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase outline-none focus:ring-2 focus:ring-primary/10 transition-all"
          >
            <option value="" disabled>
              Select Strategy
            </option>
            {strategies.map((strategy) => (
              <option key={strategy.id} value={strategy.id}>
                {strategy.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[9px] text-muted-foreground/70 uppercase tracking-[0.2em]">
            Strategy: {selectedStrategy?.name ?? 'Unassigned'}
          </p>
        </div>
        <div>
          <label htmlFor={`bot-balance-${bot.id}`} className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-1 block">Cash($)</label>
          <div className="relative">
            <input
              id={`bot-balance-${bot.id}`}
              type="number"
              value={bot.balanceCents / 100}
              onChange={(e) => onUpdate(bot.id, 'balanceCents', Number(e.target.value) * 100)}
              className="w-full bg-background border border-border/50 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono font-bold focus:ring-2 focus:ring-primary/10 outline-none transition-all"
            />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-[10px]">$</span>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ManualBotConfigProps {
  bots: BotConfig[]
  strategies: StrategyOption[]
  isOpen: boolean
  onToggle: () => void
  onAddBot: () => void
  onRemoveBot: (id: string) => void
  onUpdateBot: (id: string, field: keyof BotConfig, value: string | number) => void
}

function ManualBotConfig({ bots, strategies, isOpen, onToggle, onAddBot, onRemoveBot, onUpdateBot }: ManualBotConfigProps) {
  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="ghost"
        className="w-full flex items-center justify-between hover:bg-muted/30 transition-colors py-3"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full transition-colors ${isOpen ? 'bg-primary/5 text-primary' : 'bg-primary/5 text-primary'}`}>
            <HandIcon size={20} />
          </div>
          <h2 className="text-lg font-bold tracking-tight">Manual Bot Config</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-md font-bold">
            {bots.length} UNITS
          </div>
          {isOpen ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </Button>

      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-muted-foreground font-medium italic">Individual Fleet Control</p>
          </div>

          <div>
            {bots.map((bot, index) => (
              <div key={bot.id}>
                <BotCard
                  bot={bot}
                  strategies={strategies}
                  onRemove={onRemoveBot}
                  onUpdate={onUpdateBot}
                />
                {index < bots.length - 1 && (
                  <div className="h-px w-full bg-border/50 my-3" />
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border/10">
            <Button
              variant="outline"
              size="sm"
              onClick={onAddBot}
            >
              <Plus className="h-3.5 w-3.5 mr-2" />
              Add Bot
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface QuickBotConfigFormProps {
  strategies: StrategyOption[]
  quickStrategies: QuickStrategyConfig[]
  strategiesStatus: 'idle' | 'loading' | 'success' | 'error'
  strategiesError: string | null
  initialBalance: number
  sharesMin: number
  sharesMax: number
  syncQuickConfig: boolean
  onQuickStrategyChange: (id: string, field: keyof QuickStrategyConfig, value: string | number) => void
  onAddQuickStrategy: () => void
  onRemoveQuickStrategy: (id: string) => void
  onInitialBalanceChange: (balance: number) => void
  onSharesMinChange: (min: number) => void
  onSharesMaxChange: (max: number) => void
  onSyncToggle: (sync: boolean) => void
}

function QuickBotConfigForm({
  strategies,
  quickStrategies,
  strategiesStatus,
  strategiesError,
  initialBalance,
  sharesMin,
  sharesMax,
  syncQuickConfig,
  onQuickStrategyChange,
  onAddQuickStrategy,
  onRemoveQuickStrategy,
  onInitialBalanceChange,
  onSharesMinChange,
  onSharesMaxChange,
  onSyncToggle
}: QuickBotConfigFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em]">
          Bot Strategies
        </p>

        <div className="space-y-2">
          {strategiesStatus === 'loading' && (
            <p className="text-[10px] text-muted-foreground italic">Loading strategies...</p>
          )}
          {strategiesStatus === 'error' && (
            <p className="text-[10px] text-red-500 italic">{strategiesError ?? 'Failed to load strategies.'}</p>
          )}
          {strategiesStatus === 'success' && strategies.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">No strategies found. Create one in the Strategy Editor.</p>
          )}
          {quickStrategies.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">Add a strategy to start configuring bots.</p>
          )}
          {quickStrategies.map((quickStrategy, index) => (
            <div key={quickStrategy.id}>
              <div className="grid grid-cols-[1fr_80px_auto] gap-2 items-center">
                <select
                  value={quickStrategy.strategyId}
                  onChange={(e) => onQuickStrategyChange(quickStrategy.id, 'strategyId', e.target.value)}
                  className="w-full bg-muted/30 border border-border/50 rounded-xl px-3 py-2 text-[10px] font-semibold uppercase outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="" disabled>
                    Select Strategy
                  </option>
                  {strategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {strategy.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={quickStrategy.count}
                  onChange={(e) => onQuickStrategyChange(quickStrategy.id, 'count', Number(e.target.value))}
                  className="w-full bg-muted/30 border border-border/50 rounded-xl px-3 py-2 font-mono font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveQuickStrategy(quickStrategy.id)}
                  className="hover:bg-red-500/10 text-red-500"
                  title="Remove Strategy"
                >
                  <X />
                </Button>
              </div>
              {index < quickStrategies.length - 1 && (
                <div className="h-px w-full bg-border/50 my-3" />
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border/10">
          <Button
            variant="outline"
            size="sm"
            onClick={onAddQuickStrategy}
            disabled={strategies.length === 0 || strategiesStatus === 'loading'}
          >
            <Plus className="h-3.5 w-3.5 mr-2" />
            Add Strategy
          </Button>
        </div>
      </div>

      <div>
        <label htmlFor="initial-balance" className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-1.5 block">Default Bot Balance($)</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-xs">$</span>
          <input
            id="initial-balance"
            type="number"
            value={initialBalance / 100}
            onChange={(e) => onInitialBalanceChange(Number(e.target.value) * 100)}
            className="w-full bg-muted/30 border border-border/50 rounded-xl pl-8 pr-4 py-2.5 font-mono font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="shares-min" className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-1.5 block">Min Initial Shares</label>
          <input
            id="shares-min"
            type="number"
            value={sharesMin}
            onChange={(e) => onSharesMinChange(Number(e.target.value))}
            className="w-full bg-muted/30 border border-border/50 rounded-xl px-4 py-2.5 font-mono font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
          />
        </div>
        <div>
          <label htmlFor="shares-max" className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-1.5 block">Max Initial Shares</label>
          <input
            id="shares-max"
            type="number"
            value={sharesMax}
            onChange={(e) => onSharesMaxChange(Number(e.target.value))}
            className="w-full bg-muted/30 border border-border/50 rounded-xl px-4 py-2.5 font-mono font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-dashed border-muted-foreground/10">
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={syncQuickConfig}
              onChange={(e) => onSyncToggle(e.target.checked)}
              className="peer sr-only"
            />
            <div className="w-10 h-6 bg-muted rounded-full peer-checked:bg-primary transition-all duration-300" />
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-4 transition-all duration-300 shadow-sm" />
          </div>
          <div>
            <span className="text-xs font-black uppercase tracking-widest block text-primary/80">Sync to Manual Config</span>
            <p className="text-[9px] text-muted-foreground font-medium italic">Automatically update the fleet when quick settings change.</p>
          </div>
        </label>
      </div>
    </div>
  )
}

interface BotConfigPanelProps {
  strategies: StrategyOption[]
  quickStrategies: QuickStrategyConfig[]
  strategiesStatus: 'idle' | 'loading' | 'success' | 'error'
  strategiesError: string | null
  initialBalance: number
  sharesMin: number
  sharesMax: number
  syncQuickConfig: boolean
  bots: BotConfig[]
  isAdvancedOpen: boolean
  botCount: number
  userRunningSessions: BotSessionSummary[]
  isCreatingBots: boolean
  isStartingBots: boolean
  isStoppingBots: boolean
  createStatus: { type: 'success' | 'error', message: string } | null
  botControlStatus: { type: 'success' | 'error', message: string } | null
  onQuickStrategyChange: (id: string, field: keyof QuickStrategyConfig, value: string | number) => void
  onAddQuickStrategy: () => void
  onRemoveQuickStrategy: (id: string) => void
  onInitialBalanceChange: (balance: number) => void
  onSharesMinChange: (min: number) => void
  onSharesMaxChange: (max: number) => void
  onSyncToggle: (sync: boolean) => void
  onAdvancedToggle: () => void
  onAddBot: () => void
  onRemoveBot: (id: string) => void
  onUpdateBot: (id: string, field: keyof BotConfig, value: string | number) => void
  onCreateBots: () => void
  onStartBots: () => void
  onStopBots: () => void
}

function BotConfigPanel({
  strategies,
  quickStrategies,
  strategiesStatus,
  strategiesError,
  initialBalance,
  sharesMin,
  sharesMax,
  syncQuickConfig,
  bots,
  isAdvancedOpen,
  botCount,
  userRunningSessions,
  isCreatingBots,
  isStartingBots,
  isStoppingBots,
  createStatus,
  botControlStatus,
  onQuickStrategyChange,
  onAddQuickStrategy,
  onRemoveQuickStrategy,
  onInitialBalanceChange,
  onSharesMinChange,
  onSharesMaxChange,
  onSyncToggle,
  onAdvancedToggle,
  onAddBot,
  onRemoveBot,
  onUpdateBot,
  onCreateBots,
  onStartBots,
  onStopBots
}: BotConfigPanelProps) {
  const isRunning = userRunningSessions.length > 0

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/5 rounded-full">
          <Bot size={20} className="text-primary" />
        </div>
        <h2 className="text-lg font-bold tracking-tight">Quick Bot Config</h2>
      </div>

      <div className="space-y-8">
        {/* Bot Information and Controls */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-xs font-medium text-foreground">
                  Bots Created: {botCount}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/50'}`} />
                <span className="text-xs font-medium text-foreground">
                  Session Status: {isRunning ? 'Running' : 'Idle'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="default"
              onClick={onCreateBots}
              disabled={isCreatingBots}
            >
              {isCreatingBots ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span className="animate-pulse">Creating Bots...</span>
                </>
              ) : (
                <>
                  <Plus size={16} className="fill-current" />
                  Create Bots
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={onStartBots}
              disabled={isStartingBots}
              className='bg-green-700'
            >
              {isStartingBots ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span className="animate-pulse">Starting Bots...</span>
                </>
              ) : (
                <>
                  <Play size={16} className="fill-current" />
                  Start Bots
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={onStopBots}
              disabled={isStoppingBots}
              className="bg-red-700"
            >
              {isStoppingBots ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span className="animate-pulse">Stopping Bots...</span>
                </>
              ) : (
                <>
                  <Square size={16} className="fill-current" />
                  Stop Bots
                </>
              )}
            </Button>
          </div>

          {(createStatus || botControlStatus) && (
            <div className="flex flex-col gap-2">
              {createStatus && (
                <div className={`text-xs font-bold ${createStatus.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {createStatus.message}
                </div>
              )}
              {botControlStatus && (
                <div className={`text-xs font-bold ${botControlStatus.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {botControlStatus.message}
                </div>
              )}
            </div>
          )}
        </div>

        <QuickBotConfigForm
          strategies={strategies}
          quickStrategies={quickStrategies}
          strategiesStatus={strategiesStatus}
          strategiesError={strategiesError}
          initialBalance={initialBalance}
          sharesMin={sharesMin}
          sharesMax={sharesMax}
          syncQuickConfig={syncQuickConfig}
          onQuickStrategyChange={onQuickStrategyChange}
          onAddQuickStrategy={onAddQuickStrategy}
          onRemoveQuickStrategy={onRemoveQuickStrategy}
          onInitialBalanceChange={onInitialBalanceChange}
          onSharesMinChange={onSharesMinChange}
          onSharesMaxChange={onSharesMaxChange}
          onSyncToggle={onSyncToggle}
        />

        <ManualBotConfig
          bots={bots}
          strategies={strategies}
          isOpen={isAdvancedOpen}
          onToggle={onAdvancedToggle}
          onAddBot={onAddBot}
          onRemoveBot={onRemoveBot}
          onUpdateBot={onUpdateBot}
        />
      </div>
    </div>
  )
}


function BotConfigPage() {
  const queryClient = useQueryClient()
  const { user } = Route.useRouteContext()

  const [strategies, setStrategies] = useState<StrategyOption[]>([])
  const [strategiesStatus, setStrategiesStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [strategiesError, setStrategiesError] = useState<string | null>(null)
  const [quickStrategies, setQuickStrategies] = useState<QuickStrategyConfig[]>([])
  const [initialBalance, setInitialBalance] = useState(100000)
  const [sharesMin, setSharesMin] = useState(50)
  const [sharesMax, setSharesMax] = useState(200)

  const [syncQuickConfig, setSyncQuickConfig] = useState(true)
  const [bots, setBots] = useState<BotConfig[]>([])
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [isCreatingBots, setIsCreatingBots] = useState(false)
  const [createStatus, setCreateStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [isStartingBots, setIsStartingBots] = useState(false)
  const [isStoppingBots, setIsStoppingBots] = useState(false)
  const [botControlStatus, setBotControlStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  const { data: botCount = 0 } = useQuery({
    queryKey: ['user-bot-count'],
    queryFn: () => getUserBotCount(),
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  const { data: botSessions } = useQuery({
    queryKey: ['bot-sessions'],
    queryFn: () => listBotSessionsFn(),
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  // Filter sessions to only show those owned by the current user and are running
  const userRunningSessions = botSessions?.filter(
    session => session.ownerId === user?.id && session.status === 'running'
  ) || []

  useEffect(() => {
    setStrategiesStatus('loading')
    setStrategiesError(null)
    fetchUserStrategies()
      .then((data) => {
        setStrategies(data)
        setStrategiesStatus('success')
      })
      .catch((error: unknown) => {
        console.error('Failed to load strategies', error)
        setStrategiesStatus('error')
        setStrategiesError(error instanceof Error ? error.message : 'Failed to load strategies.')
      })
  }, [])

  useEffect(() => {
    if (quickStrategies.length > 0 || strategies.length === 0) return

    setQuickStrategies([
      {
        id: Math.random().toString(36).slice(2),
        strategyId: strategies[0]?.id ?? '',
        count: 2,
      },
    ])
  }, [quickStrategies.length, strategies])

  useEffect(() => {
    if (!syncQuickConfig) return

    const newBots: BotConfig[] = []
    quickStrategies.forEach((quickStrategy) => {
      if (!quickStrategy.strategyId) return
      const strategy = strategies.find((item) => item.id === quickStrategy.strategyId)
      const count = Math.max(0, quickStrategy.count)
      for (let i = 1; i <= count; i++) {
        newBots.push({
          id: Math.random().toString(36).slice(2),
          name: `${strategy?.name ?? 'Strategy'} Bot ${i}`,
          strategyId: quickStrategy.strategyId,
          balanceCents: initialBalance,
        })
      }
    })
    setBots(newBots)
  }, [quickStrategies, initialBalance, strategies, syncQuickConfig])

  const handleAddQuickStrategy = () => {
    setQuickStrategies([
      ...quickStrategies,
      {
        id: Math.random().toString(36).slice(2),
        strategyId: strategies[0]?.id ?? '',
        count: 1,
      },
    ])
  }

  const handleRemoveQuickStrategy = (id: string) => {
    setQuickStrategies(quickStrategies.filter((item) => item.id !== id))
  }

  const handleQuickStrategyChange = (id: string, field: keyof QuickStrategyConfig, value: string | number) => {
    setQuickStrategies(
      quickStrategies.map((item) => item.id === id ? { ...item, [field]: value } : item),
    )
  }

  const handleAddBot = () => {
    setSyncQuickConfig(false)
    setBots([...bots, {
      id: Math.random().toString(36).slice(2),
      name: 'New Bot',
      strategyId: strategies[0]?.id ?? '',
      balanceCents: initialBalance,
    }])
  }

  const handleRemoveBot = (id: string) => {
    setSyncQuickConfig(false)
    setBots(bots.filter((bot) => bot.id !== id))
  }

  const handleUpdateBot = (id: string, field: keyof BotConfig, value: string | number) => {
    setSyncQuickConfig(false)
    setBots(bots.map((bot) => bot.id === id ? { ...bot, [field]: value } : bot))
  }

  const handleCreateBots = async () => {
    setCreateStatus(null)
    if (bots.length === 0) {
      setCreateStatus({ type: 'error', message: 'Add at least one bot before creating.' })
      return
    }
    if (bots.some((bot) => !bot.strategyId)) {
      setCreateStatus({ type: 'error', message: 'Select a strategy for each bot.' })
      return
    }

    setIsCreatingBots(true)
    try {
      const result = await createBots({
        data: {
          bots: bots.map((bot) => ({
            name: bot.name,
            strategyId: bot.strategyId,
            balanceCents: bot.balanceCents,
          })),
          sharesMin,
          sharesMax,
        },
      })
      setCreateStatus({ type: 'success', message: `Created ${result.count} bots.` })
    } catch (error: unknown) {
      setCreateStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to create bots.',
      })
    } finally {
      setIsCreatingBots(false)
    }
  }

  const handleStartBots = async () => {
    setBotControlStatus(null)
    setIsStartingBots(true)
    try {
      const session = (await startUserBots()) as BotSessionSummary
      setBotControlStatus({ type: 'success', message: `Started bots (${session.name}).` })
      // Invalidate queries to refresh the bot status immediately
      await queryClient.invalidateQueries({ queryKey: ['bot-sessions'] })
      await queryClient.invalidateQueries({ queryKey: ['user-bot-count'] })
    } catch (error: unknown) {
      setBotControlStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to start bots.',
      })
    } finally {
      setIsStartingBots(false)
    }
  }

  const handleStopBots = async () => {
    setBotControlStatus(null)
    setIsStoppingBots(true)
    try {
      const result = await stopUserBots()
      const stoppedResponse = result as { stopped?: unknown[] }
      const stoppedCount = Array.isArray(stoppedResponse.stopped) ? stoppedResponse.stopped.length : 0
      setBotControlStatus({ type: 'success', message: `Stopped ${stoppedCount} bot session(s).` })
      // Invalidate queries to refresh the bot status immediately
      await queryClient.invalidateQueries({ queryKey: ['bot-sessions'] })
      await queryClient.invalidateQueries({ queryKey: ['user-bot-count'] })
    } catch (error: unknown) {
      setBotControlStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to stop bots.',
      })
    } finally {
      setIsStoppingBots(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 overflow-x-hidden">
      <div className="max-w-[1600px] w-full mx-auto space-y-8 md:space-y-12">
        <BotConfigPanel
          strategies={strategies}
          quickStrategies={quickStrategies}
          strategiesStatus={strategiesStatus}
          strategiesError={strategiesError}
          initialBalance={initialBalance}
          sharesMin={sharesMin}
          sharesMax={sharesMax}
          syncQuickConfig={syncQuickConfig}
          bots={bots}
          isAdvancedOpen={isAdvancedOpen}
          botCount={botCount}
          userRunningSessions={userRunningSessions}
          isCreatingBots={isCreatingBots}
          isStartingBots={isStartingBots}
          isStoppingBots={isStoppingBots}
          createStatus={createStatus}
          botControlStatus={botControlStatus}
          onQuickStrategyChange={handleQuickStrategyChange}
          onAddQuickStrategy={handleAddQuickStrategy}
          onRemoveQuickStrategy={handleRemoveQuickStrategy}
          onInitialBalanceChange={setInitialBalance}
          onSharesMinChange={setSharesMin}
          onSharesMaxChange={setSharesMax}
          onSyncToggle={setSyncQuickConfig}
          onAdvancedToggle={() => setIsAdvancedOpen(!isAdvancedOpen)}
          onAddBot={handleAddBot}
          onRemoveBot={handleRemoveBot}
          onUpdateBot={handleUpdateBot}
          onCreateBots={handleCreateBots}
          onStartBots={handleStartBots}
          onStopBots={handleStopBots}
        />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/_app/bot-studio/')({
  beforeLoad: ({ context }) => {
    return {
      user: context.user,
    }
  },
  component: BotConfigPage,
})
