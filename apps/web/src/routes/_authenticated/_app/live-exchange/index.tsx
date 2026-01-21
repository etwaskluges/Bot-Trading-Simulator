import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useMutation, useQuery } from '@tanstack/react-query'
import { postgres_db, schema } from '@vibe-coding-boilerplate/db-drizzle'
import { desc, eq, and, sql } from 'drizzle-orm'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { ArrowUp, ArrowDown, TrendingUp, Bot, Activity, Clock, Database, ArrowRight, LayoutGrid, List, Search, AlertTriangle } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '~/lib/components/ui/button'
import { DataTable } from '~/lib/components/ui/data-table'
import type { ColumnDef } from '@tanstack/react-table'
import {
  listBotSessionsFn,
  startBotSessionFn,
  stopBotSessionFn,
} from '~/lib/server/botSessions'
import type { BotSessionSummary } from '~/types/bot-sessions'

type Timespan = '5m' | '10m' | '1h' | '1d';

const timespanOptions: { value: Timespan; label: string; ms: number }[] = [
  { value: '5m', label: '5m', ms: 5 * 60 * 1000 },
  { value: '10m', label: '10m', ms: 10 * 60 * 1000 },
  { value: '1h', label: '1H', ms: 60 * 60 * 1000 },
  { value: '1d', label: '1D', ms: 24 * 60 * 60 * 1000 },
];

const DEFAULT_RULE_SET = [
  {
    priority: 5,
    conditions: {
      all: [
        { fact: "isPriceDown", operator: "equal", value: true },
        { fact: "hasPosition", operator: "equal", value: false },
      ],
    },
    event: {
      type: "BUY",
    },
  },
  {
    priority: 10,
    conditions: {
      all: [
        { fact: "isPriceUp", operator: "equal", value: true },
        { fact: "hasPosition", operator: "equal", value: true },
      ],
    },
    event: {
      type: "SELL",
    },
  },
];

const DEFAULT_RULE_JSON = JSON.stringify(DEFAULT_RULE_SET, null, 2);

// 1. SERVER FUNCTION: Get all stocks (for dropdown)
const getAllStocks = createServerFn({ method: 'GET' }).handler(async () => {
  const stocks = await postgres_db
    .select()
    .from(schema.stocks)
    .orderBy(schema.stocks.symbol)

  return stocks
})

// 2. SERVER FUNCTION: Get market data for a specific stock
const getMarketData = createServerFn({ method: 'GET' })
  .validator((data: { symbol: string, timespan: Timespan }) => data)
  .handler(async ({ data }) => {
    const { symbol, timespan } = data

    // A. Get Stock Info
    const stocks = await postgres_db
      .select()
      .from(schema.stocks)
      .where(eq(schema.stocks.symbol, symbol))
      .limit(1)

    if (!stocks.length) return null
    const stock = stocks[0]

    let intervalValue;
    let bucketSql;
    switch (timespan) {
      case '5m':
        intervalValue = sql`now() - interval '5 minutes'`;
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 2) * 2)`; // 2s buckets
        break;
      case '10m':
        intervalValue = sql`now() - interval '10 minutes'`;
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 4) * 4)`; // 4s buckets
        break;
      case '1h':
        intervalValue = sql`now() - interval '1 hour'`;
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 25) * 25)`; // 25s buckets
        break;
      case '1d':
        intervalValue = sql`now() - interval '1 day'`;
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 600) * 600)`; // 10m buckets
        break;
      default:
        intervalValue = sql`now() - interval '5 minutes'`;
        bucketSql = null;
        break;
    }

    // B. Get Recent Trades (For Chart)
    const trades = bucketSql
      ? await postgres_db
        .select({
          executed_at: sql<string>`${bucketSql}`.as('executed_at'),
          execution_price_cents: sql<string>`avg(${schema.trades.execution_price_cents})`.as('execution_price_cents'),
        })
        .from(schema.trades)
        .where(and(
          eq(schema.trades.stock_id, stock.id),
          sql`${schema.trades.executed_at} >= ${intervalValue}`
        ))
        .groupBy(sql`1`)
        .orderBy(sql`1 desc`)
        .limit(1000)
      : await postgres_db
        .select()
        .from(schema.trades)
        .where(and(
          eq(schema.trades.stock_id, stock.id),
          sql`${schema.trades.executed_at} >= ${intervalValue}`
        ))
        .orderBy(desc(schema.trades.executed_at))
        .limit(1000)

    // C. Get Open Orders (Order Book)
    const orders = await postgres_db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.stock_id, stock.id),
          eq(schema.orders.status, 'OPEN')
        )
      )
      .orderBy(desc(schema.orders.created_at))

    // D. Get Bot Portfolios for this stock
    const botPortfolios = await postgres_db
      .select({
        trader_id: schema.traders.id,
        trader_name: schema.traders.name,
        strategy: schema.traders.strategy,
        balance_cents: schema.traders.balance_cents,
        shares_owned: schema.portfolios.shares_owned,
        user_id: schema.traders.user_id,
      })
      .from(schema.traders)
      .innerJoin(schema.portfolios, eq(schema.traders.id, schema.portfolios.trader_id))
      .where(
        and(
          eq(schema.traders.is_bot, true),
          eq(schema.portfolios.stock_id, stock.id)
        )
      )

    // Sort numerically (Bot 1, Bot 2 ... Bot 10) instead of alphabetically
    botPortfolios.sort((a, b) =>
      (a.trader_name || '').localeCompare(b.trader_name || '', undefined, { numeric: true, sensitivity: 'base' })
    )

    // E. Get recent bot orders for this stock
    const recentBotOrders = await postgres_db
      .select({
        trader_id: schema.orders.trader_id,
        type: schema.orders.type,
        quantity: schema.orders.quantity,
        limit_price_cents: schema.orders.limit_price_cents,
        status: schema.orders.status,
      })
      .from(schema.orders)
      .innerJoin(schema.traders, eq(schema.orders.trader_id, schema.traders.id))
      .where(
        and(
          eq(schema.orders.stock_id, stock.id),
          eq(schema.traders.is_bot, true)
        )
      )
      .orderBy(desc(schema.orders.created_at))
      .limit(50)

    return {
      stock,
      trades: trades.reverse(),
      orders,
      botPortfolios,
      recentBotOrders
    }
  })

// 3. SUBCOMPONENTS

const LoadingState = ({ message }: { message: string }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50/50 dark:bg-slate-950/50">
    <Activity className="h-10 w-10 text-primary animate-spin" />
    <p className="font-bold text-lg uppercase opacity-50">{message}</p>
  </div>
)

const EmptyState = () => (
  <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50/50 dark:bg-slate-950/50">
    <div className="max-w-md w-full bg-card p-10 rounded-[2.5rem] border shadow-2xl text-center space-y-8 relative overflow-hidden">
      <div className="absolute -top-12 -right-12 p-8 opacity-[0.03] rotate-12">
        <TrendingUp size={200} />
      </div>

      <div className="relative z-10 space-y-6">
        <div className="bg-primary/10 p-5 rounded-3xl w-fit mx-auto group-hover:scale-110 transition-transform duration-500">
          <TrendingUp className="h-10 w-10 text-primary" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Exchange Offline</h2>
          <p className="text-muted-foreground font-medium text-sm leading-relaxed">
            The market is currently closed. A moderator needs to initialize the asset catalog before you can access the live exchange.
          </p>
          <p className="text-muted-foreground font-medium text-xs leading-relaxed mt-2">
            Visit the <Link to="/market-config" className="text-primary hover:underline">Market Configuration</Link> page to seed the database with stocks.
          </p>
        </div>
      </div>
    </div>
  </div>
)

const OrderBook = ({ bidOrders, askOrders, maxBidQty, maxAskQty }: {
  bidOrders: any[]
  askOrders: any[]
  maxBidQty: number
  maxAskQty: number
}) => (
  <div className="h-[350px] flex flex-col">
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/5 rounded-full">
          <Clock size={20} className="text-primary" />
        </div>
        <h2 className="text-lg font-bold tracking-tight">Order Book</h2>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Live</span>
      </div>
    </div>

    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="grid grid-cols-2 gap-2 md:gap-8 text-[10px] font-bold text-muted-foreground uppercase tracking-widest pb-4 border-b border-border/50 mb-4">
        <div className="flex justify-between px-2">
          <span>Bid Vol</span>
          <span>Bid Price</span>
        </div>
        <div className="flex justify-between px-2">
          <span>Ask Price</span>
          <span>Ask Vol</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
        <div className="grid grid-cols-2 gap-2 md:gap-8 relative py-2">
          <div className="flex flex-col gap-1.5">
            {bidOrders.map((order: any) => (
              <div key={order.id} className="relative flex items-center justify-between py-1 px-2 text-sm font-mono group">
                <div
                  className="absolute top-0 bottom-0 right-0 bg-emerald-500/5 transition-all duration-300 rounded-sm"
                  style={{ width: `${(order.quantity / maxBidQty) * 100}%` }}
                />
                <span className="relative z-10 text-muted-foreground text-xs font-medium">{order.quantity}</span>
                <span className="relative z-10 text-emerald-600 dark:text-emerald-400 font-bold">${(Number(order.limit_price_cents) / 100).toFixed(2)}</span>
              </div>
            ))}
            {bidOrders.length === 0 && (
              <div className="text-center py-10 text-xs text-muted-foreground font-medium italic opacity-50">Empty Bids</div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            {askOrders.map((order: any) => (
              <div key={order.id} className="relative flex items-center justify-between py-1 px-2 text-sm font-mono group">
                <div
                  className="absolute top-0 bottom-0 left-0 bg-red-500/5 transition-all duration-300 rounded-sm"
                  style={{ width: `${(order.quantity / maxAskQty) * 100}%` }}
                />
                <span className="relative z-10 text-red-600 dark:text-red-400 font-bold">${(Number(order.limit_price_cents) / 100).toFixed(2)}</span>
                <span className="relative z-10 text-muted-foreground text-xs font-medium">{order.quantity}</span>
              </div>
            ))}
            {askOrders.length === 0 && (
              <div className="text-center py-10 text-xs text-muted-foreground font-medium italic opacity-50">Empty Asks</div>
            )}
          </div>

          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border/30 -translate-x-1/2" />
        </div>
      </div>
    </div>
  </div>
)

const StockSelector = ({
  selectedSymbol,
  setSelectedSymbol,
  allStocks,
  isStockDropdownOpen,
  setIsStockDropdownOpen
}: {
  selectedSymbol: string | null
  setSelectedSymbol: (symbol: string) => void
  allStocks: any[]
  isStockDropdownOpen: boolean
  setIsStockDropdownOpen: (open: boolean) => void
}) => (
  <div className="relative z-30 w-full sm:w-auto">
    <Button
      type="button"
      variant="ghost"
      className={`
        flex items-center justify-between sm:justify-start w-full sm:w-auto gap-3 pl-4 pr-2 py-1.5 rounded-lg border transition-all group outline-none
        ${isStockDropdownOpen
          ? 'bg-card border-primary ring-4 ring-primary/10 shadow-lg'
          : 'bg-card/50 hover:bg-card border-border hover:border-primary/50 hover:shadow-md'
        }
      `}
      onClick={() => setIsStockDropdownOpen(!isStockDropdownOpen)}
    >
      <div className="flex flex-col items-start gap-0.5 mr-2">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider leading-none">
          Select Asset
        </span>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-foreground tracking-tight leading-none group-hover:text-primary transition-colors">
            {selectedSymbol}
          </span>
          {selectedSymbol && (
            <span className="text-muted-foreground font-medium text-[10px] truncate max-w-[100px] hidden sm:block leading-none">
              {allStocks.find((s: any) => s.symbol === selectedSymbol)?.name}
            </span>
          )}
        </div>
      </div>

      <div className={`
        h-8 w-8 rounded-md flex items-center justify-center transition-all duration-300
        ${isStockDropdownOpen ? 'bg-primary text-primary-foreground rotate-180' : 'bg-muted/50 group-hover:bg-primary/10 text-muted-foreground group-hover:text-primary'}
      `}>
        <ArrowDown size={14} strokeWidth={3} />
      </div>
    </Button>

    {isStockDropdownOpen && (
      <>
        <div
          className="fixed inset-0 z-30"
          onClick={() => setIsStockDropdownOpen(false)}
        />
        <div className="absolute top-full left-0 mt-2 w-full sm:w-[300px] max-h-[400px] overflow-y-auto bg-card/95 backdrop-blur-2xl border border-border/50 rounded-lg shadow-2xl z-40 py-2 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 flex items-center justify-between border-b border-border/50 mb-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Available Assets
            </span>
            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {allStocks.length}
            </span>
          </div>
          {allStocks.map((stock: any) => (
            <Button
              key={stock.symbol}
              type="button"
              variant="ghost"
              className={`group w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-all border-l-2 ${selectedSymbol === stock.symbol
                ? 'bg-primary/5 border-primary pl-5'
                : 'border-transparent'
                }`}
              onClick={() => {
                setSelectedSymbol(stock.symbol);
                setIsStockDropdownOpen(false);
              }}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-sm ${selectedSymbol === stock.symbol ? 'text-primary' : 'text-foreground'}`}>
                    {stock.symbol}
                  </span>
                  {selectedSymbol === stock.symbol && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground font-medium truncate pr-2 group-hover:text-foreground transition-colors">
                  {stock.name}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono text-xs font-bold block text-foreground">
                  ${(Number(stock.current_price_cents) / 100).toFixed(2)}
                </span>
                <span className={`text-[10px] font-medium ${Math.random() > 0.5 ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                  {Math.random() > 0.5 ? '+' : '-'}{(Math.random() * 2).toFixed(2)}%
                </span>
              </div>
            </Button>
          ))}
        </div>
      </>
    )}
  </div>
)

const TimespanPicker = ({
  timespan,
  setTimespan,
  isMobile = false
}: {
  timespan: Timespan
  setTimespan: (timespan: Timespan) => void
  isMobile?: boolean
}) => {
  if (isMobile) {
    return (
      <div className="flex sm:hidden items-center justify-between gap-1 bg-muted/20 p-1 rounded-lg">
        {timespanOptions.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            variant="ghost"
            className={`flex-1 px-2 py-1.5 text-[10px] font-bold rounded-md transition-all text-center ${timespan === opt.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background/50'
              }`}
            onClick={() => setTimespan(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    )
  }

  return (
    <div className="hidden sm:flex flex-col justify-center gap-2 border-border/50 pl-6">
      {timespanOptions.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          variant="ghost"
          className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all text-center min-w-[50px] ${timespan === opt.value
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted/50'
            }`}
          onClick={() => setTimespan(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  )
}

const BotFleetControls = ({
  filteredBotsCount,
  filterText,
  setFilterText,
  showOtherUsersBots,
  setShowOtherUsersBots,
  viewMode,
  setViewMode
}: {
  filteredBotsCount: number
  filterText: string
  setFilterText: (text: string) => void
  showOtherUsersBots: boolean
  setShowOtherUsersBots: (show: boolean) => void
  viewMode: 'grid' | 'list'
  setViewMode: (mode: 'grid' | 'list') => void
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      <div className="p-2 bg-primary/5 rounded-full">
        <Bot size={20} className="text-primary" />
      </div>
      <h2 className="text-lg font-bold tracking-tight">Active Bot Fleet</h2>
      <span className="px-2.5 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{filteredBotsCount} BOTS</span>
    </div>

    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="show-other-users-bots"
          checked={showOtherUsersBots}
          onChange={(e) => setShowOtherUsersBots(e.target.checked)}
          className="h-3 w-3 rounded border-border/50 text-primary focus:ring-primary/10 focus:ring-2"
        />
        <label
          htmlFor="show-other-users-bots"
          className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer select-none"
        >
          Show bots from other users
        </label>
      </div>

      <div className="relative group">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
        <input
          type="text"
          placeholder="Search Bot..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="pl-9 pr-4 py-1.5 text-sm bg-background border border-border/50 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary w-[200px] transition-all"
        />
      </div>

      <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border/50">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setViewMode('grid')}
        >
          <LayoutGrid size={14} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setViewMode('list')}
        >
          <List size={14} />
        </Button>
      </div>
    </div>
  </div>
)

const BotGridView = ({
  filteredBots,
  getBotLastAction,
  stockSymbol,
  currentUserId
}: {
  filteredBots: any[]
  getBotLastAction: (traderId: string) => any
  stockSymbol: string
  currentUserId?: string
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-px bg-border/30">
    {filteredBots.map((bot: any) => {
      const lastAction = getBotLastAction(bot.trader_id)
      const isOtherUser = currentUserId && bot.user_id !== currentUserId
      return (
        <div key={bot.trader_id} className={`group relative p-6 transition-colors flex flex-col justify-between h-full ${isOtherUser ? 'bg-blue-50/30 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/50' : 'bg-background hover:bg-muted/5'}`}>
          
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {isOtherUser && (
                    <div className="px-2 py-0.5 bg-blue-500 text-white text-[8px] font-bold uppercase tracking-wider rounded-full w-fit">
                      Other
                    </div>
                  )}
                </div>
                <h3 className={`font-bold text-sm transition-colors ${isOtherUser ? 'text-blue-700 dark:text-blue-300' : 'text-foreground group-hover:text-primary'}`}>
                  {bot.trader_name}
                </h3>
                <p className="text-[10px] text-muted-foreground font-medium uppercase mt-0.5">{bot.strategy} Strategy</p>
              </div>
              <div className={`h-2 w-2 rounded-full ${lastAction ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
            </div>

            <div className="flex items-end justify-between font-mono text-sm border-b border-border/30 pb-3">
              <div className="flex flex-col">
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Balance</span>
                <span>${(Number(bot.balance_cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Holdings</span>
                <span className="font-bold">{bot.shares_owned}<span className="text-[9px] font-sans text-muted-foreground ml-1">{stockSymbol}</span></span>
              </div>
            </div>

            <div>
              <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-2">Last Activity</span>
              {lastAction ? (
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-bold flex items-center gap-1.5 ${lastAction.type === 'BUY' ? 'text-emerald-500' : 'text-red-500'
                    }`}>
                    {lastAction.type === 'BUY' ? <ArrowUp size={12} strokeWidth={3} /> : <ArrowDown size={12} strokeWidth={3} />}
                    {lastAction.type}
                  </span>
                  <span className="font-mono">{lastAction.quantity} @ ${lastAction.price.toFixed(2)}</span>
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground italic flex items-center gap-1.5">
                  <Clock size={10} /> Waiting...
                </div>
              )}
            </div>
          </div>
        </div>
      )
    })}
  </div>
)

const BotListView = ({
  filteredBots,
  getBotLastAction,
  stockSymbol,
  currentUserId
}: {
  filteredBots: any[]
  getBotLastAction: (traderId: string) => any
  stockSymbol: string
  currentUserId?: string
}) => {
  // Define columns for DataTable
  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      accessorKey: 'trader_name',
      header: 'Bot Name',
      cell: ({ row }) => {
        const isOtherUser = currentUserId && row.original.user_id !== currentUserId
        return (
          <div className="flex items-center gap-2">
            {isOtherUser && (
              <div className="px-1.5 py-0.5 bg-blue-500 text-white text-[8px] font-bold uppercase tracking-wider rounded-full">
                Other
              </div>
            )}
            <span className={`font-bold ${isOtherUser ? 'text-blue-700 dark:text-blue-300' : ''}`}>
              {row.original.trader_name}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'strategy',
      header: 'Strategy',
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold bg-primary/5 text-primary uppercase tracking-wide border border-primary/10">
          {row.original.strategy}
        </span>
      ),
    },
    {
      accessorKey: 'balance_cents',
      header: () => <div className="text-right">Cash Balance</div>,
      cell: ({ row }) => (
        <div className="font-mono text-right whitespace-nowrap">
          <span className="opacity-70 text-xs mr-0.5">$</span>
          {(Number(row.original.balance_cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
      ),
    },
    {
      accessorKey: 'shares_owned',
      header: () => <div className="text-right">Holdings</div>,
      cell: ({ row }) => (
        <div className="font-mono text-right whitespace-nowrap">
          {row.original.shares_owned} <span className="text-muted-foreground text-[10px] ml-1">{stockSymbol}</span>
        </div>
      ),
    },
    {
      id: 'last_activity',
      header: 'Last Activity',
      cell: ({ row }) => {
        const lastAction = getBotLastAction(row.original.trader_id)
        return lastAction ? (
          <div className="flex items-center gap-3">
            <div className={`
              flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider
              ${lastAction.type === 'BUY'
                ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/20'
                : 'bg-red-500/5 text-red-500 border-red-500/20'
              }
            `}>
              {lastAction.type === 'BUY' ? <ArrowUp size={10} strokeWidth={4} /> : <ArrowDown size={10} strokeWidth={4} />}
              {lastAction.type}
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              <span className="text-foreground font-medium">{lastAction.quantity}</span> @ ${lastAction.price.toFixed(2)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground/50 text-[10px] uppercase font-bold tracking-wider">
            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
            Idle
          </div>
        )
      },
    },
  ], [stockSymbol, getBotLastAction, currentUserId])

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm">
      <DataTable
        data={filteredBots}
        columns={columns}
        showSelectColumn={false}
        pageSize={50}
        emptyState={{
          title: 'No Bots Found',
          subtitle: 'Try adjusting your search filters'
        }}
      />
    </div>
  )
}

// 4. PAGE COMPONENT
const BoersePage = () => {
  const { user } = Route.useRouteContext()
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [timespan, setTimespan] = useState<Timespan>('5m')
  // View mode for bot fleet
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [filterText, setFilterText] = useState('')
  const [isStockDropdownOpen, setIsStockDropdownOpen] = useState(false)
  const [showOtherUsersBots, setShowOtherUsersBots] = useState(false)
  const [userLoaded, setUserLoaded] = useState(false)
  const [ruleJson, setRuleJson] = useState(DEFAULT_RULE_JSON)
  const [sessionLabel, setSessionLabel] = useState("Live session")
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)



  // Real-time tick for chart updates
  const [currentTick, setCurrentTick] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTick(Date.now()), 2000)
    return () => clearInterval(timer)
  }, [])

  // Track when user context is loaded
  useEffect(() => {
    if (user?.id && !userLoaded) {
      setUserLoaded(true)
    }
  }, [user?.id, userLoaded])

  const {
    data: botSessions,
    isLoading: isSessionsLoading,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: ['bot-sessions'],
    queryFn: () => listBotSessionsFn(),
    refetchInterval: 5000,
    enabled: true,
  })

  const startSessionMutation = useMutation({
    mutationFn: startBotSessionFn,
    onSuccess: (session) => {
      toast.success(`Session ${session.name} started`)
      setActiveSessionId(session.id)
      void refetchSessions()
    },
    onError: (error: any) => {
      toast.error(`Failed to start session: ${error?.message ?? 'Unknown error'}`)
    },
  })

  const stopSessionMutation = useMutation({
    mutationFn: stopBotSessionFn,
    onSuccess: (session) => {
      toast.success(`Session ${session.name} stopped`)
      if (session.id === activeSessionId) {
        setActiveSessionId(null)
      }
      void refetchSessions()
    },
    onError: (error: any) => {
      toast.error(`Failed to stop session: ${error?.message ?? 'Unknown error'}`)
    },
  })

  const handleStartSession = () => {
    let parsedRules

    try {
      const parsed = JSON.parse(ruleJson)
      parsedRules = Array.isArray(parsed) ? parsed : [parsed]
    } catch (err) {
      toast.error('Invalid JSON strategy definition')
      return
    }

    void startSessionMutation.mutateAsync({
      name: sessionLabel || `Session ${new Date().toLocaleTimeString()}`,
      ownerId: null,
      rules: parsedRules,
    })
  }

  const handleStopSession = (sessionId: string) => {
    void stopSessionMutation.mutateAsync({ sessionId })
  }

  // Fetch all stocks for dropdown
  const { data: allStocks, isLoading: isLoadingStocks, error: stocksError } = useQuery({
    queryKey: ['all-stocks'],
    queryFn: () => getAllStocks(),
  })

  // Synchronization: If no symbol selected, or selected symbol disappeared, pick the first available
  useMemo(() => {
    if (!allStocks || allStocks.length === 0) return;

    // If no symbol selected yet, pick the first one
    if (!selectedSymbol) {
      setSelectedSymbol(allStocks[0].symbol);
      return;
    }

    // If selected symbol is no longer in the list (e.g. after a re-seed), pick the first one
    const exists = allStocks.some(s => s.symbol === selectedSymbol);
    if (!exists) {
      setSelectedSymbol(allStocks[0].symbol);
    }
  }, [allStocks, selectedSymbol]);

  // Fetch data for selected stock
  const { data, isLoading: isLoadingMarket } = useQuery({
    queryKey: ['boerse-data', selectedSymbol, timespan],
    queryFn: () => getMarketData({ data: { symbol: selectedSymbol!, timespan } }),
    refetchInterval: 1000,
    enabled: !!selectedSymbol
  })

  // Filter bots
  const filteredBots = useMemo(() => {
    if (!data || !data.botPortfolios) return []
    let result = [...data.botPortfolios];

    // Filter by user ownership if checkbox is not checked
    if (!showOtherUsersBots && user?.id) {
      result = result.filter((b: any) => b.user_id === user.id)
    }

    if (filterText) {
      const lower = filterText.toLowerCase()
      result = result.filter((b: any) =>
        (b.trader_name || '').toLowerCase().includes(lower) ||
        (b.strategy || '').toLowerCase().includes(lower)
      )
    }

    return result;
  }, [data, filterText, showOtherUsersBots, user?.id])

  // Pre-process chart data to include timestamps as numbers for Recharts
  const chartData = useMemo(() => {
    if (!data) return [];

    let points: any[] = [];

    if (data.trades && data.trades.length > 0) {
      points = data.trades.map((t: any) => ({
        ...t,
        // Convert executed_at string to timestamp number for proper XAxis spacing
        timestamp: new Date(t.executed_at).getTime(),
        price: Number(t.execution_price_cents)
      }));
    } else if (data.stock) {
      // No trades, use stock current price
      const currentOption = timespanOptions.find(o => o.value === timespan);
      const ms = currentOption?.ms || 5 * 60 * 1000;

      points = [{
        timestamp: currentTick - ms,
        price: Number(data.stock.current_price_cents),
        executed_at: new Date(currentTick - ms).toISOString(),
        execution_price_cents: data.stock.current_price_cents
      }];
    }

    // Extend line backwards to start of view if needed
    if (points.length > 0) {
      const currentOption = timespanOptions.find(o => o.value === timespan);
      const ms = currentOption?.ms || 5 * 60 * 1000;
      const startTime = currentTick - ms;
      const firstPoint = points[0];

      if (firstPoint.timestamp > startTime) {
        points.unshift({
          ...firstPoint,
          timestamp: startTime
        });
      }
    }

    // Add a live point at the current time to extend the line
    if (points.length > 0) {
      const lastPoint = points[points.length - 1];
      // Only extend if current time is ahead of last point
      if (currentTick > lastPoint.timestamp) {
        points.push({
          ...lastPoint, // Copy the last point's data
          timestamp: currentTick, // Update time to now
          // Price remains the same
        });
      }
    }

    return points;
  }, [data, currentTick, timespan]);

  // Calculate high/low for the current view
  const { high, low } = useMemo(() => {
    if (chartData.length === 0) return { high: 0, low: 0 };
    const prices = chartData.map((d: any) => d.price);
    return {
      high: Math.max(...prices) / 100,
      low: Math.min(...prices) / 100
    };
  }, [chartData]);

  // Calculate XAxis domain to handle "empty start" requirement
  // Calculate stable domain and fixed ticks to prevent "moving" x-axis text
  const { xAxisDomain, xAxisTicks } = useMemo(() => {
    // Snap to nearest second to avoid jitter
    const now = Math.floor(currentTick / 1000) * 1000;
    const currentOption = timespanOptions.find(o => o.value === timespan);
    const ms = currentOption?.ms || 10 * 60 * 1000;
    const start = now - ms;

    // Fixed 5 ticks for consistency
    return {
      xAxisDomain: [start, now] as [number, number],
      xAxisTicks: [
        start,
        start + ms * 0.25,
        start + ms * 0.5,
        start + ms * 0.75,
        now
      ]
    };
  }, [timespan, currentTick]); // Sync updates with clock

  // 1. Loading State
  if (isLoadingStocks) {
    return <LoadingState message="Initializing Exchange..." />
  }

  // 2. Query Error State
  if (stocksError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50/50 dark:bg-slate-950/50">
        <div className="max-w-md w-full bg-card p-10 rounded-[2.5rem] border shadow-2xl text-center space-y-8 relative overflow-hidden">
          <div className="absolute -top-12 -right-12 p-8 opacity-[0.03] rotate-12">
            <AlertTriangle size={200} />
          </div>

          <div className="relative z-10 space-y-6">
            <div className="bg-red-500/10 p-5 rounded-3xl w-fit mx-auto">
              <AlertTriangle className="h-10 w-10 text-red-500" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Database Connection Error</h2>
              <p className="text-muted-foreground font-medium text-sm leading-relaxed">
                Unable to load market data. Please check your database connection and try again.
              </p>
              <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded mt-4">
                {stocksError.message}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 3. Empty State (No Stocks Found)
  if (!allStocks || allStocks.length === 0) {
    return <EmptyState />
  }

  // 3. Waiting for Market Data
  if (!data || isLoadingMarket) {
    return <LoadingState message={`Connecting to ${selectedSymbol || 'Market'}...`} />
  }

  const { stock, trades, orders, botPortfolios, recentBotOrders } = data
  const currentPrice = Number(stock.current_price_cents) / 100
  const lastTrade = trades[trades.length - 1]

  const startPrice = trades.length > 0 ? Number(trades[0].execution_price_cents) : Number(stock.current_price_cents)
  const endPrice = trades.length > 0 ? Number(lastTrade.execution_price_cents) : Number(stock.current_price_cents)
  const isUp = endPrice >= startPrice



  const formatXAxis = (tick: number) => {
    const date = new Date(tick);
    if (timespan === '1d') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (timespan === '1h') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // Helper to get bot's last action
  const getBotLastAction = (traderId: string) => {
    const botOrder = recentBotOrders.find(order => order.trader_id === traderId)
    return botOrder ? {
      type: botOrder.type,
      quantity: botOrder.quantity,
      price: Number(botOrder.limit_price_cents) / 100,
      status: botOrder.status
    } : null
  }

  // Calculate Order Book Depth for background bars
  const bidOrders = orders
    .filter((o: any) => o.type === 'BUY')
    .sort((a: any, b: any) => Number(b.limit_price_cents) - Number(a.limit_price_cents));

  const askOrders = orders
    .filter((o: any) => o.type === 'SELL')
    .sort((a: any, b: any) => Number(a.limit_price_cents) - Number(b.limit_price_cents));

  const maxBidQty = Math.max(...bidOrders.map((o: any) => o.quantity), 1);
  const maxAskQty = Math.max(...askOrders.map((o: any) => o.quantity), 1);



  return (
    <div className="min-h-screen bg-background p-3 md:p-8 overflow-x-hidden">
      <div className="max-w-[1600px] w-full mx-auto space-y-8 md:space-y-12">

        {/* TOP SECTION: CHART & ORDER BOOK */}
        <div className="space-y-12">

          {/* LEFT: PRICE HISTORY CHART */}
          <div className="h-[450px] flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-4 mb-8">
              <div className="flex flex-wrap items-center gap-4 md:gap-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/5 rounded-full">
                    <TrendingUp size={20} className="text-primary" />
                  </div>
                  <h2 className="text-lg font-bold tracking-tight">Price History</h2>
                </div>

                <div className="h-4 w-px bg-border/50" />

                <StockSelector
                  selectedSymbol={selectedSymbol}
                  setSelectedSymbol={setSelectedSymbol}
                  allStocks={allStocks}
                  isStockDropdownOpen={isStockDropdownOpen}
                  setIsStockDropdownOpen={setIsStockDropdownOpen}
                />
              </div>

              <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
                <div className="hidden xl:flex items-center gap-6 text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  <div className="flex items-baseline gap-2">
                    <span className="opacity-50">High</span>
                    <span className="text-foreground font-mono text-sm">${high.toFixed(2)}</span>
                  </div>
                  <div className="h-3 w-px bg-border/50" />
                  <div className="flex items-baseline gap-2">
                    <span className="opacity-50">Low</span>
                    <span className="text-foreground font-mono text-sm">${low.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 pl-6 border-l border-border/50">
                  <div className={`text-2xl font-mono font-black tracking-tighter ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                    ${currentPrice.toFixed(2)}
                  </div>
                  <div className={`flex items-center gap-1 font-bold text-xs px-2.5 py-1 rounded-full ${isUp ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                    {isUp ? <ArrowUp size={12} strokeWidth={3} /> : <ArrowDown size={12} strokeWidth={3} />}
                    {(Math.abs(1 - (startPrice / endPrice)) * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-row gap-6 min-h-0 relative">
              <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-4">
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.05} />
                      <XAxis
                        dataKey="timestamp"
                        type="number"
                        domain={xAxisDomain}
                        ticks={xAxisTicks}
                        tick={({ x, y, payload }) => (
                          <text x={x} y={y} dy={16} textAnchor="middle" className="text-muted-foreground fill-current text-[10px] font-medium font-mono">
                            {formatXAxis(payload.value)}
                          </text>
                        )}
                        axisLine={false}
                        tickLine={false}
                        allowDataOverflow={true}
                        padding={{ right: 40 }}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        padding={{ top: 20, bottom: 20 }}
                        tick={({ x, y, payload }) => (
                          <text x={x} y={y} dx={-12} dy={4} textAnchor="end" className="text-muted-foreground fill-current text-[11px] font-medium font-mono">
                            {`$${(payload.value / 100).toFixed(0)}`}
                          </text>
                        )}
                        axisLine={false}
                        tickLine={false}
                        width={45}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const p = payload[0].payload;
                            return (
                              <div className="bg-background/95 backdrop-blur-md border border-border/50 shadow-xl rounded-lg p-3 min-w-[140px]">
                                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                                  <Clock size={10} />
                                  {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-sm font-bold font-mono">
                                    ${(Number(p.price) / 100).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke={isUp ? "#10b981" : "#ef4444"}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorPrice)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* MOBILE TIMESPAN PICKER */}
                <TimespanPicker timespan={timespan} setTimespan={setTimespan} isMobile={true} />
              </div>

              {/* VERTICAL TIMESPAN PICKER */}
              <TimespanPicker timespan={timespan} setTimespan={setTimespan} isMobile={false} />
            </div>
          </div>

          {/* SEPARATOR */}
          <div className="h-px w-full bg-border/50" />

          {/* RIGHT: ORDER BOOK */}
          <OrderBook
            bidOrders={bidOrders}
            askOrders={askOrders}
            maxBidQty={maxBidQty}
            maxAskQty={maxAskQty}
          />

        </div>

        {/* SEPARATOR */}
        <div className="h-px w-full bg-border/50" />

        {/* BOT FLEET SECTION */}
        <div className="space-y-8">
          <BotFleetControls
            filteredBotsCount={filteredBots.length}
            filterText={filterText}
            setFilterText={setFilterText}
            showOtherUsersBots={showOtherUsersBots}
            setShowOtherUsersBots={setShowOtherUsersBots}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />

          <div className="min-h-[300px]">
            {viewMode === 'grid' ? (
              <BotGridView
                filteredBots={filteredBots}
                getBotLastAction={getBotLastAction}
                stockSymbol={stock.symbol}
                currentUserId={user?.id}
              />
            ) : (
              <BotListView
                filteredBots={filteredBots}
                getBotLastAction={getBotLastAction}
                stockSymbol={stock.symbol}
                currentUserId={user?.id}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/_app/live-exchange/')({
  component: BoersePage,
})