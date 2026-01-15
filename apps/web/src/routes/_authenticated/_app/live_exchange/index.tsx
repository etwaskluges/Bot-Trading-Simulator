import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery } from '@tanstack/react-query'
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
import { ArrowUp, ArrowDown, TrendingUp, Bot, Activity, Clock, Loader2, Database, ArrowRight } from 'lucide-react'
import { useState, useMemo } from 'react'

type Timespan = '5m' | '10m' | '1h' | '1d';

const timespanOptions: { value: Timespan; label: string; ms: number }[] = [
  { value: '5m', label: '5m', ms: 5 * 60 * 1000 },
  { value: '10m', label: '10m', ms: 10 * 60 * 1000 },
  { value: '1h', label: '1H', ms: 60 * 60 * 1000 },
  { value: '1d', label: '1D', ms: 24 * 60 * 60 * 1000 },
];

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
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 2) * 2)`; // 5s buckets
        break;
      case '10m':
        intervalValue = sql`now() - interval '10 minutes'`;
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 5) * 5)`; // 5s buckets
        break;
      case '1h':
        intervalValue = sql`now() - interval '1 hour'`;
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 30) * 30)`; // 30s buckets
        break;
      case '1d':
        intervalValue = sql`now() - interval '1 day'`;
        bucketSql = sql`to_timestamp(floor(extract(epoch from ${schema.trades.executed_at}) / 300) * 300)`; // 5m buckets
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
      })
      .from(schema.traders)
      .innerJoin(schema.portfolios, eq(schema.traders.id, schema.portfolios.trader_id))
      .where(
        and(
          eq(schema.traders.is_bot, true),
          eq(schema.portfolios.stock_id, stock.id)
        )
      )
      .orderBy(schema.traders.name)

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

// 3. PAGE COMPONENT
const BoersePage = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [timespan, setTimespan] = useState<Timespan>('5m')

  // Fetch all stocks for dropdown
  const { data: allStocks, isLoading: isLoadingStocks } = useQuery({
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

  // Pre-process chart data to include timestamps as numbers for Recharts
  const chartData = useMemo(() => {
    if (!data?.trades) return [];
    return data.trades.map((t: any) => ({
      ...t,
      // Convert executed_at string to timestamp number for proper XAxis spacing
      timestamp: new Date(t.executed_at).getTime(),
      price: Number(t.execution_price_cents)
    }));
  }, [data?.trades]);

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
    const now = Math.floor(Date.now() / 1000) * 1000;
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
  }, [timespan, data]); // Sync updates with data fetches to keep the axis sliding

  // 1. Loading State
  if (isLoadingStocks) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50/50 dark:bg-slate-950/50">
        <Activity className="h-10 w-10 text-primary animate-spin" />
        <p className="font-bold text-lg uppercase opacity-50">Initializing Exchange...</p>
      </div>
    )
  }

  // 2. Empty State (No Stocks Found)
  if (!allStocks || allStocks.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50/50 dark:bg-slate-950/50">
        <div className="max-w-md w-full bg-card p-10 rounded-[2.5rem] border shadow-2xl text-center space-y-8 relative overflow-hidden">
          {/* Decorative background element */}
          <div className="absolute -top-12 -right-12 p-8 opacity-[0.03] rotate-12">
            <TrendingUp size={200} />
          </div>

          <div className="relative z-10 space-y-6">
            <div className="bg-primary/10 p-5 rounded-3xl w-fit mx-auto group-hover:scale-110 transition-transform duration-500">
              <Database className="h-10 w-10 text-primary" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Exchange Offline</h2>
              <p className="text-muted-foreground font-medium text-sm leading-relaxed">
                The market is currently empty. You need to initialize the asset catalog and bot fleet before you can access the live exchange.
              </p>
            </div>

            <div className="pt-2">
              <Link
                to="/seeding_area"
                className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:scale-[1.02] active:scale-95 transition-all shadow-lg hover:shadow-primary/25"
              >
                Go to Seeding Area
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 3. Waiting for Market Data
  if (!data || isLoadingMarket) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50/50 dark:bg-slate-950/50">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <p className="font-bold text-lg uppercase opacity-50 text-center">
          Connecting to {selectedSymbol || 'Market'}...
        </p>
      </div>
    )
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
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/50 p-6 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-4 bg-card p-6 rounded-2xl border shadow-lg h-[450px] flex flex-col transition-all duration-300 relative overflow-hidden">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-primary/10 rounded-lg">
                    <TrendingUp size={16} className="text-primary" />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] whitespace-nowrap hidden sm:block">
                    Price History
                  </span>
                </div>

                <div className="h-6 w-px bg-border hidden md:block" />

                <div className="relative">
                  <select
                    id="stock-select"
                    value={selectedSymbol || ''}
                    onChange={(e) => setSelectedSymbol(e.target.value)}
                    className="pl-2 pr-8 py-1.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 text-[13px] font-semibold min-w-[180px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all appearance-none cursor-pointer tracking-tight"
                  >
                    {allStocks.map((stock: any) => (
                      <option key={stock.symbol} value={stock.symbol}>
                        {stock.symbol} — {stock.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                    <ArrowDown size={12} />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="hidden lg:flex items-center gap-4 text-[9px] font-black text-muted-foreground uppercase tracking-wider">
                  <div className="flex items-baseline gap-1.5">
                    <span className="opacity-40">H:</span>
                    <span className="text-foreground/60 font-mono font-bold text-xs">${high.toFixed(2)}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="opacity-40">L:</span>
                    <span className="text-foreground/60 font-mono font-bold text-xs">${low.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className={`text-xl font-mono font-black tracking-tighter ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                    ${currentPrice.toFixed(2)}
                  </div>
                  <div className={`flex items-center gap-1 font-bold text-xs px-2 py-1 rounded-lg ${isUp ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                    {isUp ? <ArrowUp size={12} strokeWidth={3} /> : <ArrowDown size={12} strokeWidth={3} />}
                    {(Math.abs(1 - (startPrice / endPrice)) * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-row gap-4 min-h-0 relative">
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 40, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0.4} />
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
                        <text x={x} y={y} dy={12} textAnchor="middle" className="text-muted-foreground fill-current text-[10px] font-medium">
                          {formatXAxis(payload.value)}
                        </text>
                      )}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      allowDataOverflow={true}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      padding={{ top: 20, bottom: 20 }}
                      tick={({ x, y, payload }) => (
                        <text x={x} y={y} dx={-12} dy={4} textAnchor="end" className="text-muted-foreground fill-current text-[11px] font-medium">
                          {`$${(payload.value / 100).toFixed(0)}`}
                        </text>
                      )}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const p = payload[0].payload;
                          return (
                            <div className="bg-background/95 backdrop-blur-md border border-border shadow-2xl rounded-xl p-3 min-w-[140px] animate-in fade-in zoom-in duration-200">
                              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Clock size={10} />
                                {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-bold font-mono">
                                  ${(Number(p.price) / 100).toFixed(2)}
                                </span>
                                <span className="text-[9px] text-muted-foreground font-medium uppercase">Price Point</span>
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

              {/* VERTICAL TIMESPAN PICKER */}
              <div className="flex flex-col gap-1 p-1 bg-muted/20 backdrop-blur-sm rounded-2xl border border-border/30 h-fit self-center">
                {timespanOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTimespan(opt.value)}
                    className={`px-3 py-2.5 text-[10px] font-black rounded-xl transition-all flex flex-col items-center gap-1 min-w-[48px] ${timespan === opt.value
                      ? 'bg-background shadow-md text-primary scale-105 border border-border/50'
                      : 'text-muted-foreground/60 hover:text-foreground hover:bg-background/40'
                      }`}
                  >
                    <span className="uppercase tracking-tighter">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* FULL WIDTH: ORDER BOOK */}
          <div className="lg:col-span-4 bg-card p-6 rounded-2xl border shadow-lg h-[450px] flex flex-col transition-all duration-300 relative overflow-hidden">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-primary/10 rounded-lg">
                  <Clock size={16} className="text-primary" />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] whitespace-nowrap">
                  Order Book
                </span>
              </div>
              <span className="text-[9px] font-bold text-primary/40 bg-primary/5 px-2 py-0.5 rounded-full tracking-normal">LIVE DEPTH</span>
            </div>

            <div className="flex-1 min-h-0 relative z-10 transition-all overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 h-full">
                {/* BIDS (BUYS) - Left Side */}
                <div className="flex flex-col h-full min-h-0">
                  <div className="flex items-center justify-between px-2 mb-4 shrink-0">
                    <div className="text-[10px] uppercase font-bold text-emerald-500 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Bids (Buy)
                    </div>
                    <span className="text-[10px] text-muted-foreground/50 font-semibold uppercase">Volume & Price</span>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted space-y-1.5">
                    {bidOrders.length === 0 ? (
                      <div className="p-10 border-2 border-dashed border-emerald-500/10 rounded-2xl flex items-center justify-center text-muted-foreground font-medium italic text-sm">
                        Waiting for buy liquidity...
                      </div>
                    ) : (
                      bidOrders.map((order: any) => (
                        <div
                          key={order.id}
                          className="group relative flex items-center justify-between p-2.5 rounded-lg border border-emerald-500/5 bg-emerald-500/[0.01] hover:bg-emerald-500/[0.04] transition-all duration-200 overflow-hidden"
                        >
                          {/* Depth Bar */}
                          <div
                            className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 pointer-events-none transition-all duration-500"
                            style={{ width: `${(order.quantity / maxBidQty) * 100}%` }}
                          />

                          <div className="flex items-center gap-3 relative z-10">
                            <div className="bg-emerald-500/10 p-1 rounded-md">
                              <ArrowUp size={10} className="text-emerald-500 stroke-[3]" />
                            </div>
                            <div>
                              <div className="text-[10px] font-bold font-mono">
                                {order.quantity} <span className="opacity-40 font-medium">QTY</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right relative z-10">
                            <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                              ${(Number(order.limit_price_cents) / 100).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* ASKS (SELLS) - Right Side */}
                <div className="flex flex-col h-full min-h-0">
                  <div className="flex items-center justify-between px-2 mb-4 shrink-0">
                    <div className="text-[10px] uppercase font-bold text-red-500 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      Asks (Sell)
                    </div>
                    <span className="text-[10px] text-muted-foreground/50 font-semibold uppercase">Volume & Price</span>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted space-y-1.5">
                    {askOrders.length === 0 ? (
                      <div className="p-10 border-2 border-dashed border-red-500/10 rounded-2xl flex items-center justify-center text-muted-foreground font-medium italic text-sm">
                        Waiting for sell liquidity...
                      </div>
                    ) : (
                      askOrders.map((order: any) => (
                        <div
                          key={order.id}
                          className="group relative flex items-center justify-between p-2.5 rounded-lg border border-red-500/5 bg-red-500/[0.01] hover:bg-red-500/[0.04] transition-all duration-200 overflow-hidden"
                        >
                          {/* Depth Bar */}
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-red-500/10 pointer-events-none transition-all duration-500"
                            style={{ width: `${(order.quantity / maxAskQty) * 100}%` }}
                          />

                          <div className="flex items-center gap-3 relative z-10">
                            <div className="bg-red-500/10 p-1 rounded-md">
                              <ArrowDown size={10} className="text-red-500 stroke-[3]" />
                            </div>
                            <div>
                              <div className="text-[10px] font-bold font-mono">
                                {order.quantity} <span className="opacity-40 font-medium">QTY</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right relative z-10">
                            <div className="text-sm font-bold font-mono text-red-600 dark:text-red-400">
                              ${(Number(order.limit_price_cents) / 100).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTS SECTION */}
        <div className="bg-card p-6 rounded-2xl border shadow-lg space-y-6">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Bot size={16} className="text-primary" />
              </div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] whitespace-nowrap">
                Bot Fleet
              </span>
            </div>
            <div className="text-[10px] px-3 py-1 bg-primary/10 text-primary rounded-full font-bold flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
              LIVE SIMULATION
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {botPortfolios.map((bot: any) => {
              const lastAction = getBotLastAction(bot.trader_id)

              return (
                <div
                  key={bot.trader_id}
                  className="group p-4 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-all duration-300 hover:border-primary/30 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform">
                    <Bot className="h-12 w-12" />
                  </div>

                  <div className="flex items-start justify-between mb-3 relative">
                    <div>
                      <h3 className="font-bold text-base group-hover:text-primary transition-colors flex items-center gap-2">
                        {bot.trader_name.replace(' Bot ', ' #')}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">{bot.strategy || 'Momentum'} Engine</p>
                    </div>
                  </div>

                  <div className="space-y-4 text-sm relative">
                    <div className="grid grid-cols-2 gap-4 pb-3 border-b border-dashed border-muted-foreground/20">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground font-bold uppercase text-[8px] tracking-wider mb-0.5">CASH</span>
                        <span className="font-mono text-base font-bold text-primary">${(Number(bot.balance_cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-muted-foreground font-bold uppercase text-[8px] tracking-wider mb-0.5 text-right">HOLDINGS</span>
                        <div className="flex items-baseline gap-1">
                          <span className="font-mono text-base font-bold">{bot.shares_owned}</span>
                          <span className="text-[8px] text-muted-foreground font-bold uppercase">qty</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Latest Operation</span>
                        <div className="h-px flex-1 bg-muted-foreground/10 mx-3" />
                      </div>
                      {lastAction ? (
                        <div className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-colors ${lastAction.status === 'CANCELLED'
                          ? 'bg-slate-500/[0.03] border-slate-500/10 text-slate-700 dark:text-slate-400'
                          : lastAction.type === 'BUY'
                            ? 'bg-emerald-500/[0.03] border-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-500/[0.03] border-red-500/10 text-red-700 dark:text-red-400'
                          }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-black text-[10px] uppercase tracking-wide">
                              {lastAction.status === 'CANCELLED' ? (
                                <>
                                  <Activity size={12} className="stroke-[3]" />
                                  Cancel {lastAction.type}
                                </>
                              ) : (
                                <>
                                  {lastAction.type === 'BUY' ? <ArrowUp size={12} className="stroke-[3]" /> : <ArrowDown size={12} className="stroke-[3]" />}
                                  Limit {lastAction.type}
                                </>
                              )}
                            </div>
                            <span className="font-bold font-mono text-[10px] opacity-60">
                              {lastAction.quantity} SHARES
                            </span>
                          </div>
                          <div className="flex justify-between items-end font-mono">
                            <span className={`text-lg font-black leading-none ${lastAction.status === 'CANCELLED' ? 'line-through opacity-30 italic' : ''}`}>
                              ${lastAction.price.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl border border-dashed border-muted-foreground/10 bg-muted/10 flex items-center justify-center">
                          <p className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-widest flex items-center gap-2">
                            <Clock size={12} className="animate-spin-slow" /> Awaiting Signal...
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/_app/live_exchange/')({
  component: BoersePage,
})